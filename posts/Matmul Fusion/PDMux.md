---
title: Towards High-Goodput LLM Serving with Prefill-decode Multiplexing.zh.dual
date: 2026-06-04
_pdf_url: /posts/Matmul%20Fusion/PDMux.pdf
---
# Towards High-Goodput LLM Serving with Prefill-decode Multiplexing
[点击在新标签页中打开 PDF](/posts/Matmul%20Fusion/PDMux.pdf){target="_blank" rel="noopener"}

## Background
### LLM 服务
大语言模型（LLM）服务必须满足预填充prefill和解码阶段decode的服务等级目标（SLO）
- **预填充prefill**：是input，是计算密集型的，计算需求随着输入长度线性增长。produce first token
- **解码decode**：是output，是内存密集型的。iteratively generates the remaining tokens.

![[Pasted image 20260604160653.png]]
一个典型 LLM serving 系统里，请求不是孤立执行的，而是会混合执行 prefill、decode、KV cache 复用和 batching。
- `P` 表示 **Prefill 阶段**：模型一次性处理输入 prompt / 上下文，生成第一个 token，同时建立 KV cache。
- `D` 表示 **Decode 阶段的一次迭代**：每次 decode 通常只生成一个新 token，然后把这个 token 的 KV 也追加进 KV cache。
- `TTFT` 是 **Time To First Token**，即从请求到达，到第一个 token 生成出来的时间，主要受 prefill 影响
- `TBT` 是 **Time Between Tokens**，即连续两个输出 token 之间的时间，主要受 decode 影响。

User2 的 `req2` 在 User1 还没生成完时到达，当 User2 的请求到达时，系统会临时暂停或延迟 User1 正在进行的 decode，然后先给 User2 做 prefill。为了把 User2 加入当前批处理，User1 的 decode 被阻塞了一段时间，导致 User1 两个 token 之间的间隔变大，也就是 TBT 被拉长了。这可能违反服务的 TBT SLO。

User2 的 prefill 结束后，系统就可以把 User1 和 User2 的 decode 合并成一个 batch 来执行。
>[!question] ***什么是inflight batching***
>在已有请求还在生成 token 的过程中，系统允许新请求“插队加入”当前服务流程；为了加入新请求，系统会先给新请求做 prefill，然后把它和已有请求一起组成 decode batch 继续生成。

>[!question] prefill 有没有并行的可能？
>如果多个新请求同时到达，系统可以把多个新请求的 prefill 做成一个 prefill batch。
> - 通常长 prompt 的 prefill 很容易占满 GPU，因为 prefill 是计算密集型，输入 token 多时会有大量矩阵乘和 attention 计算。论文也说 prefill 的计算需求随输入长度线性增长，而 decode 更偏内存密集。
> - 但如果 prompt 很短，单个 prefill 也可能不够大，GPU 利用率未必高。所以实际系统会根据输入长度、batch size、SLO 来调度。
### 什么是KV cache
`KV cache` = 每一层 Transformer 中，每个历史 token 的 Key / Value 张量
- KV cache 本身主要占显存；
- 访问 KV cache 会消耗显存带宽；不是像矩阵乘那样主要消耗 SM 算力。
在 Splitwise / LoongServe 这类方法里，一个 GPU 通常既提供显存，也提供计算。假如某个 batch 的 KV cache 太大，必须分布在 2 张 GPU 的显存里，那么系统就不得不把这 2 张 GPU 分给 decode instance。可是 decode 本身可能只需要很少计算，导致这 2 张 GPU 的大量 SM 算力空着。
- (a) Splitwise：静态解耦服务
- (b) LoongServe：动态解耦服务
- (c) Chunked-prefill：分块预填充
### 现有方案
![[Pasted image 20260604162345.png]]
图里有 4 张 GPU，横轴是时间。蓝色是 prefill，浅绿色是 decode iteration，白色小块是 KV cache，斜线阴影是 GPU 空闲资源。图注说明：b1 在 0T 到达，b2 在 1T 到达，b3 在 3T 到达，b1' 在 5T 到达；b1' 是 b1 的后续请求，会复用 b1 的 KV cache。黑色实线箭头表示 KV cache migration，红色虚线叉号表示 recomputation。
#### Splitwise：静态解耦服务
把 GPU 静态分成两组：一组专门做 prefill；一组专门做 decode
如图中Splitwise 中 prefill instance 和 decode instance 各自静态占用两个 GPU，并各自维护 KV cache pool。
>b1 到达 → 在 prefill GPU 上做 prefill
>prefill 完成 → 把 b1 的 KV cache 迁移到 decode GPU
>decode GPU 开始为 b1 做 decode

