---
title: StarryOS 多核的deferred wake 问题
cover: false
tags:
  - x86
  - multi-core
---
## 问题背景
假设任务 `T` 正在 CPU 1 上运行。
- 当 `T` 调用 sleep、等待条件变量或者进入其他阻塞操作时，大致执行：
```
T.state = Blocked
从 CPU 1 的运行队列中选择下一个任务 N
switch_to(T, N)
保存 T 的寄存器
恢复 N 的寄存器
T.on_cpu = false
```
- 而`T.state == Blocked` 和 `T.on_cpu == false` 不是同时完成的，这里有一个切换上下文的窗口。
- 如果此时 `T`被再次唤醒，他是不能立即转化为`READY`并进入某个cpu的运行队列的。
若CPU 1：T 正在从 Running 切换出去，CPU 0：同时执行 wake(T)，则CPU0执行`task.stash_wake(task.clone(), waker_cpu);`相当于暂存一个待完成事项，等待CPU 1上上下文切换后来唤醒。
也就是说，一般Blocked的任务，如果要唤醒，就有两种路径
- 正常wake：
    - `T.state == Blocked`->`READY`
    - 选择cpuid并预留
    - 写入目标 run queue
    - 更新 ready_tasks
- deferred wake ：
    - waker CPU 完成：
        - Blocked -> Ready 
        - 记录 handoff
    - 拿到waker的cpu完成:
        - 确认 on_cpu == false(上下文切换完成)
        - 重新选择目标 CPU
        - 写入目标 run queue
        - 更新 ready_tasks
这里多了一个**同步**的步骤，同步之后唤醒后选择的cpu是未知的，因为此时的cpu空闲状态并不能知道。
handoff会保存到自己的wake stash中，关键是每个 CPU 都有一个自己的 `PREV_TASK`，能够知道这个 CPU 正在切出去的前一个任务是谁，在 `switch_to(prev_task, next_task)` 中，真正进行架构上下文切换之前，代码先把 `prev_task` 写入当前 CPU 的 `PREV_TASK`，架构上下文切换完成后，当前 CPU 紧接着执行：`clear_prev_task_on_cpu();`
除了 owner CPU，waker 自己也有一个取走 handoff 的位置：
```rust
task.stash_wake(task.clone(), waker_cpu);

if task.on_cpu() {
    return None;
}

if task.take_wake().is_none() {
    return None;
}
```
这不是让多个 CPU 随机竞争任务，而是为了封住下面这个极窄的丢失唤醒窗口。假设任务 T 原来属于 CPU1，CPU0 正在 wake：

```
CPU0                                  CPU1

读取 T.on_cpu == true
                                      完成上下文保存
                                      set_on_cpu(false)
                                      take_wake() -> None
                                      因为 CPU0 尚未 stash

stash_wake(T)
重新读取 T.on_cpu == false
```

此时 CPU1已经经过了自己的 `take_wake()` 检查点，而 CPU0刚刚才把 handoff 放进去。如果 CPU0此时直接返回：
- **handoff 中有 T， 但 CPU1 不会再回来检查，T 永远不会入队，所以 CPU0必须再执行一次**
但是`take_wake()` 只是取得 enqueue 责任。真正决定任务最终去哪一个 CPU，是后面的 placement。

## 旧版代码的问题
- 代码：`AxRunQueue::put_task_with_state()`
```rust
if current_state == TaskState::Blocked
    && !waking_current_task
    && task.on_cpu()
{
    // 错误位置
    task.set_cpu_id(self.cpu_id as _);
    task.stash_wake(task.clone());

    if task.on_cpu() {
        return false;
    }

    if task.take_wake().is_none() {
        return false;
    }
}
```
此处意味着在stash之前就先选择了`cpuid`，task 可能仍然 `on_cpu` ，也就是上下文还没有保存完成；而任务尚未进入 self 对应的` run queue`，更好的实现`task.cpu_id` 本来仍应保存任务最后实际运行的 CPU，也就是 last_cpu / owner CPU，但是在stash之前就改成了任务准备被放入的目标 CPU。

然后这里的return false标志着状态切换未能完成，两种情况下返回false的原因不同，第一个是上下文切换未完成，第二个是被别的cpu入队处理了，会恢复cpu的状态从`RESERVED`到`IDLE` ，这一步是可恢复的，但是没有同时恢复选择的`task.cpu_id`
>[!important] 显而易见的方法
>为什么不能强行绑定，让这个waker_cpu在stash的时候强行绑定，这样wake的时候就不会id不一致。但是上下文切换之后cpu是否仍然空闲，是否有优先级更高的任务抢占，或者是否更换亲和性都是未知的，强行绑定也会造成问题。

