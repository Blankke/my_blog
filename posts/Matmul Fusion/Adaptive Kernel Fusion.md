---
title: "Adaptive Kernel Fusion for Improving the GPU Utilization While Ensuring QoS"
cover: false
categories:
  - Matmul Fusion
---
# Adaptive Kernel Fusion for Improving the GPU Utilization While Ensuring QoS

Aker 的核心思想是：  
**不要只在 kernel 之间做时间共享，而是把资源互补的两个 kernel 融合成一个 fused kernel，让一个 thread block 里的不同 warps 执行不同计算，从而同时利用 Tensor Core / CUDA Core，或者同时利用计算资源 / 内存带宽。**
---
## Background

### 应用分类
论文首先把数据中心里的 GPU 应用分成两类。
#### 按 QoS 需求分类
**LC，Latency-Critical application/service**，指有严格延迟约束的服务。  
例如在线 DNN 推理、视频流目标检测、实时推荐系统。这类任务必须在 deadline 内返回结果。论文里举例说，实时视频目标检测需要在 50ms 内完成，否则用户会感知到卡顿。
**BE，Best-Effort application**，指没有严格 deadline 的任务。  
它可以慢一点，只要最后完成即可。例如图搜索、科学计算、后台批处理任务。BE 任务可以利用 LC 服务没有用满的 GPU 资源，从而提高整张 GPU 的吞吐量。

> [!note] LC / BE 是应用级分类  
> LC / BE 不是说这个任务一定使用 Tensor Core 或 CUDA Core，而是说它对延迟是否敏感。  
> 一个 LC 应用内部可以有很多 kernel，一个 BE 应用内部也可以有很多 kernel。

---
### Kernel 分类
应用最终会被拆成一系列 GPU kernels。Aker 不是直接按应用融合，而是在 kernel 层面寻找资源互补的 pair。
#### 按硬件执行单元分类
**Tensor Core kernel，论文简称 TC kernel**  
主要使用 Tensor Core。Tensor Core 是 NVIDIA GPU 中专门加速矩阵乘法、GEMM、卷积等张量运算的硬件单元。DNN 推理和训练里大量算子会用到 Tensor Core。
**CUDA Core kernel，论文简称 CD kernel**  
主要使用普通 CUDA Core。CUDA Core 更通用，可以执行普通浮点、整数、控制逻辑、访存密集型任务等。
论文的观察是：现代 GPU 的 SM 里同时有 Tensor Core 和 CUDA Core，但现有共置调度方法经常只能让其中一类硬件处于活跃状态，另一类硬件处于空闲状态。

#### CD kernel 进一步分类
对于只使用 CUDA Core 的 kernel，论文又根据资源偏好继续分类：
- **memory-prefer kernel**：memory bandwidth utilization 超过 50%；
- **computing-prefer kernel**：computing core utilization 大于 50%，并且 memory utilization 小于 50%；
- **neutral kernel**：计算利用率和内存利用率都低于 50%。
**计算偏好核**：大量使用 CUDA Core 做算术运算，访存压力小。  
例如纯计算、寄存器计算、多次复用数据的 kernel。
**内存偏好核**：大量访问 DRAM，计算单元经常等数据。  
例如 stencil、lbm 这类访存规律强、带宽压力大的 kernel。
论文实验中，compute-prefer kernels 的平均计算核心利用率达到 80.5%，但内存带宽利用率只有 3.15%；memory-prefer kernels 的平均内存带宽利用率达到 85.6%，但计算核心利用率只有 26.1%。这说明两类 kernel 的资源使用方式互补。
> [!question] 这些分类之间有固定对应关系吗？  
> 没有固定对应关系。  
> LC / BE 是应用级分类，TC / CD 是 kernel 使用的硬件分类，compute-prefer / memory-prefer 是 CD kernel 的资源瓶颈分类。  
> 在本文实验中，LC 服务多是 DNN，所以更常包含 TC kernel；BE 应用来自 Parboil / Rodinia，所以多是 CD kernel。但这只是实验设置，不是理论必然。

