---
title: StarryOS self compile的多核并发优化
cover: false
tags:
  - x86
  - multi-core
---

# StarryOS self compile

## 问题背景
>[!quote] 题目原文
>对 `https://github.com/rcore-os/tgoskits` 的 `dev` 分支的 StarryOS 进行改进；  
> 在 x86_64 Linux 上，可通过 `qemu -kvm -smp 8`（或者 `>1` 个 CPU core）运行你改进的 StarryOS for x86_64；  
> 支持在这个改进的 StarryOS 上编译 StarryOS 项目本身，生成 Starry binary（至少 x86_64 架构，最多 4 种架构）；  
> 这个新生成的 binary 能在 qemu 中正常运行。
>
> 评判标准：
> 1. 能正确生成 Starry；
> 2. 能充分利用多核（SMP）来加速编译过程，并行加速比尽量高；
> 3. 有明确和清晰的设计开发文档或记录，能说明并行优化、修复并行或其他 bug 的过程；
> 4. 能形成一系列 PR，并能通过检查，被认可并合并到 `dev` 分支中。

### 项目基础

当前仓库已经存在 StarryOS 自编译脚本和文档基础：

- `scripts/prepare-selfhost-rootfs.sh`
- `scripts/self-compile.sh`
- `scripts/run-selfbuilt-kernel.sh`
- `os/StarryOS/docs/starryos-self-compilation.md`

当前仓库也已经存在 x86_64 QEMU 测试与 SMP 配置基础：

- `test-suit/starryos/qemu/build-x86_64-unknown-none.toml`
- `test-suit/starryos/qemu/system/qemu-x86_64.toml`

与题目直接相关的历史变更记录：

- `os/StarryOS/starryos/CHANGELOG.md`
  - `feat(starry): enable self-compilation on riscv64 with 12GB RAM`
  - `feat(starry): add x86_64 self-compilation scripts and documentation`
- `components/rsext4/CHANGELOG.md`
  - `feat(rsext4): fine-grained locking for SMP scalability`
- `scripts/axbuild/CHANGELOG.md`
  - `starry: unify qemu-smp1 and qemu-smp4 into single qemu test`

#### 已有基础
1. 仓库已经内建 `KVM` 自举脚本，`scripts/self-compile.sh` 会在可访问 `/dev/kvm` 时自动启用 `-enable-kvm`。
2. `test-suit/starryos/qemu/build-x86_64-unknown-none.toml` 当前已经设置 `max_cpu_num = 4`，说明标准测试内核本身并非只支持单核。
3. 自编译文档里记录过 `SMP=1` 成功、`SMP>1` 卡住的历史结论，但需要以当前 `dev` 代码重新复核。

### 简要总结
在 x86_64 Linux 宿主机上，通过 QEMU/KVM 创建一个具有多个虚拟 CPU 的运行环境，启动支持 SMP 的 StarryOS。在这个 StarryOS 的用户态中运行 Rust/Cargo 工具链，对挂载在 rootfs 中的 StarryOS 源码执行本地编译。编译期间需要让多个 Cargo/rustc 任务真正并行运行，并修复由多核调度、文件系统并发和内存管理引发的问题。最后将生成的新 StarryOS binary 再次作为 QEMU 内核启动，验证自举链路闭合。
>[!info] 什么是KVM
>KVM 是 **Kernel-based Virtual Machine**，中文通常叫“基于内核的虚拟机”。
>>它不是一个完整的虚拟机程序，而是 Linux 内核中的一套硬件虚拟化支持。它让 QEMU 可以直接利用 Intel VT-x 或 AMD-V，让虚拟机中的大部分 CPU 指令直接在真实 CPU 上执行，而不是由软件逐条翻译。
>- **StarryOS**：虚拟机里运行的客户操作系统。
>- **QEMU**：创建虚拟机，模拟主板、磁盘、网卡、串口等设备。
>- **KVM**：帮助 QEMU 高速执行客户机 CPU 指令。
>- **Linux 宿主机**：管理真实 CPU、内存和设备。
>KVM 可以通过硬件虚拟化，解决“虚拟 CPU 指令执行太慢”的问题


## 工作准备

### 前置命令
```bash
sudo apt-get update
sudo apt-get install -y \
  debootstrap \
  expect \
  e2fsprogs \
  qemu-system-x86 \
  qemu-utils \
  systemd-container
  
#必须可见kvm
test -r /dev/kvm && test -w /dev/kvm   
#要求无密码sudo
sudo -n true  
#项目构建测试
cargo test -p axbuild --lib
#准备rootfs
sudo ./scripts/prepare-selfhost-rootfs.sh --arch x86_64
```