>b2 到达 → 仍然在 prefill GPU 上做 prefill
>完成后 → 迁移 KV cache 到 decode GPU
>再进入 decode
##### 缺点：
- 静态切分导致资源空闲
- KV cache pool 被切小了。4 张 GPU 的显存不能形成一个统一大池子，而是被切成两个较小的池子。

#### LoongServe：动态解耦服务
根据请求长度和执行阶段，动态调整 GPU 分配。LoongServe 支持在 prefill 和 decode 两个阶段之间动态 GPU partitioning，会根据 sequence length 和 execution phase 扩缩 GPU 资源。
>b1 到达
→ 用 4 张 GPU 快速 prefill，所以 b1 的 TTFT 比 Splitwise 小
→ prefill 结束后，缩成 2 张 GPU 做 decode

##### 缺点
LoongServe 为了避免重复，会立即释放原始 GPU 上的 KV cache，因此 KV cache 只能在单个请求内部从 prefill 复用到 decode，不能跨多轮请求复用。
>[!question] 为什么这里不能复用
>Splitwise 里 GPU 被固定分成两组，b1 做完 prefill 后，会把 KV cache 迁移到 decode instance。之后 decode instance 的 GPU 角色不会变，它一直是 decode instance。于是 b1 的 KV cache 可以留在 decode instance 的 cache pool 里，等后续 b1' 来了，如果还没被淘汰，就可以继续复用。
>b1 prefill 完成后，把 KV cache 迁移到 decode instance。之后 decode instance 的身份不变，b1 的 KV cache 可以作为 decode cache pool 里的一个 entry 留着，等 b1' 来复用。只有当 cache pool 空间不够、LRU 淘汰时，它才会被 eviction
>而loongserve是直接释放，不作为一个可复用的cache维护，**用牺牲跨请求 KV cache reuse，换取 GPU 动态分配的灵活性**。
>
#### Chunked-prefill：分块预填充
不解耦 GPU，而是在同一组 GPU 上，把一个长 prefill 切成很多小块；
- 每个 prefill chunk 和一次 decode iteration 融合执行。
- 为了保证计算等价，每个 chunk 要读取前面所有 chunk 生成的 KV cache。
Chunked-prefill 用 token budget 来限制每次融合执行的总 token 数，这个 token budget 等于 prefill chunk 的新 token 数加上 decode batch 的 token 数。通过限制 token budget，它可以控制 decode latency，帮助满足 TBT SLO。
##### 缺点 
token budget 小 → 每次执行很短，TBT 好，但 GPU 吃不饱
token budget 大 → GPU 利用率高，但每次 decode 被拖长，TBT 可能超标
prefill chunk 和 decode iteration 被绑在一起；token budget 小则 GPU 利用率低，大则 TBT 超标；长上下文下会反复访问 KV cache，进一步拖慢

## Design
### 概述
![[Pasted image 20260604164240.png]]

- **intra-GPU prefill-decode multiplexing**，也就是是 **在同一张 GPU 内部** 做 prefill/decode 的资源划分。总思想是：
    - ***不要把 prefill 和 decode 分到不同 GPU / 不同实例，也不要把 prefill 切 token chunk 和 decode 强行融合；而是在同一张 GPU 内，把一部分 SM 分给 decode，另一部分 SM 分给 prefill，让两者同时跑，并共享同一份显存和 KV cache pool。***
- prefill 和 decode 在 GPU 内不同的 SM 上执行；这种方式可以低开销地重配置计算分区，同时让两个阶段共享 GPU memory，从而保持 KV cache pool 高效，并让 prefill/decode 独立执行，避免 SLO 和利用率之间的矛盾。

