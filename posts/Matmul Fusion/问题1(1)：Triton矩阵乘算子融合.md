---
title: 问题1(1)：Triton矩阵乘算子融合
cover: false
categories:
  - Matmul Fusion
---

# 问题1(1)：Triton矩阵乘算子融合
>[!explain] 完成第一题的大致思路与代码实现

## 思路与前置知识
这个任务可以这么理解，这个矩阵乘法相加也就是LoRA的思想，下图是GPT-5.4给我的解释。
![[answer of gpt.png|500]]
然后再对应看一下下面这个题目描述，大概就知道里面每一步是做什么的了。
```
输入 X: [M, H]
 算子1 (降维): Y = X @ A          其中 A: [H, r], Y: [M, r] 
 算子2 (升维): Z = Y @ B          其中 B: [r, H'], Z: [M, H'] 
 算子3 (主干): W = X @ C         其中 C: [H, H'], W: [M, H'] 
 最终输出: O = W + Z 即 O: [M, H']
 O=X @ C+X @ A @ B
```
- 降维升维的AB其实就是LoRA算子，分别可以记为LoRA-A，LoRA-B
- 主干的乘法其实是大权重矩阵的乘法
- 最终输出就是训练过程的实际计算。
所以这里让我融合算子2、3，也就是做一个算子$O=X \cdot C + Y\cdot B$
其中`Y=X@A`是提前算好的.

BTW，这里解释下SGLang 会把原本 checkpoint 里的 gate_proj 和 up_proj 都归一化到 gate_up_proj 这个 fused 名字上：所以只有gate_up这一个参数，也就是题目问的`gateup_proj`
大致的融合思路：在主干GEMM kernel的每个thread block完成对应tile的计算后，将升维矩阵乘对应tile的结果直接累加到输出上，避免中间结果经过HBM
>[!note]
>**HBM = High Bandwidth Memory，高带宽显存。**
在 GPU 里，它通常就是我们说的 **global memory / GPU 显存**。例如 A100、H100 上的显存就是 HBM。

对应来说，就相当于不要算出完整的Z矩阵，而是分块计算到tile的粒度时就加在最终结果O上。