- 代码`clear_prev_task_on_cpu()`
```rust
if let Some(task) = prev.take_wake() {
    let target = task.cpu_id() as usize;

    get_run_queue(target)
        .scheduler
        .lock()
        .put_prev_task(task, false);

    // 后面只有 kick/resched
}
```
这里把任务真正加入了目标 CPU 的 scheduler：
```rust
.put_prev_task(task, false);
```
但是没有执行：
```rust
get_run_queue(target)
    .ready_tasks
    .fetch_add(1, Ordering::Relaxed);
```
所以这里形成：
```
scheduler 中的任务数量 +1
ready_tasks 统计值没有 +1
```
作为对照，普通非延迟入队路径约 **1494—1498 行**是完整的：

```rust
let mut scheduler = self.scheduler.lock();
scheduler.put_prev_task(task, preempt);

#[cfg(feature = "smp")]
self.ready_tasks.fetch_add(1, Ordering::Relaxed);
```

迁移路径（waker cpu拿到handoff的唤醒）约 **1673—1676 行**也是完整的：

```rust
let mut scheduler = rq.inner.scheduler.lock();
scheduler.put_prev_task(migrated_task, false);
rq.inner.ready_tasks.fetch_add(1, Ordering::Relaxed);
```

唯独 owner 在 `clear_prev_task_on_cpu()` 中处理 deferred wake 时，绕过了这段计数更新。一般情况下这个错误较难复现。

### 处理方法
先完成状态转换，不立刻选择 CPU。
需要 deferred wake 时，只保存 handoff，不提前修改 `task.cpu_id`
```rust
prev.set_on_cpu(false);
 if let Some((task, waker_cpu)) = prev.take_wake() {
      enqueue_ready_wake_task(task, waker_cpu);
   }
```
普通 wake 和 deferred wake 共用同一入队函数`enqueue_ready_task()` 统一完成：
```rust
task.set_cpu_id(target_cpu);
scheduler.put_prev_task(task, false);
ready_tasks.fetch_add(1);
```
避免路径不一致。

## Linux的解决思路
Linux 的 deferred remote wakeup。唤醒请求不是广播给所有 CPU，也不是让所有 CPU 竞争 `handoff`；它被挂到一个**明确目标 CPU 的 per-CPU wake list**，由那个 CPU 消费。这样既能避免跨 CPU 争抢运行队列锁，也能让任务旧上下文的所有者完成状态交接。

Linux 的注释还说明，这种方式把任务激活、运行队列加锁和缓存写入成本转移到 wakee CPU，而不是由 waker 跨核修改远程运行队列。

也就是linux的做法是把wake的进程加入到wakee cpu的一个wake list中并发出信号，等待上下文切换完成后该cpu会进行处理
## 小测试
### 测试1——wake-balance
主线程：
    done_count = 0
    current_round++
    broadcast(wake_cond)
    wait(done_cond)

8 个 worker：
    从 wake_cond 返回
    记录 sched_getcpu()
    执行 SPIN_COUNT 次计算
    sched_yield()
    done_count++
    最后一个 worker 唤醒主线程



### 测试2——migration-stress
故意让所有 worker 在同一轮被绑定到同一个 CPU，以反复经过：
当前任务修改 affinity
    -> 被强制迁移到目标 CPU
    -> 执行计算
    -> nanosleep 阻塞
    -> 在亲和约束下重新唤醒
    -> 条件变量 barrier 再次阻塞和唤醒
每一轮：
```c
int target_cpu = round % TEST_CPU_COUNT;
```

因此目标序列是：
- 第 0 轮：所有 worker -> CPU0
- 第 1 轮：所有 worker -> CPU1
- 第 2 轮：所有 worker -> CPU2
- 第 3 轮：所有 worker -> CPU3
然后重复
注意是**所有 8 个 worker 在同一轮绑定到同一个 CPU**，不是每个 worker 分散到不同 CPU。


### dev分支的新进展
- `b5ec2c6ff`提交 

核心作用是把此前依靠裸指针、调用顺序和注释维持的 **CPU-local 所有权与上下文切换不变量**，改造成类型系统可以约束的事务协议。PR 也明确排除了调度策略替换，它保留了原有 `axtask` 调度器、`PREV_TASK` 和远程唤醒机制。

#### 将 per-CPU 访问改成作用域内的能力令牌