### 挑战
#### 虽然把 prefill 和 decode 分到不同 SM 上了，但它们仍然要协调。协调不好，GPU 会空转。
![[Pasted image 20260604171208.png]]
prefill 通常启动慢、执行长，decode iteration 通常短而频繁。两者延迟差异很大，如果直接硬套“两个流并行执行”，很容易一边等另一边，产生 bubble。

#### 只能切 SM，但不能完全切显存带宽、L2、HBM 等共享资源。
decode 本来就是 memory-intensive，如果 prefill 同时大量读写显存，可能会拖慢 decode，导致 TBT SLO 超标。现有空间分区技术主要 partition SM，但对 memory bandwidth 这类共享资源缺少控制，所以可能导致 SLO violation

### Design 1 无气泡多路复用引擎
不要把 prefill 当成一个完整大阶段来调度，而是把 prefill 按 Transformer layer 拆成更小的 prefill layers，图里写作 PLs。

>与按块分割的不同
>- Chunked-prefill：沿 token 维度切，把 prompt 切成 token chunk。
>- MuxWise layer-wise prefill：沿模型层维度切，把 prefill 拆成 layer-wise execution。

解决两种气泡：
- 预填充启动时间超过解码迭代执行时间时， 下一个解码迭代无法及时启动，并出现GPU气泡。
- 解码批次中的所有请求可能在并发预填充阶段 已经启动时完成token生成。由于GPU执行的不可抢占 特性，已启动的预填充无法被中断以回收计算资源。

对于第一种 气泡，MuxWise可以启动足够的PBs来占用预填充的 计算资源，并在解码阶段完成计算之前及时返回。对于 第二种，MuxWise将后续预填充层的执行切换到解码阶 段终止后的新Green-Context。对于由长请求引起的 SLO违规，逐层执行允许抢占，使短请求能够优先处理， 从而满足两个阶段的SLO目标。重要的是，逐层执行的 开销可以忽略不计，因为大语言模型本质上由多个 Transformer层组成。增加的调度成本在kernel launch和CPU侧的代码执行时间。
> [!NOTE]-
> **GreenContext 可以理解成一种“在同一进程内切 GPU SM 的机制”。**
>
> 普通 CUDA 程序里，一个 CUDA stream 里的 kernel 通常会被 GPU 调度到可用 SM 上执行；GreenContext 的作用是让某个 CUDA stream **只绑定到指定的一部分 SM**。这样 MuxWise 就可以让：
>
> ```text
> decode stream → 绑定到一部分 SM
> prefill stream → 绑定到另一部分 SM
> ```
> 它和 MIG / MPS 这类进程间隔离不同。MIG/MPS 更像把 GPU 或 GPU 资源切成不同实例/进程，调整不够灵活，还会带来跨进程通信问题；GreenContext 是同一进程内的空间切分，所以 prefill 和 decode 可以共享同一份 GPU memory 和 KV cache pool。论文说 GreenContext 通过把 CUDA streams 绑定到指定 SM 上实现低开销资源调整，重配置只需要一次 stream synchronization，量级是微秒级；并且由于两个阶段在同一进程内，可以共享同一内存空间维护单个 KV cache pool。
> 在文中 “new Green-Context” 的意思大致是：当 decode 阶段结束、原先给 decode 保留的 SM 不再需要时，MuxWise 可以把后续 prefill layers 切换到新的 SM 分区配置上，让 prefill 用上这些空出来的计算资源，而不是让它们闲着。

### Design 2 抗争容忍估计器
用**worst-case latency estimate**预测decode 这次会不会被 prefill 拖慢，从而 TBT 超标。
- `solo-run predictor` 预测一个阶段单独跑时的延迟。
- `contention guard` 则考虑 prefill 和 decode 同时跑时的额外 slowdown。
    - 这个 guard 来自一次性 offline profiling，并且考虑 reused length、input length、output length、decode batch size、partition configuration 这些因素。

>[!question] 可优化？
>这里的保守策略估计是否是可以优化为更精细的。如果保守的算法没有计算到各类参数，导致decode提前算完，是否也能造成很多更小的bubble，而不是论文所说的完全没有bubble
### Design 3
优先保证解码阶段的SLO达成，并尽可能早地处理预填充阶段。