所以开始实现，三个步骤的完成如下
## 实现步骤
### Step 1
选用的参数为`M=64, H=4096, N=28672, r=8`，也就是在一次batch为64的条件下进行
参数来源是Llama3-8B在huggingface上模型的[config.json](https://huggingface.co/meta-llama/Llama-3.1-8B/blob/main/config.json)

| 符号 | 数值 | 含义 |
| --- | ---: | --- |
| `M` | `64` | batch size，等价于一次输入的 token / row 数 |
| `K` | `4096` | 输入 hidden dimension，也就是 `hidden_size` |
| `N` | `28672` | `gateup_proj` 的 fused 输出维度 |
| `r` | `8` | 低秩分解的 rank，不来自 config，是题目给定的降维秩 |
#### utils
写了几个函数后面计算和比较使用，第一个是计算TFLOPS，根据 GEMM 公式估算 TFLOPS（Tera Floating Point Operations Per Second），也就是每秒做多少次浮点运算。
```python
def tflops(m: int, n: int, k: int, ms: float) -> float:
    seconds = ms * 1e-3
    return 2.0 * m * n * k / seconds / 1e12
```
标准 GEMM 是：`C = A @ B`，如果：`A: [M, K]B: [K, N]C: [M, N]`，那么输出矩阵 `C` 有：`M * N`个元素。每个元素都要做一次长度为 `K` 的点积：
`C[i, j] = A[i, 0] * B[0, j]  + A[i, 1] * B[1, j]        + ...        + A[i, K-1] * B[K-1, j]`
每个输出元素大约需要：K 次乘法 + K 次加法 ≈ 2K 次浮点运算。所以总计算量是：`FLOPs = 2 * M * N * K`

然后是用CUDA Event 统计一段 GPU 计算的耗时，写一个`measure_cuda_time`函数，用于计算时间：
```python
def measure_cuda_time(    title: str,    fn: Callable[[], torch.Tensor],    warmup: int,    repeat: int,) -> TimingResult
    with torch.no_grad():
        for _ in tqdm(range(warmup), desc=f"{title} warmup", leave=False):
            fn()
        torch.cuda.synchronize()

        elapsed_ms: list[float] = []
        for _ in tqdm(range(repeat), desc=f"{title} bench", leave=False):
            start = torch.cuda.Event(enable_timing=True)
            end = torch.cuda.Event(enable_timing=True)
            start.record()
            fn()
            end.record()
            torch.cuda.synchronize()
            elapsed_ms.append(start.elapsed_time(end))

    sorted_ms = sorted(elapsed_ms)
    p20_idx = int(0.2 * (len(sorted_ms) - 1))
    p80_idx = int(0.8 * (len(sorted_ms) - 1))
    return TimingResult(
        median_ms=statistics.median(sorted_ms),
        p20_ms=sorted_ms[p20_idx],
        p80_ms=sorted_ms[p80_idx],

```
warmup 只负责把 kernel 与 allocator 预热到稳定状态，repeat 才是最终记入统计的正式测量。
#### 具体实现
放入脚本中第一步是使用torch的标准实现，所以定义几个标准函数。
```python
def compute_lora_down(x: torch.Tensor, a: torch.Tensor) -> torch.Tensor:
    """算子1：Y = X @ A。"""
    return x @ a


def compute_lora_expand(y: torch.Tensor, b: torch.Tensor) -> torch.Tensor:
    """算子2：Z = Y @ B。"""
    return y @ b


def compute_main_matmul(x: torch.Tensor, c: torch.Tensor) -> torch.Tensor:
    """算子3：W = X @ C。"""
    return x @ c


def compute_output_add(w: torch.Tensor, z: torch.Tensor) -> torch.Tensor:
    """最终输出：O = W + Z。"""
    return w + z
```
然后用下面的方法记录最终时间
```python
op1 = measure_cuda_time("op1: Y = X @ A", run_op1_once, args.warmup, args.repeat)
op2 = measure_cuda_time("op2: Z = Y @ B", run_op2_once, args.warmup, args.repeat)
op3 = measure_cuda_time("op3: W = X @ C", run_op3_once, args.warmup, args.repeat)
add = measure_cuda_time("add: O = W + Z", run_add_once, args.warmup, args.repeat)
full = measure_cuda_time("full: O = X@C + (X@A)@B", run_full_once, args.warmup, args.repeat)

total_split_ms = op1.median_ms + op2.median_ms + op3.median_ms + add.median_m
```
### Step 2
第二步是实现一个与triton教程一致的matmul kernel，然后用这个kernel与cuBLAS的matmul进行比较
```python
def run_cublas_once() -> torch.Tensor:
    return x @ c

def run_triton_once() -> torch.Tensor:
    return triton_matmul(x, c)
```
自己定义一个`triton_matmul`，作为一个Python wrapper：检查输入、分配输出、启动 Triton kernel，这个kernel 基于 Triton 官方 matmul 教程整理 autotune 配置，几乎与官方代码一致。
```python
cublas = measure_cuda_time("cuBLAS: X @ C", run_cublas_once, args.warmup, args.repeat)
triton = measure_cuda_time("Triton: X @ C", run_triton_once, args.warmup, args.repeat)
```
然后就可以通过我们之前书写的measure函数比较时间。

### Step 3
这一步要书写融合算子
#### 融合算子声明
因为看一下主干算子`W = X @ C `是参数中带三个矩阵的地址，我们的` O=X @ C+Y@ B`算子应该带着5个参数，5个矩阵的地址。具体定义应该如下
```python
@triton.jit
def _fused_matmul_expand_kernel(
    x_ptr,  # 输入矩阵 X 的首地址，形状为 [M, K]
    c_ptr,  # 主干权重矩阵 C 的首地址，形状为 [K, N]
    y_ptr,  # LoRA 中间结果矩阵 Y 的首地址，形状为 [M, R]
    b_ptr,  # LoRA expand 权重矩阵 B 的首地址，形状为 [R, N]
    o_ptr,  # 输出矩阵 O 的首地址，形状为 [M, N]
    M: tl.constexpr,  # 输出行数，也是 X / Y / O 的第 0 维
    N: tl.constexpr,  # 输出列数，也是 C / B / O 的第 1 维
    K: tl.constexpr,  # 主干 GEMM 的 reduction 维，对应 X 的列数与 C 的行数
    R: tl.constexpr,  # LoRA expand 的 reduction 维，对应 Y 的列数与 B 的行数
    stride_xm: tl.constexpr,  # X 沿第 0 维（行方向）的 stride
    stride_xk: tl.constexpr,  # X 沿第 1 维（K 方向）的 stride
    stride_ck: tl.constexpr,  # C 沿第 0 维（K 方向）的 stride
    stride_cn: tl.constexpr,  # C 沿第 1 维（列方向）的 stride
    stride_ym: tl.constexpr,  # Y 沿第 0 维（行方向）的 stride
    stride_yr: tl.constexpr,  # Y 沿第 1 维（R 方向）的 stride
    stride_br: tl.constexpr,  # B 沿第 0 维（R 方向）的 stride
    stride_bn: tl.constexpr,  # B 沿第 1 维（列方向）的 stride
    stride_om: tl.constexpr,  # O 沿第 0 维（行方向）的 stride
    stride_on: tl.constexpr,  # O 沿第 1 维（列方向）的 stride
    BLOCK_SIZE_M: tl.constexpr,  # 单个 program 在 M 方向一次处理多少行
    BLOCK_SIZE_N: tl.constexpr,  # 单个 program 在 N 方向一次处理多少列
    BLOCK_SIZE_K: tl.constexpr,  # 两个 reduction 循环共用的分块深度
    GROUP_SIZE_M: tl.constexpr,  # program id 分组参数，用于提升 L2 cache 命中
)
```
#### 算子实现
总体逻辑应该是先算主干 GEMM，再把 expand 分支累加到同一个输出 tile，在kernel中写分别的两个循环处理主干和expand，两个分支虽然 reduction 维度不同，但都写到同一个 `[BLOCK_M, BLOCK_N]` 输出 tile。
* 主干 GEMM 的 reduction 维度是 `K`，比如 `4096`
* LoRA expand 的 reduction 维度是 `r`，比如 `8`
* 但是他们的结果会输出到同一个形状相同的矩阵，`[M,N]`。然后他们的每一次计算都应该输出到同一个tile:`[[BLOCK_M, BLOCK_N]]`。

##### **tile 准备**
开头处一些参数的解释
- grid大小为`grid = (num_pid_m * num_pid_n,)`，每个program 负责一个`BLOCK_SIZE_M × BLOCK_SIZE_N`，
- `(pid_m, pid_n)`是pid映射到二维的坐标，由于使用了group，这是通过`group_id`计算而得来的。这里的准备与[I.Matmul学习笔记](<I.Matmul学习笔记.md>)中讲到的一致
- 也就是说，当前 program 负责`(pid_m, pid_n)`坐标处的矩阵计算，换算为矩阵写法就是
```python
O[
    pid_m * BLOCK_SIZE_M : (pid_m + 1) * BLOCK_SIZE_M,
    pid_n * BLOCK_SIZE_N : (pid_n + 1) * BLOCK_SIZE_N
]
```
- 接着是`offsets`，这就是用于加载对应的块地址的偏移量。四个偏移量可以分别对应四个维度需要加的量。
```python
offs_m = pid_m * BLOCK_SIZE_M + tl.arange(0, BLOCK_SIZE_M)  
offs_n = pid_n * BLOCK_SIZE_N + tl.arange(0, BLOCK_SIZE_N)
offs_k = tl.arange(0, BLOCK_SIZE_K)
offs_r = tl.arange(0, BLOCK_SIZE_K)
```
- 通过这拿到的四个offset，就可以把对应的四个矩阵的四个 pointer tensor拿到。每一个的大小都是对应tile的block大小，依据广播后变成一个小矩阵的地址指针
```python
x_ptrs = x_ptr + offs_m[:, None] * stride_xm + offs_k[None, :] * stride_xk
c_ptrs = c_ptr + offs_k[:, None] * stride_ck + offs_n[None, :] * stride_c
y_ptrs = y_ptr + offs_m[:, None] * stride_ym + offs_r[None, :] * stride_yr
b_ptrs = b_ptr + offs_r[:, None] * stride_br + offs_n[None, :] * stride_b
```
- 最后定义一个用于累计结果的变量，形状与最后输出一致，后续循环每一次相加会加在其中。
```python
accumulator = tl.zeros((BLOCK_SIZE_M, BLOCK_SIZE_N), dtype=tl.float32)
```

##### **两次循环**
- 主干算子：
```python
X: [M, K]  
C: [K, N]  
O1 = X @ C: [M, N]
```
循环沿着K方向扫一遍tile，每次加载一个小块`BLOCK_SIZE_K`，然后加载，然后累加计算结果。这里是沿着N方向每次移动 BLOCK_SIZE_K * stride_xk，而M方向由不同的program进行计算，这里不需要管
```python
    for k_start in range(0, K, BLOCK_SIZE_K):
        x_tile = tl.load(
            x_ptrs,
            mask=(offs_m[:, None] < M) & ((k_start + offs_k[None, :]) < K),
            other=0.0,
        )
        c_tile = tl.load(
            c_ptrs,
            mask=((k_start + offs_k[:, None]) < K) & (offs_n[None, :] < N),
            other=0.0,
        )
        accumulator += tl.dot(x_tile, c_tile)
        x_ptrs += BLOCK_SIZE_K * stride_xk
        c_ptrs += BLOCK_SIZE_K * stride_c
```
>注意这里我们看到有一个`dot()`，这个点乘就是register tiling的小矩阵点乘。

- 升维算子
这里考虑到M=64，我们只是取了一个单批次的场景，我目前没有写SGMV的多LoRA场景运算，就是一个普通的expand乘法。
```python
Y: [M, R]
B: [R, N]
O2 = Y @ B: [M, N]
```
逻辑类似，这里沿着R方向扫一遍。这里注意`BLOCK_SIZE_K`并不是K独有的一个变量，就是一个reduction的步长，只不过这里r很小，所以可能这个循环只会扫描一遍
>[!question] 性能
>这样只扫一遍为什么还要写一个循环，有没有其他方法提升？SGLang 的 expand / LoRA-B 升维乘法的 reduction 维度就是 LoRA rank，也就是 `R`。如果 `R <= BLOCK_R`，它确实只循环一次。他们的代码中循环次数为`ceil(real_rank / BLOCK_R)`，实际来看也就是只循环一次。

```python
    for r_start in range(0, R, BLOCK_SIZE_K):
        y_tile = tl.load(
            y_ptrs,
            mask=(offs_m[:, None] < M) & ((r_start + offs_r[None, :]) < R),
            other=0.0,
        )
        b_tile = tl.load(
            b_ptrs,
            mask=((r_start + offs_r[:, None]) < R) & (offs_n[None, :] < N),
            other=0.0,
        )
        accumulator += tl.dot(y_tile, b_tile)
        y_ptrs += BLOCK_SIZE_K * stride_yr
        b_ptrs += BLOCK_SIZE_K * stride_b
```
两次accumulator累加的矩阵形状都一致，都会输出在这个program负责的`BLOCK_SIZE_M*BLOCK_SIZE_N`上，输出区域是由`O[offs_m, offs_n]`决定的。最后 store 也只写这一个 tile:
```python
o_ptrs = o_ptr + offs_m[:, None] * stride_om + offs_n[None, :] * stride_on
tl.store(o_ptrs, accumulator, ...)
```
所以完整逻辑就是：
- pid_m/pid_n 决定当前 program 负责哪个输出 tile
- offs_m/offs_n 把这个 tile 的全局行列坐标固定下来
- 两个分支虽然 reduction 维不同，但都围绕这同一组 offs_m/offs_n 取数
- 它们都往同一个 accumulator[BLOCK_SIZE_M, BLOCK_SIZE_N] 里加
- 最后一次性写回同一个 o_ptr


#### 验证
做问题1要求的第一版全流程融合验证：
1. baseline 全流程：O = X @ C + (X @ A) @ B
2. fused 全流程：先算 Y = X @ A，再调用一个 Triton kernel 计算 O = X @ C + Y @ B
这里刻意不引入 SGMV / 多 LoRA / segment 逻辑，只验证 Punica expand 思想在单 adapter 场景下的可行性。

##### 精度要求
fused 路径会把 `X@C` 与 `Y@B` 都累加在同一个 fp32 accumulator 里，而 Step 1 baseline 是两个独立 matmul 各自回写后再做加法。两者的舍入路径不同，所以这里采用更符合 fp16/bf16 实验场景的容忍度
其实也是题目要求的验证：融合kernel的数值结果与三个独立算子串行执行的结果一致（误差在fp16精度范围内）


##### 计算pipeline
融合后算子的流程为：
```python
def run_fused_pipeline(
    x: torch.Tensor,
    a: torch.Tensor,
    b: torch.Tensor,
    c: torch.Tensor,
) -> torch.Tensor:
    """Step 3 全流程：先算 Y = X @ A，再执行 fused kernel。"""
    y = compute_lora_down(x, a)
    return triton_fused_matmul_expand(x, c, y, b)
```
参考Step 1的流程为：
```python
def run_reference_pipeline(
    x: torch.Tensor,
    a: torch.Tensor,
    b: torch.Tensor,
    c: torch.Tensor,
) -> torch.Tensor:
    """完整串行参考实现：O = X@C + (X@A)@B。"""
    y = compute_lora_down(x, a)
    z = compute_lora_expand(y, b)
    w = compute_main_matmul(x, c)
    return compute_output_add(w, z)
```
同样通过measure cuda time计算耗时
```python
    baseline = measure_cuda_time(
        "baseline full: X@C + (X@A)@B",
        run_baseline_once,
        args.warmup,
        args.repeat,
    )
    fused = measure_cuda_time(
        "fused full: X@A + fused(X@C, Y@B)",
        run_fused_once,
        args.warmup,
        args.repeat,
    
```

目前得到的结果：
```bash
  correct: True
  max_abs_error: 1.000000
  max_rel_error: 8640.000000
  max diff position: (1, 66), baseline=-1091.000000, fused=-1092.000000
  baseline full: 1.726192 ms, 8.727847 TFLOPS
  fused: 1.667072 ms, 9.037366 TFLOPS
  fused 耗时 / baseline 耗时: 0.965
```
性能提升看起来并没有非常好，可能是真正融合掉的只是后半段的 Y @ B 和 X @ C + add 这一部分，X @ A 还在外面。所以最终全流程提升本来就会被“摊薄“。
### Step 4
暂时先搁置了，听起来很有意思，但是鉴于是Bonus，笔者等有空了会继续完成。