提交引入两个重要类型：

```
CpuPin<'scope>
ExclusiveCpu<'pin>
```

`CpuPin` 表示：

> 当前执行流已经被调用方固定在一个经过校验的 CPU area 上，在这个作用域内不会迁移。

`ExclusiveCpu` 表示更强的条件：

> 除了不会迁移，调用方还排除了本地中断、重入和其他冲突访问，因此可以可变访问 CPU-local 对象。

两个类型都包含不可逃逸的生命周期，也不是 `Send`/`Sync`，不能被保存到作用域外，也不能传给另一个线程。

#### 为每个任务增加稳定的 `CurrentThreadHeader`

#### 将上下文切换改造成 prepare/commit/finish 事务
提交引入：

```
PreparedThreadSwitch
PreviousThreadBinding
```

调用：

```
prepare_thread_switch(pin, previous, next)
```

会先完成：

1. 当前 CPU register 中发布的 current 必须等于 `previous`；
2. `previous` 必须确实绑定在当前 `CpuAreaRef`；
3. 将 `next` 绑定到当前 CPU，获得新的 next epoch；
4. 返回一个用于提交的 `PreparedThreadSwitch`；
5. 返回一个用于尾部解绑的 `PreviousThreadBinding`。

所有检查都发生在 current publication 之前。

### `PreparedThreadSwitch`

`PreparedThreadSwitch::commit()` 是单向提交点：

```
prepared.commit();
context_switch_raw(prev, next);
```

它发布新的 current thread，紧接着进入裸汇编上下文切换。在这两步之间不允许再放置可能失败或涉及 Rust 所有权的操作。

如果 prepare 成功后，因为某种原因没有执行 commit，令牌在 `Drop` 时会自动执行：

```
next.unbind_cpu(next_epoch)
```

撤销提前建立的 next binding。

这与“提前 reserve CPU”表面上相似，但有一个本质区别：

- 这里的 next 已经由当前 CPU 的 scheduler 选定；
- scheduler 临界区和 IRQ exclusion 仍然存在；
- commit 紧接着进入实际切换；
- 放弃切换时有精确 rollback。

而 deferred wake 中提前选择的目标 CPU 仍然只是一个调度决策，其空闲状态、亲和性和负载都可能在旧任务切换完成前变化，所以不能直接照搬这里的提前绑定。

### `PreviousThreadBinding`

`PreviousThreadBinding` 是一个非 `Copy`、必须消费的令牌。切换完成后，incoming task 执行：

```
previous_binding.finish(previous_header)
```

它检查：

- 当前传入的 previous 是否就是 prepare 时记录的 previous；
- epoch 是否仍然匹配。

只有通过检查，才能撤销旧任务的 CPU binding。

提交中的单元测试覆盖了：

- 放弃 prepare 时回滚 next binding；
- current 与 previous 不匹配时，在绑定 next 前失败；
- 先发布 next current，再由 incoming tail 解绑 previous；
- 过期 epoch 不能解绑新的 binding。


#### `clear_prev_task_on_cpu()` 的新顺序
提交中的顺序是：

```
let previous = PREV_TASK.take();
let prev = previous.task;

previous.binding.finish(prev.current_header());

prev.set_on_cpu(false);

if let Some(task) = prev.take_wake() {
    enqueue(task);
}
```

精确语义是：

1. 此时架构上下文切换已经完成，代码正在 incoming task 上执行；
2. 先消费 `PreviousThreadBinding`，撤销 previous 与旧 CPU area 的 binding；
3. 再发布 `on_cpu = false`；
4. 最后消费与切换竞争的 deferred wake。

这里不能把 `binding.finish()` 和 `set_on_cpu(false)`理解为同一个变量的重复操作。它们保护的是不同不变量：

|字段或令牌|含义|
|---|---|
|`CurrentThreadHeader.cpu_area + binding_epoch`|架构执行上下文当前属于哪个 CPU area；旧 tail 是否仍有权解绑|
|`task.on_cpu`|任务的寄存器上下文是否已经安全保存，能否在另一个 CPU 上恢复|
|`task.cpu_id`|任务最后运行或准备进入的 run queue，属于 placement 信息|
|`wake_handoff`|deferred wake 的 enqueue 责任由谁取得|

这四项不能合并成一个 `cpu_id`。

尤其是：

```
binding.finish()
    必须发生在 on_cpu = false 之前
```