可以把它理解成：
```
Application
├── 按 QoS 分类：LC / BE
│
└── 应用内部包含多个 GPU kernels
    ├── 按硬件执行单元分类：TC kernel / CD kernel
    │
    └── 如果是 CD kernel，再按资源瓶颈分类：
        computing-prefer / memory-prefer / neutral
```

---
## Motivation
### A. 虚假高利用率问题
现有 GPU 共置方法，例如 Baymax，会让 BE 任务利用 LC 服务没有使用的 GPU 时间。它可以提高 GPU-level utilization，但它的调度粒度还是 kernel 级别的时间共享。
问题在于：  
**一个 kernel 正在运行，并不代表 SM 内部所有资源都在被充分使用。**
论文用 Baymax 共置 ResNet50 和 sgemm 做实验。结果显示，在任一时刻，要么 Tensor Core 活跃而 CUDA Core 空闲，要么 CUDA Core 活跃而 Tensor Core 空闲。GPU 看起来是 computation-busy，但 SM 内部仍有大量资源没有被同时利用。
即使两个 kernel 都只使用 CUDA Core，也存在类似问题。一个计算密集 kernel 运行时，内存带宽闲着；一个内存密集 kernel 运行时，计算核心闲着。
这就是 **false high utilization**：
> GPU 粗粒度指标看起来利用率很高，但细看 SM 内部资源，Tensor Core、CUDA Core、memory bandwidth、compute pipeline 并没有同时被吃满。

---

### B. 潜在并行机会
论文接下来构造 micro-benchmark，验证一个想法：
**如果一个 thread block 里的不同 warps 执行不同类型的计算，它们可以在 SM 内部同时利用不同硬件资源。**
例如：
- 一部分 warps 执行 Tensor Core GEMM；
- 另一部分 warps 执行 CUDA Core 计算。
实验中，单独运行两个 Tensor Core kernel 或两个 CUDA Core kernel，时间接近 2；但融合一个 Tensor Core kernel 和一个 CUDA Core kernel 后，归一化时间只有 1.03。
同样地，把 compute-prefer CD kernel 和 memory-prefer CD kernel 融合后，归一化时间只有 1.05，而两个同类 kernel 的时间接近 2。
所以 Aker 认为有两类主要融合机会：
1. **TC kernel + CD kernel**  
    一个吃 Tensor Core，一个吃 CUDA Core。
2. **compute-prefer CD kernel + memory-prefer CD kernel**  
    两个都用 CUDA Core，但一个更吃计算，一个更吃内存。
> [!note] Aker 的 kernel fusion 和普通 fusion 不一样  
> 普通 kernel fusion 常见目标是减少中间结果写回、减少 HBM 访问、减少 kernel launch。  
> Aker 的 fusion 主要目标是 **挖掘 SM 内部资源互补性**。它不一定要求两个 kernel 之间有数据依赖，也不一定是 producer-consumer 关系。

---

### C. 核融合的利用挑战

直接把两个 kernel 拼在一起，并不一定能提升吞吐量。
论文实验里直接融合 Tensor Core kernel 和 Parboil 的 CUDA Core kernel，大多数 fused kernel 的执行时间接近 2，说明直接融合没有带来明显收益。原因是 fused kernel 会引入新的 SM 资源争用，例如 thread slots、registers、shared memory 都可能成为限制。
论文总结出四个挑战：
1. **动态输入问题**  
    kernel 的 block 数和输入大小有关，运行时才知道。静态融合很难提前确定 grid 结构。
2. **融合比例问题**  
    1:1 融合不一定好。两个 kernel 对 register、shared memory、thread slots 的需求不同，需要不同 fusion ratio。
3. **性能预测问题**  
    fused kernel 中不同 warps 执行不同代码，执行时间不能直接用普通 kernel 的模型预测。
4. **QoS 保护问题**  
    fused kernel 往往比原始 LC kernel 更长。如果融合不当，会导致 LC 服务违反 deadline。

---

## Design
![[./img/Adaptive Kernel Fusion-01.png||500]]