可用`ls -l /dev/kvm`检查当前用户组是否可用kvm，避免直接跑脚本退回到 TCG
若没有，则可以添加用户组到可用group中
```bash
sudo usermod -aG kvm <user>
```
然后重开一个窗口，或者临时开一个新 shell：

```bash
newgrp kvm
```
sudo的问题直接给无密码权限我怀疑可能不安全，最好不要直接写入/etc/sudoers文件
```bash
sudo tee /etc/sudoers.d/starry-selfcompile > /dev/null <<EOF
czc ALL=(ALL) NOPASSWD: ALL
EOF

#全部测试完成后
sudo rm /etc/sudoers.d/starry-selfcompile
```

### 复现测试命令
```bash
./scripts/self-compile.sh --arch x86_64 --smp 1 --jobs 1
./scripts/run-selfbuilt-kernel.sh --arch x86_64 --smp 1
./scripts/self-compile.sh --arch x86_64 --smp 4 --jobs 4
./scripts/self-compile.sh --arch x86_64 --smp 8 --jobs 8
```
对多核任务的大概理解如下表：

| 配置                 | 结果                                       |
| ------------------ | ---------------------------------------- |
| `--smp 1 --jobs 8` | Cargo 想并行，但 StarryOS 只有一个 CPU，主要是并发而非并行  |
| `--smp 8 --jobs 1` | StarryOS 有 8 个 CPU，但 Cargo 基本串行，无法充分利用   |
| `--smp 8 --jobs 8` | Cargo 可以产生多个编译进程，StarryOS 可以把它们调度到多个 CPU |