因为一旦 waker 观察到 `on_cpu == false`，它就可以立即在其他 CPU 上完成入队。如果此时旧 binding 尚未撤销，任务会同时表现为：

```
仍绑定在旧 CPU area
又已经允许在新 run queue 中运行
```

- 这与我的实现相似的是都要求“准备”和“正式发布”分离

你的 deferred wake 方案是：

```
先保存 handoff
上下文安全后
再选择 CPU 并正式 enqueue
```

提交的 context switch 是：

```
先 prepare next binding 和所有 Rust 状态
最后 commit current publication
立即进入裸 switch
```

#### 这个提交没有解决、仍应合并你的修改的部分

提交当时的 deferred wake 代码仍然会：

```
task.set_cpu_id(self.cpu_id as _);
task.stash_wake(task.clone());
```

也就是在任务仍然 `on_cpu` 时，先把 `cpu_id` 改成当前选择的目标 run queue。

owner tail 随后又直接读取：

```
let target = task.cpu_id();
get_run_queue(target).scheduler.put_prev_task(task, false);
```

因此，`b5ec2c6ff` 固定了：

- 谁能解绑 old CPU binding；
- 什么时候可以发布 `on_cpu = false`；
- 旧 tail 不能误解绑新的 binding；
- per-CPU 数据不能被裸访问。

但它没有固定：

- deferred wake 是否应提前选择 CPU；
- `cpu_id` 是否在 stash 前被覆盖；
- owner 和 waker 两条 enqueue 路径是否完成相同计数；
- `false` 到底表示状态转换失败、已 deferred，还是已由另一 CPU 入队。

你的修改应当保留提交的 switch transaction，并继续修改它上面的 wake/enqueue 层。

## 1. 它已经解决的部分：旧寄存器尚未保存，任务却在另一 CPU 上运行

最危险的错误是：

```text
CPU1 正在切出 T
T 的寄存器还没有完全保存

CPU0 同时 wake(T)
把 T 加入 CPU2 的 run queue

CPU2 开始运行 T
```

这会导致同一个任务的旧上下文还被 CPU1 操作，CPU2 已经开始恢复和执行它，属于真正的上下文破坏。

`b5ec2c6ff` 通过下面这条顺序阻止了这个情况：

```text
prepare_thread_switch
    -> 为 next 建立 binding
    -> 保存 PreviousThreadBinding

发布 current = next
    -> 执行架构上下文切换

incoming switch tail
    -> previous_binding.finish(prev)
    -> prev.set_on_cpu(false)
    -> prev.take_wake()
    -> deferred enqueue
```

`PreviousThreadBinding::finish()` 会按照精确的 binding epoch 撤销 previous task 与旧 CPU area 的关系，之后才发布 `on_cpu = false`。

而 waker 侧只有在确认：

```rust
task.on_cpu() == false
```

之后，才会自行取得 handoff 并继续 enqueue；如果仍然是 `true`，就把责任交给 owner CPU 的 switch tail。`on_cpu` 和 `wake_handoff` 使用 `SeqCst` 构成握手，以防 owner 和 waker 都错过对方的写入。

因此，不合并你后面的“重新选择 CPU、统一 enqueue”修改，下面这个不变量已经成立：

> 一个任务不会在旧 CPU 尚未完成上下文保存时，被另一 CPU 从运行队列中取出并运行。

从寄存器、栈、FP 状态、地址空间和 CPU binding 的角度，`b5ec2c6ff` 已经把切换尾部做完整了。

---

## 2. 它没有解决的部分：`task.cpu_id` 和任务真实归属发生分叉

提交中的 deferred wake 路径仍然执行：

```rust
task.set_cpu_id(self.cpu_id as _);
task.stash_wake(task.clone());
```

此时任务仍然：

```text
task.on_cpu == true
CurrentThreadHeader.cpu_area == CPU1
```

但：

```text
task.cpu_id == 预先选择的 CPU2
```

这时系统里同时存在三种 CPU 信息：

```text
CurrentThreadHeader.cpu_area = CPU1
    架构上下文当前仍属于 CPU1

task.on_cpu = true
    CPU1 尚未完成上下文切出

task.cpu_id = CPU2
    deferred wake 希望将来把任务加入 CPU2
```

这不再会直接造成“CPU2 提前运行旧寄存器”的错误，因为 `on_cpu` 和 handoff 仍然挡住了 enqueue。但它造成了调度元数据语义上的分叉：

> `task.cpu_id` 已经不再表示任务最后实际运行或当前所属的 CPU，而是临时保存了未来的目标 run queue。

所以需要区分：

