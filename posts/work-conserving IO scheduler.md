---
title: 基于 IO 调度器的可借用带宽控制设计
cover: false
tags:
  - OS
  - kernel
  - IO scheduler
---


参考文献：
[BFQ (Budget Fair Queueing) — Linux内核文档](https://docs.linuxkernel.org.cn/block/bfq-iosched.html#google_vignette)
[经典QoS调度算法——mClock算法](https://www.jianshu.com/p/35dc8e47f277)
## 一个候选方案：mclock解释
我们大约参照了mclock的思想设计解决思路，但是**如果一个已经派发出去的 I/O 请求处理很久，它确实会长时间占用设备**。RWL / mClock 这类调度器主要控制的是“下一次派发谁”，不是 CPU 时间片那种“执行到一半抢占下来”。
![[./work-conserving IO scheduler-01.png|500]]
此图是mclock的理论带宽配比，总结是下面一句话
***用户分配的带宽要么等于所设置的Reservation值，要么等于按照Weight分配的结果，要么等于Limit值。***
- 当按照Weight分配的结果大于用户所设置的Reservation时，则用户最终分配的带宽为按照Weight分配的结果；
- 当按照Weight分配的结果小于用户所设置的Reservation时，则带宽分配的结果等于Reservation；
- 当按照Weight分配的结果大于用户所设置的Limit时，则带宽分配的结果等于Limit。

### 打标签方法
下面是标签计算的公式：

$$
\begin{aligned}
R_i^r &= \max \left\{ R_i^{r-1} + \frac{1}{r_i},\, t \right\} \\
L_i^r &= \max \left\{ L_i^{r-1} + \frac{1}{l_i},\, t \right\} \\
P_i^r &= \max \left\{ P_i^{r-1} + \frac{1}{w_i},\, t \right\}
\end{aligned}
$$

其中，$R_i^r$ 表示第 $i$ 个用户的第 $r$ 个请求的 Reservation 标签，$L_i^r$ 和 $P_i^r$ 以此类推。这里的 $r_i$、$w_i$、$l_i$ 分别表示第 $i$ 个用户设置的 Reservation、Weight、Limit 参数。
因为 $R_i^{k-1}$ 是一个时间标签，$\frac{1}{r_i}$ 是一个时间间隔，两者单位一致。所以这里就是希望第 $i$ 个用户的 Reservation 速率是$r_i$，意思是R标签会按照$\frac{1}{r_i}$的间隔进行增长。

- Reservation标签值为上一请求的Reservation标签加上`1/r`和当前时间`t`的最大值
- 类似地，Weight标签、Limit标签也是同样的道理

### 调度原理
![[./work-conserving IO scheduler-02.png|500]]
- 首先，mClock算法每次从Reservation阶段开始，也就是会先检查Reservation队列是否有请求，如果有则先从Reservation队列的请求先被处理，直到每个用户的**Reservation标签值大于当前时间**。
    - 这是因为用户的Reservation标签表示用户应当被调度的时间，当这个时间大于当前时间时，表示该请求还未到达调度时间。
- 当Reservation阶段结束后，此时进入Weight阶段。Weight阶段同样是按照标签的大小依次调度，直到每个用户的**Limit标签值大于当前时间**，这里的判断条件和Reservation阶段的类似。另外，每次在Weight阶段调度一个请求之后，需要对所有Reservation标签进行调整：
    - 因为当用户的请求从Weight阶段被调度了之后，那么Reservation标签中间就会出现空档，为了保证用户的Reservation，必须对Reservation标签向前平移，也就是每调度一个Weight标签，则Reservation标签向前移动一个`1/r`，也就是减去`1/r`。Weight调度影响的只是调度服务的该用户。
>[!example]-
>假设有三个用户 A、B、C，每个用户都有很长的请求队列，每个请求处理时间都是 1 个时间单位：
>```
>A: A1, A2, A3, A4, A5, ...
>B: B1, B2, B3, B4, B5, ...
>C: C1, C2, C3, C4, C5, ...
>```
>|用户|Reservation 间隔 $\Delta R$|Weight 间隔 $\Delta P$|Limit 间隔 $\Delta L$|
>|---|--:|--:|--:|
>|A|3|1/3|1|
>|B|5|1/2|1|
>|C|无 Reservation|1|4|
>初始标签可以打成下面的样子，注意标签是对应每一个请求的标签。
>```
>A 的 R 标签: 0, 3, 6, 9, 12, 15, ...
A 的 P 标签: 0, 1/3, 2/3, 1, 4/3, ...
A 的 L 标签: 0, 1, 2, 3, 4, ...
B 的 R 标签: 0, 5, 10, 15, 20, ...
B 的 P 标签: 0, 1/2, 1, 3/2, 2, ...
B 的 L 标签: 0, 1, 2, 3, 4, ...
C 没有 R 标签
C 的 P 标签: 0, 1, 2, 3, 4, ...
C 的 L 标签: 0, 4, 8, 12, ...
>```
>于是按照服务请求，是下面的序列：
>|当前时间 $t$|阶段|派发请求|解释|
|--:|---|---|---|
|0|Reservation|A1|A1 和 B1 的 R 都是 0，任选一个，这里选 A1|
|1|Reservation|B1|B1 的 R=0，已经到期|
|2|Weight|C1|A2 的 R=3，B2 的 R=5，都还没到期，所以进入 Weight；C1 的 P=0 最小|
|3|Reservation|A2|A2 的 R=3，到期|
|4|Weight|B2|A3 的 R=6，B2 的 R=5，都没到期；按 P 选 B2|
|5|Reservation|B3|B2 是 Weight 阶段调度的，所以调度后把 B 的后续 R 标签前移一个 $\Delta R_B=5$，B3 的 R 从 10 变成 5，因此 t=5 时 B3 到期|
|6|Reservation|A3|A3 的 R=6，到期|
|7|Weight|A4|A4 的 R=9，B4 的 R=10，都没到期；按 P 选 A4|
|8|Weight|C2|C2 的 L=4，当前 t=8，没超过 Limit；按 P 可被选中|
|9|Reservation|A5|A4 是 Weight 阶段调度的，所以 A 的后续 R 前移 $\Delta R_A=3$，A5 的 R 从 12 变成 9，因此 t=9 到期|
|10|Reservation|B4|B4 的 R=10，到期|
|11|Weight|A6|没有 R 到期，按 Weight 选择 A6|
|12|Reservation|A7|A6 是 Weight 阶段调度的，A 的后续 R 前移，A7 到期|
|13|Weight|B5|没有 R 到期，按 Weight 选择 B5|
|14|Weight|C3|C3 的 L=8，当前 t=14，满足 Limit，可以参与 Weight|
|15|Reservation|A8|A8 的 R 到期|
|16|Reservation|B6|B6 的 R 到期|

但是mclock并不满足题目的A高优先级在满带宽时压制低优先级B的请求，而是一种更平衡饥饿的实现。# IO 优先级调度与带宽借用实验记录

>[!question] 题目背景
>
>在公有云多租户混部场景下，多个用户进程会争用同一块设备的 IO 带宽。传统 blk-throttle 一类硬限速机制通常是 non-work-conserving 的：即使设备当前存在空闲带宽，低优先级或被限速进程也不能突破固定上限，容易造成资源浪费。
>
>本题考虑一个简化场景：两个持续发起 IO 的进程 A 和 B 共享同一块块设备，其中 A 是高优先级业务，B 是低优先级业务。需要在 IO 调度器层设计队列组织方式和调度策略，使其满足：
>
>1. A 和 B 同时发起 IO 时，优先满足 A。
>2. A 未用满其应得带宽时，B 可以使用 A 未占用的空闲带宽。
>3. A 不再发起 IO 时，B 可以占用全部 IO 带宽。


## 实验环境

- 内核：[F7LY OS]([Blankke/F7LY: oscomp2025 second price](https://github.com/Blankke/F7LY))，C++23 freestanding 内核。
- 架构：LoongArch。
- 设备：QEMU virtio 块设备，镜像 `images/sdcard-la.img`。
- 运行命令：`timeout 5m make run l QEMU_MEM=1G`。
- 完整日志：`logs/output_l_20260603-213826_priority-borrow-light-tuned_QEMU_MEM-1G_timeout-5m.txt`。
- 本次内核版本：`46780a9`。
- 实验出口码：`exit_code=0`。

## 设计思路

实验代码位于 `user/research/priority_borrow_research.cc`，调度器核心位于 `kernel/fs/drivers/virtio_priority_borrow_scheduler.cc*` 与 `kernel/fs/drivers/virtio_blk_queue.cc*`。

我的队列组织方式是“***优先级 class + class 内 flow 队列***”：

- 根据进程的块层 IO nice 映射到 8 个 service class。nice 越小优先级越高；本实验中 A 使用 nice=0，映射到 class 4，B 使用 nice=19，映射到 class 7。
- 每个 class 内再按 pid 建立 flow 队列，同一优先级内用 round-robin 轮转，避免同优先级多个进程互相饿死。
- `enqueue()` 只负责把 `IoRequest` 放入对应 class/flow。
- `dequeue_next()` 从高到低扫描 class，选择第一个非空 class，再在该 class 内取下一个 flow 的队首请求。
- `dispatch_pending_locked()` 只要 virtqueue 还有可用 descriptor 链，就持续从软件调度队列取请求并提交给 virtio 设备。

这样可以表达题目要求的**三个语义**：

- 如果 A 有 pending 请求，调度器总是先选择 A 所在的高优先级 class。
- 如果 A 当前没有 pending 请求，而设备仍有空闲派发机会，调度器会继续扫描到 B 所在的低优先级 class，B 借用空槽。
- 如果 A 停止提交请求，B 成为最高的非空 class，可以持续占用设备派发能力。

我没有采用 mClock 作为最终方案。mClock 更适合表达“保底 + 权重共享”，其核心是 reservation/weight/deadline 选择；本题更强调“高优先级可饱和时优先压制，不能饱和时低优先级借用”。因此这里使用更直接的严格优先级队列，再用低优先级借用空窗来保持 work-conserving。

## 实验负载设计

实验没有依赖 FIO，而是在用户态手写 worker 持续发起对齐块设备读请求。原因是 F7LY 当前实验环境更容易直接控制用户态 worker 的启动时刻、持续时间、IO nice 和请求区域。原本想采用`iozone`测试中的二进制文件拉起进程，但是`iozone`测试的块请求更加零散，不便达到满载的效果，无法演示A压制B的优先级特点。

负载生成流程：

1. initcode 调用 `priority_borrow_research()` 作为实验入口。
2. 父进程为每个 worker 创建 ready/go/report 三组 pipe。
3. worker 启动后先设置自己的 IO nice，再把 CPU nice 固定为 0，避免 CPU 调度影响块层实验。
4. worker 打开 `/dev/block/8:0`，从各自独占偏移区域循环读取 64KiB chunk。
5. 所有 worker ready 后，父进程统一发 go 信号，让 A/B 在同一窗口内并发争用设备。
6. worker 在固定时间窗口内持续读盘，结束后把完成字节数、实际 nice、CPU nice、起止时间写回父进程。

worker 的一次 64KiB read() 最终会变成一次 IoRequest，再变成 virtqueue 上一条 3-descriptor 链，内核调度器拥有128个descriptor，也就是可以同时满足42个worker发出的请求。
实验使用读请求而不是写请求，主要是为了避免破坏 ext4 根镜像；每个 worker 使用独立的块设备偏移区域，避免不同 worker 互相覆盖同一段缓存或数据。

实验场景如下：

| 场景 | A 配置 | B 配置 | 验证目标 |
| --- | --- | --- | --- |
| A 单独运行 | 16 workers，6s，nice=0 | 无 | 高优先级单独基线 |
| B 单独运行 | 无 | 16 workers，6s，nice=19 | 低优先级单独基线 |
| A/B 满载并发 | 16 workers，6s，nice=0 | 16 workers，6s，nice=19 | A 满载时压制 B |
| A 轻载 + B 借用 | 1 worker，6s，每个 chunk 后暂停 16ms，nice=0 | 16 workers，6s，nice=19 | A 未用满时 B 借用 |
| A 短任务 + B 继续 | 16 workers，1s，nice=0 | 16 workers，6s，nice=19 | A 停止后 B 接近独占 |

## 实验结果

关键汇总日志如下：

```text
[priority-borrow] 场景=A 作业组单独占用设备 group=A-alone op=read workers=16 runtime=6s io(req=0 got=0..0) cpu=0..0 成功=16/16 总IO=1310MiB 吞吐=215.61MiB/s status=0
[priority-borrow] 场景=B 作业组单独占用设备 group=B-alone op=read workers=16 runtime=6s io(req=19 got=19..19) cpu=0..0 成功=16/16 总IO=1227MiB 吞吐=203.16MiB/s status=0
[priority-borrow] 场景=A/B 两组长时满载读盘 group=A-high op=read workers=16 runtime=6s io(req=0 got=0..0) cpu=0..0 成功=16/16 总IO=570MiB 吞吐=94.03MiB/s status=0
[priority-borrow] 场景=A/B 两组长时满载读盘 group=B-low op=read workers=16 runtime=6s io(req=19 got=19..19) cpu=0..0 成功=16/16 总IO=64MiB 吞吐=10.48MiB/s status=0
[priority-borrow] 场景=A 轻载 + B 借用空闲带宽 group=A-light op=read workers=1 runtime=6s io(req=0 got=0..0) cpu=0..0 成功=1/1 总IO=19MiB 吞吐=3.29MiB/s status=0
[priority-borrow] 场景=A 轻载 + B 借用空闲带宽 group=B-borrow op=read workers=16 runtime=6s io(req=19 got=19..19) cpu=0..0 成功=16/16 总IO=786MiB 吞吐=130.39MiB/s status=0
[priority-borrow] 场景=A 短任务结束后 B 继续独占 group=A-short op=read workers=16 runtime=1s io(req=0 got=0..0) cpu=0..0 成功=16/16 总IO=111MiB 吞吐=103.37MiB/s status=0
[priority-borrow] 场景=A 短任务结束后 B 继续独占 group=B-after op=read workers=16 runtime=6s io(req=19 got=19..19) cpu=0..0 成功=16/16 总IO=1087MiB 吞吐=175.49MiB/s status=0
```

自动验收结果如下：

```text
[priority-borrow][目标1] A/B 满载并发：A 组=94.03MiB/s, B 组=10.48MiB/s, A/B=8.97
[priority-borrow][目标2] A 轻载时：A 组=3.29MiB/s, B 组=130.39MiB/s, B 借用/B 单独=0.64
[priority-borrow][目标3] A 先结束后：A 组=103.37MiB/s, B 组=175.49MiB/s, B 独占/B 单独=0.86
[priority-borrow][基线] A 单独=215.61MiB/s, B 单独=203.16MiB/s
[priority-borrow][验收] 目标1=PASS 目标2=PASS 目标3=PASS borrow/contended=12.44 after/alone=0.86
```

满载并发场景中，调试 trace 也能看到两个 class 同时 pending 时总是选择高优先级 class：

```text
[priority-borrow] TRACE seq=42385 pending=0x90 inflight=0x0 combined=0x90 choose=4 pid=39 nice=0 bytes=65536 contended=1 high_wins=1 low_while_high=0
```

这里 `pending=0x90` 表示 class 4 和 class 7 都有请求，`choose=4` 表示本次选择了 A 所在的高优先级 class，`low_while_high=0` 表示没有在高优先级 pending 时错误派发低优先级请求。

## 结果分析

目标 1：A/B 同时满载时，A 吞吐 94.03MiB/s，B 吞吐 10.48MiB/s，A/B=8.97。说明高优先级业务在竞争场景下明显获得优先服务。

目标 2：A 轻载时，A 只产生 3.29MiB/s 的请求压力，B 吞吐从满载竞争时的 10.48MiB/s 提升到 130.39MiB/s，是满载竞争时的 12.44 倍，并达到 B 单独运行基线的 64%。说明当 A 未用满设备时，B 可以有效借用空闲带宽。

目标 3：A 只运行 1 秒后停止，B 在 6 秒窗口内达到 175.49MiB/s，是 B 单独运行基线 203.16MiB/s 的 86%。说明 A 不再发起 IO 后，低优先级 B 可以接近独占设备。

本实验中 pair 场景开启了 priority-borrow 实验模式和 trace，绝对吞吐会受到调试输出、QEMU 和派发窗口控制影响。因此评价重点不是单个数字是否等于物理设备上限，而是同一组实验里的相对关系：满载时 A 明显压过 B，轻载时 B 明显恢复，A 停止后 B 接近单独基线。