### 遇到的问题
当前最新的dev分支应该是还未合并[feat(self-compile): enable StarryOS x86_64 self-compilation by seek-hope · Pull Request #1076 · rcore-os/tgoskits](https://github.com/rcore-os/tgoskits/pull/1076)的做法，当前不能直接使用dev分支进行，我打算在他的工作基础上进行优化
> [!example]- 基于 PR #1076 创建并维护开发分支  
> 假设远程仓库配置如下：
> 
> - `upstream`：官方仓库 `rcore-os/tgoskits`
>     
> - `origin`：自己的 Fork 仓库
>     
> 
> ### 首次创建开发分支
> 
> 从 GitHub 的 Pull Request 引用中获取 PR #1076 的最新提交，并保存为本地远程跟踪引用 `upstream/pr-1076`：
> 
> ```bash
> git fetch upstream \
>     +refs/pull/1076/head:refs/remotes/upstream/pr-1076
> ```
> 
> `+` 表示即使 PR 作者执行过 rebase 或 force push，也允许本地的 `upstream/pr-1076` 更新到新的提交位置。
> 
> 基于 PR #1076 创建自己的功能分支，不要直接在本地 `dev` 分支上开发：
> 
> ```bash
> git switch -c x86_64-selfhost-smp upstream/pr-1076
> ```
> 
> 检查当前提交历史：
> 
> ```bash
> git log --oneline --decorate -10
> ```
> 
> 验证 PR #1076 的最新提交是不是当前分支的祖先：
> 
> ```bash
> git merge-base --is-ancestor upstream/pr-1076 HEAD
> echo $?
> ```
> 
> 最后一条命令输出 `0`，说明当前分支确实建立在 PR #1076 的代码基础上。
> 
> 将新分支推送到自己的 Fork：
> 
> ```bash
> git push -u origin x86_64-selfhost-smp
> ```
> 
> `-u` 会建立本地分支与远程分支之间的跟踪关系。后续可以直接执行：
> 
> ```bash
> git push
> git pull
> ```
> 
> ---
> 
> ### 同步 PR #1076 的后续更新
> 
> 当 PR 作者又提交了新的代码时，重新获取 PR 的最新状态：
> 
> ```bash
> git fetch upstream \
>     +refs/pull/1076/head:refs/remotes/upstream/pr-1076
> ```
> 
> 切换到自己的开发分支：
> 
> ```bash
> git switch x86_64-selfhost-smp
> ```
> 
> 确认当前工作区没有尚未提交的修改：
> 
> ```bash
> git status
> ```
> 
> 将自己的提交重新放到 PR #1076 最新提交之后：
> 
> ```bash
> git rebase upstream/pr-1076
> ```
> 
> 更新后的提交关系为：
> 
> ```text
> PR #1076 的最新提交
>         │
>         ├── 我的提交 1
>         ├── 我的提交 2
>         └── 我的提交 3
> ```
> 
> 由于 `rebase` 会重写自己的提交 ID，如果该分支已经推送到 Fork，需要执行：
> 
> ```bash
> git push --force-with-lease
> ```
> 
> `--force-with-lease` 会先检查远程分支是否被其他人更新，比直接使用 `--force` 更安全。
> 
> > [!warning] 不要直接修改本地 `dev`  
> > 本地 `dev` 应当用于跟踪官方仓库的 `upstream/dev`。具体功能开发应始终放在独立分支中，避免同步上游时混入自己的修改。

在这个分支下，使用这个命令先复现结果
```shell
cd /home/czc/tgoskits

sudo ./scripts/prepare-selfhost-rootfs.sh --arch x86_64 --force \
  2>&1 | tee /tmp/starry-prepare-x86_64.log

sudo rm -rf tmp/selfhost tmp/esp-x86_64
rm -f tmp/starryos-selfbuilt-x86_64 tmp/starryos-selfbuilt-x86_64.bin

./scripts/self-compile.sh \
  --arch x86_64 \
  --smp 4 \
  --jobs 4 \
  2>&1 | tee /tmp/starry-selfhost-x86_64-smp4.log

./scripts/run-selfbuilt-kernel.sh --arch x86_64
```

- 在此分支下还发现qemu的axbuild并不会把smp参数传给guest OS，导致实际自编译只使用了单核进行。

## 当前进度
### baseline
编译了 `426` 个 crates / build units，guest build 耗时 `1588.25 s`。
baseline 日志：`.agents/log/starry-x86_64-selfhost-smp4-baseline-2026-07-12.log`
### 已做优化
修改了 `os/arceos/modules/axtask` 模块，最终采用的是参考 Linux CFS wakeup placement 的 idle CPU 优先调度策略：在 SMP 场景下，新任务优先投递到已经处于 idle 状态的 CPU；如果没有可用 idle CPU，则回退到 round-robin 分散；唤醒任务仍保持 wake affinity，优先当前 CPU 和任务上次运行 CPU，避免破坏 wait/future 路径的前进性。
- 增加 `RUN_QUEUE_IDLE`，记录每个 CPU 当前是否正在运行 idle task。
- 在 `switch_to()` 中根据 `next_task.is_idle()` 更新对应 CPU 的 idle 状态。
- 在 `add_task()`、`put_task_with_state()`、`migrate_entry()` 中，只要有任务进入某个 runqueue，就调用 `mark_run_queue_has_work()` 清除该 CPU 的 idle 标记。
- 新增 `select_idle_run_queue_index_with()`，在任务投递时优先寻找符合 cpumask、已初始化、可接收任务、且处于 idle 的 CPU。
- 新增 `select_idle_affine_wake_run_queue_index_with()`，wake 路径先保持当前 CPU / 上次 CPU 亲和，只有 fallback 时才考虑 idle CPU。
参考链接为：
- [https://docs.kernel.org/scheduler/sched-design-CFS.html](https://docs.kernel.org/scheduler/sched-design-CFS.html)
- [https://codebrowser.dev/linux/linux/kernel/sched/fair.c.html](https://codebrowser.dev/linux/linux/kernel/sched/fair.c.html)
- [https://docs.kernel.org/scheduler/sched-domains.html](https://docs.kernel.org/scheduler/sched-domains.html)
编译了 `426` 个 crates / build units，guest build 耗时 `1326.17 s`，相对 baseline 加速比为 `1.20x`，耗时降低 `16.50%`。QEMU 总耗时从 `3632.42 s` 降到 `3070.14 s`，降低 `15.48%`。

### 多核并发的线程上
优化前：
```c
CPU - sysbench cpu --cpu-max-prime=20000 --time=5 (events/sec, higher = better)
threads    StarryOS smp4      StarryOS smp8
1          1278.26            1294.17
2          1265.18            1329.54
4          1262.22            1305.88

Scaling (1->4 threads): StarryOS smp4 0.99x; StarryOS smp8 1.01x
StarryOS smp4 vs smp8 at 4 threads: 1.03x
```
几乎没有多核的效力。经排查，缘由在这个链路：
- sysbench 的 pthread worker 在 StarryOS 里走 Linux `clone(2)` syscall。调用 spawn_task(new_task)
- `spawn_task()` 会调用 `select_run_queue()`，新 task 默认 cpumask 是所有 CPU 都允许，可是select_run_queue的旧逻辑是当前cpu在线就直接返回当前cpu，导致sysbench 主线程在哪个 CPU 上创建 worker，worker 就优先被放回同一个 CPU。因为 worker 默认允许跑所有 CPU，所以这个 `if task.cpumask().get(current_cpu)` 永远容易命中。
```rust
        let current_cpu = this_cpu_id();
        let index = if task.cpumask().get(current_cpu) {
            current_cpu
        } else {
            select_run_queue_index(task.cpumask())
        };
```

- 本次优化在其中加入了空闲cpu的检查逻辑。

| 路径                     | 最终策略                                           | 原因                                                                       |
| ---------------------- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| 新建 task / fork / clone | 原子认领可用 idle CPU；无 idle 时选择 ready+running 最少的队列 | 新任务尚无 cache 历史，优先让独立 worker 立即使用空核；同负载才用 creator CPU 打破平局                |
| wake blocked task      | 原子认领空闲的 `last_cpu`；否则找其他 idle CPU；全忙时选最轻队列     | last/waker CPU 只作同负载的亲和 tie-break，避免 barrier broadcast 将多个 worker 重叠到同一核 |
| affinity migration     | 在 ready 且满足 affinity 的 CPU 中 round-robin       | 当前 CPU 已不在新 affinity 内，且 migration 不应消费新任务的 idle reservation             |
- `run_queue.rs` 新增 `RUN_QUEUE_INITIALIZED[]`，以 Release/Acquire 发布和观察每个 run queue；
- 新增 `RUN_QUEUE_ACTIVITY[]` 三态 placement hint；新任务和 wake 通过 `compare_exchange(IDLE, RESERVED, AcqRel, Acquire)` 原子认领空核，失败 wake 通过 RAII token 安全回滚，activity 不参与 task state 状态机；
- `AxRunQueue::ready_tasks` 完整记录 scheduler ready queue 中的任务数；所有 add、unblock、 reschedule dequeue 和 migration enqueue 都成对更新。它与 `RUN_QUEUE_ACTIVITY` 合成 `ready + running` load，避免只看 idle hint 时把第四个 worker 再放到已占用的次核；
- 使用独立的 `NEXT_IDLE_RUN_QUEUE` 和 `NEXT_RUN_QUEUE` 游标；原子游标使用 `Relaxed`，因为它们 只决定 idle 扫描和同负载选择的起点，不承担对象发布；`ready_tasks` 的 Relaxed 读取也只影响 placement 质量，task 发布仍由 scheduler lock 保证；
- `select_new_task_run_queue()` 实现 idle-first + least-runnable-load；
- `select_wake_run_queue()` 对 last CPU 和其他 idle CPU 做原子 claim，再以 least-load 回退；
- `select_migration_run_queue()` 保持 affinity migration 与 idle reservation 分离；
- `api.rs` 的 `spawn_task()` 走新任务 selector，raw WaitQueue/signal 的 `wake_task()` 走 wake selector；`timers.rs` 仍优先 timer 所属 CPU，仅 affinity 变化时走 wake selector；
- 保留既有 remote reschedule IPI 与 `on_cpu` hand-off 协议，没有引入需要跨 run queue 取任务、 额外锁顺序和 task-state 转移的 work stealing。
```c
CPU - sysbench cpu --cpu-max-prime=20000 --time=5 (events/sec, higher = better)
threads    StarryOS smp4      StarryOS smp8     
1          1246.40            1208.67           
2          2454.31            2546.06           
4          4602.60            5021.06           
```

我有问题，测sysbench的时候我们跑出来的数据如下：CPU - sysbench cpu --cpu-max-prime=20000 --time=5 (events/sec, higher = better)  
threads StarryOS smp4 StarryOS smp8  
1 1246.40 1208.67  
2 2454.31 2546.06  
4 4602.60 5021.06  
这个数据啊，smp8的thread4为什么可以超过4倍thread1的数据呢，这不是非常奇怪吗，相当于超线程了。给我个解释呢

小的benchmark如sysbench可以跑出来性能的问题在哪，但是一旦跑复杂的程序，selfcompile这种大的工程，就会很难一下提升性能，找不到突破点。这样
- 如何使用工具分析性能瓶颈
    - linux是如何处理多核、并行场景的（perf ebpf等工具分析内核性能），我们在starry中也有ebpf，如何使用

    - 去年有做qperf热力图分析函数的开销，这个我们能不能使用
这些工具，需要落在实现层面上告诉我可以怎么用

    - 最新pr针对3588的pmu硬件单元的perf支持。
### 多核调度问题
唤醒路径错误复用了 idle CPU reservation，与任务迁移及 `on_cpu/wake_handoff` 并发状态交错，导致 guest 重启。
### 复现测试
构造了等价 probe：8 个线程
每轮把自身 affinity 设为 CPU `round % 4`，执行 CPU 检查和私有数据计算，短暂睡眠后通过条件变量同步，连续 96 轮。