|不一致类型|`b5ec2c6ff` 是否解决|
|---|---|
|寄存器未保存就被其他 CPU 运行|已解决|
|过期 switch tail 错误解绑新 binding|已解决|
|owner CPU 与 `task.cpu_id` 不一致|未解决|
|deferred 期间目标 CPU 选择已经过时|未解决|
|owner/waker 入队统计不一致|未解决|
|`false` 返回值语义混乱|未解决|

---

## 3. 为什么 `cpu_id` 提前覆盖不会立刻破坏寄存器，却仍然需要修改

owner CPU 的切换尾部执行：

```rust
if let Some(task) = prev.take_wake() {
    let target = task.cpu_id() as usize;

    get_run_queue(target)
        .scheduler
        .lock()
        .put_prev_task(task, false);
}
```

执行到这里时：

```text
previous binding 已撤销
on_cpu 已经设置为 false
```

所以任务上下文已经安全，可以放入 CPU2。即使 CPU2 是提前选择的，也不会恢复一份尚未保存的上下文。

因此：

> 提前写 `cpu_id` 本身不是旧寄存器并发运行问题的直接原因。

它的问题在于 CPU2 是在更早的时候选出来的。当真正能够 enqueue 时，下列状态已经可能变化：

```text
CPU2 原来 idle，现在已经有其他任务
任务 affinity 已经被修改
CPU2 下线或者不可用
多个 waker 都将任务集中选择到 CPU2
负载统计已经变化
```

所以它主要导致：

- wake placement 过时；
    
- 任务集中到某个 CPU；
    
- `cpu_id` 的含义混乱；
    
- 后续代码可能错误地把 `cpu_id` 当成 owner/last CPU；
    
- rollback 或 reservation 使用错误 CPU；
    
- 统计和 scheduler 内容不一致。
    

这属于调度协议错误，不是架构上下文保存错误。

---

## 4. `ready_tasks` 漏计数会不会重新造成上下文不一致

不会直接破坏已经保存的寄存器，但可能造成任务已经在 scheduler 中，却没有反映在运行队列负载统计中：

```text
scheduler 中任务数 +1
ready_tasks 不变
```

这会影响：

- 后续 CPU 选择；
    
- idle 判断；
    
- load balance；
    
- 远程 CPU 是否及时被 kick；
    
- 测试中看到的唤醒分布。
    

严重时可能表现为任务已经入队却迟迟不运行，但它不是“任务同时被两个 CPU 执行”的那类上下文损坏。

也就是说：

```text
PreviousThreadBinding + on_cpu
    保护能不能安全运行

ready_tasks
    保护调度器是否正确看见和统计 runnable task
```

两者处于不同层次。

---

## 5. 不合并你的修改，系统能不能保持正确运行

从狭义的上下文安全来说，可以：

```text
不会在旧上下文保存完成前重新运行 T
不会由过期 tail 撤销新的 CPU binding
不会让 owner 和 waker 同时消费同一个 wake_handoff
```

但从完整的 wake 正确性来说，仍然不够：

```text
任务可能使用过时的目标 CPU
task.cpu_id 的语义在 deferred 窗口内不稳定
owner 路径可能漏 ready_tasks
不同 enqueue 路径行为不同
调用者无法从 false 判断任务最终是否已经被负责处理
```

所以更精确的结论是：

> `b5ec2c6ff` 已经解决了“能不能安全重新运行任务”的问题，但没有完全解决“任务最终由谁、在什么 CPU、通过哪条一致的路径重新入队”的问题。

---

## 6. 你的修改不是修复事务切换，而是在事务切换之上补齐 wake 协议

最终层次应当是：

```text
第一层：b5ec2c6ff

prepare_thread_switch
    -> commit current
    -> raw context switch
    -> finish previous binding
    -> on_cpu = false
```

这层给出：

```text
现在任务上下文已经可以安全地被其他 CPU 使用
```

然后才进入你的第二层：

```text
第二层：deferred wake placement

take_wake
    -> 根据当前负载和 affinity 重新选择 CPU
    -> 写 task.cpu_id
    -> scheduler.put_prev_task
    -> ready_tasks++
    -> kick/resched
```

这层给出：

```text
现在任务被完整且一致地加入某一个运行队列
```

因此，即使不“合并”你的具体提交，也必须以其他形式实现相同逻辑，才能消除你指出的调度上下文分叉。只保留 `b5ec2c6ff`，架构上下文已经安全，但 wake/enqueue 协议仍然是不完整的。