Aker 由四个模块组成：
- **Static kernel fuser**
- **Duration predictor**
- **Adaptive fused kernel selector**
- **Enhanced QoS-aware kernel manager**
这四个模块可以整理成一条逻辑链：
```
先让 kernel 可以离线融合
        ↓
再预测 fused kernel 会跑多久
        ↓
再选择最优融合版本
        ↓
最后在运行时判断是否真的融合
```

---
### 1. 静态核融合：用 PTB 解决动态输入问题
最直接的 kernel fusion 是把两个 kernel 的 thread blocks 拼成新的 fused block。

但是直接 fusion 有一个问题：  
**两个 kernel 的 block number 和 block dimension 需要提前知道，而 block number 通常由运行时输入决定。**

这对 LC 服务尤其麻烦。LC 服务输入不稳定，例如 batch size、sequence length、图像大小都可能变化，不能为每次输入在线生成新的 fused kernel。在线生成 fused kernel 又会带来额外编译开销。

Aker 使用 **Persistent Thread Block，PTB** 来解决这个问题。

PTB 的思想是：  
**不再让 kernel 按输入大小 launch 大量 blocks，而是固定 launch 一批 persistent blocks，让这些 blocks 像 worker 一样循环处理原本的 block 任务。**

原始 kernel：

```
kernel<<<dynamic_grid, block_dim>>>(...)
```

PTB 化之后：

```
ptb_kernel<<<fixed_grid, block_dim>>>(..., original_block_num)
```

这样一来，kernel 的外层 grid 变成固定的，Aker 就可以提前离线生成 fused kernel，不需要运行时 JIT fusion。论文说，Aker 通过 PTB 把待融合 kernel 的动态 grid dimensions 转成静态 grid dimensions，从而消除在线感知 grid dimension 的需求。

> [!note] PTB 可以怎么理解？  
> 普通 kernel 是“有多少任务就发多少 block”。  
> PTB 是“固定发一批 worker block，每个 worker block 在循环里领取任务”。  
> 这有点像线程池：线程数量固定，任务数量动态。

---

### 2. 灵活融合比例：不是所有 kernel 都适合 1:1

朴素 PTB fusion 会按 1:1 融合两个 kernel 的 persistent block。

但这不一定好。

例如：

- K1 为了达到原始性能，需要每个 SM 上 2 个 persistent blocks；
- K2 为了达到原始性能，需要每个 SM 上 1 个 persistent block；
- 如果强行 1:1 融合，可能导致 K1 的并行度下降。

因此 Aker 支持 flexible fusion ratio。例如 2:1、3:1、2:2 等。一个 fused block 里可以包含多个 K1 的 persistent blocks 和多个 K2 的 persistent blocks。

但问题随之而来：  
**同一个 kernel pair 会有多个 fused kernel versions，运行时该选哪个？**

Aker 的做法是：静态 kernel fuser 先生成所有可行版本，后面的 adaptive fused kernel selector 再找最优版本。

---

### 3. 建模融合内核：two-stage linear regression

Aker 必须预测 fused kernel 的执行时间，因为只有预测准确，才能判断它会不会破坏 LC QoS。

论文把两个原始 kernel 的执行时间记作：

```
Xk1 = K1 单独运行时间
Xk2 = K2 单独运行时间
```

并定义：

```
Load_ratio = Xk2 / Xk1
```

Aker 观察到 fused kernel 的执行时间和 load ratio 呈现 **two-stage linear regression** 关系。

原因是 fused kernel 的执行过程可以分成两段：

#### 第一段：co-run stage

两个 component kernels 的 warps 同时运行。  
这是 Aker 真正想要的阶段，因为这时不同资源可以并行利用。

#### 第二段：solo-run stage

其中一个 kernel 已经完成，另一个 kernel 还剩下一部分 workload，只能单独继续跑。  
这一段收益较低，甚至会因为 persistent block 数不足而变慢。

最理想的情况是：  
**两个 component kernels 正好同时完成，没有 solo-run tail。**

论文把这个点叫做 **opportune load ratio**。

> [!note] opportune load ratio  
> 可以理解成“刚刚好的负载比例”。  
> 在这个比例下，两个 kernel 的 co-run 阶段结束时刚好一起完成，没有一方拖尾。  
> Aker 后面的 kernel split 和 adaptive selection 都围绕这个点展开。

---

### 4. 自适应选择：选择最大 makespan reduction 的版本

同一个 kernel pair 可能有多个 fused kernel versions。

一个直观做法是：运行时根据当前 load ratio 查表，选择最快的版本。  
但这种方法会带来较大的 runtime selection overhead 和 storage overhead。

Aker 的观察是：

**fused kernel 的 makespan reduction 在 opportune load ratio 处最大。**

因为在这个点，两个 kernel 完全 co-run，没有 solo-run 阶段。  
solo-run 阶段不能带来资源互补收益，而且还可能因为 fused kernel 的 persistent block 数不足而变慢。

因此 Aker 不需要对所有 runtime load ratio 做复杂查表。它只需要比较不同 fused versions 在各自 opportune load ratio 下的 makespan reduction，选择收益最大的版本。

可以理解成：

```
哪个 fused version 在“刚刚好的负载比例”下节省时间最多，
哪个 version 就是这个 kernel pair 的最优版本。
```

---

### 5. Kernel split：让 BE kernel 按合适比例参与融合

现实中，BE kernel 的 workload 不一定刚好匹配 LC kernel 的 opportune load ratio。

如果 BE kernel 太长，整个拿去融合会拖长 LC latency；  
如果 BE kernel 太短，又不能充分利用 co-run 机会。

Aker 的做法是 **kernel split**。

对于 PTB kernel，只需要增加两个参数：

```
start_block_id
end_block_id
```

就可以只执行原始 kernel 的一部分 block。

例如一个 BE kernel 有 1024 个 blocks，Aker 可以把它切成：

```
K1-1: block 0 ~ 255      用于和 LC kernel fusion
K1-2: block 256 ~ 1023   放回 BE queue，后面继续执行
```

这样 Aker 可以让参与 fusion 的那部分 BE workload 尽量匹配 opportune load ratio，而不是被原始 BE kernel 的完整大小绑死。

> [!note] kernel split 的本质  
> 它不是把 kernel 代码切成两份，而是把原始 block 空间切成两段。  
> PTB 本来就在循环里处理 block，所以加上 start / end block id 后，就能自然支持部分执行。

---

### 6. 在线核调度：用 QoS headroom 决定是否融合

Aker 最后要解决的问题是：  
**什么时候融合，什么时候不融合？**

它把一个 LC query 的端到端延迟拆成：

```
TQ = Tqueue + Tlc + Tfuse + Tbe
```

必须满足：

```
TQ <= Tqos
```

其中：

- `Tqueue`：前面排队 kernel 的执行时间；
- `Tlc`：这个 LC query 自己的 kernel 执行时间；
- `Tfuse`：融合带来的额外执行时间；
- `Tbe`：插入执行的 BE kernel 时间；
- `Tqos`：LC query 的 deadline。

Aker 先预测 LC query 原本单独运行需要多久，然后计算 QoS headroom：

```
Thr = Tqos - Tori_solo - Tqueue
```

这个 headroom 表示：  
**在不违反 LC QoS 的前提下，还能留给 BE kernel 多少 GPU 时间。**

假设当前 LC kernel 是 TC kernel，预测时间是 `Ttc`；  
有一个 BE 的 CD kernel 可以融合，fused kernel 预测时间是 `Tk_fuse`。

那么只有当：

```
Tk_fuse - Ttc < Thr
```

Aker 才会真正执行 fusion。

也就是说，fused kernel 比原始 LC kernel 多出来的时间，必须落在 QoS headroom 之内。否则 Aker 不冒险，直接执行原始 LC kernel。

> [!important] Aker 的调度原则  
> Aker 不是“看到能融合就融合”。  
> 它是在 QoS headroom 允许的情况下才融合。  
> LC 的 deadline 是硬约束，BE 的吞吐量是优化目标。
