---
title: "MIT S081 Lab 7: Multithreading"
cover: false
categories:
  - MIT S081
---

# MIT S081 Lab 7: Multithreading
## 前置知识
### 多路复用
第一：当进程等待设备或管道I/O完成，或等待子进程退出，或在`sleep`系统调用中等待时，xv6使用睡眠（sleep）和唤醒（wakeup）机制切换。
第二：xv6周期性地强制切换以处理长时间计算而不睡眠的进程。这种多路复用产生了每个进程都有自己的CPU的错觉，就像xv6使用内存分配器和硬件页表来产生每个进程都有自己内存的错觉一样。
### 上下文切换
函数`swtch`为内核线程切换执行保存和恢复操作。`swtch`对线程没有直接的了解；它只是保存和恢复寄存器集，称为上下文（contexts）。当某个进程要放弃CPU时，该进程的内核线程调用`swtch`来保存自己的上下文并返回到调度程序的上下文。每个上下文都包含在一个`struct context`（**_kernel/proc.h_**:2）中，这个结构体本身包含在一个进程的`struct proc`或一个CPU的`struct cpu`中。`Swtch`接受两个参数：`struct context *old`和`struct context *new`。它将当前寄存器保存在`old`中，从`new`中加载寄存器，然后返回。

我们在第4章中看到，中断结束时的一种可能性是`usertrap`调用了`yield`。依次地：`Yield`调用`sched`，`sched`调用`swtch`将当前上下文保存在`p->context`中，并切换到先前保存在`cpu->scheduler`（**_kernel/proc.c_**:517）中的调度程序上下文。

swtch:将被调用者寄存器14个保存到调度器的上下文里，然后寻找下一个能够执行的寄存器并装载上。`swtch(ctx1,ctx2)`,把callee的内容保存到ctx1里面，把ctx2的内容恢复到被调用者寄存器中。
```proc.c
for(p = proc; p < &proc[NPROC]; p++) {
      acquire(&p->lock);
      if(p->state == RUNNABLE) {
        // Switch to chosen process.  It is the process's job
        // to release its lock and then reacquire it
        // before jumping back to us.
        p->state = RUNNING;
        c->proc = p;
        swtch(&c->context, &p->context);
  
        // Process is done running for now.
        // It should have changed its p->state before coming back.
        c->proc = 0;
      }
      release(&p->lock);
    }
```
## Uthread: switching between threads
我们需要修改的两个函数请进入内核去找匹配的函数

```proc.c
void
scheduler(void)
{
  struct proc *p;
  struct cpu *c = mycpu();
  c->proc = 0;
  for(;;){
    // Avoid deadlock by ensuring that devices can interrupt.
    intr_on();
    for(p = proc; p < &proc[NPROC]; p++) {
      acquire(&p->lock);
      if(p->state == RUNNABLE) {
        // Switch to chosen process.  It is the process's job
        // to release its lock and then reacquire it
        // before jumping back to us.
        p->state = RUNNING;
        c->proc = p;
        swtch(&c->context, &p->context);
  
        // Process is done running for now.
        // It should have changed its p->state before coming back.
        c->proc = 0;
      }
      release(&p->lock);
    }
  }
}
```

```proc.c
static struct proc*
allocproc(void)
{
  ...
  ...
  // Set up new context to start executing at forkret,
  // which returns to user space.
  memset(&p->context, 0, sizeof(p->context));
  p->context.ra = (uint64)forkret;
  p->context.sp = p->kstack + PGSIZE;
  
  return p;
}
```
然后照着改就好了，另外uthread_switch可以照抄swtch。

### 添加context
- 照抄一个proc.h里面的context，并添加到thread结构体里面。
```
struct thread {
  char       stack[STACK_SIZE]; /* the thread's stack */
  int        state;             /* FREE, RUNNING, RUNNABLE */
  struct tcontext context;
};
```
- you can pass whatever arguments you need to thread_switch, but the intent is to switch from thread t to next_thread.这意味着你传的参数要照着swtch那样传递context
```thread_swtich
  if (current_thread != next_thread) {         /* switch threads?  */
    next_thread->state = RUNNING;
    t = current_thread;
    current_thread = next_thread;
    /* YOUR CODE HERE
     * Invoke thread_switch to switch from t to next_thread:*/
    thread_switch((uint64)&t->context, (uint64)&next_thread->context);
    next_thread=0;
```


## pthread 
### 知识
[多线程算法 - 飞书云文档](https://tarplkpqsm.feishu.cn/docs/doccnLfsar3hjWDfcZydFqe6Eub)
[MIT6.S081. Lab7. 互斥锁与哲学家进餐_哔哩哔哩_bilibili](https://www.bilibili.com/video/BV1Su411r7NH?spm_id_from=333.788.videopod.sections&vd_source=f22a5dbc88f588b0e9cea7207935f4e7)
原子指令
[__sync Builtins (Using the GNU Compiler Collection (GCC))](https://gcc.gnu.org/onlinedocs/gcc/_005f_005fsync-Builtins.html)
互斥锁
[pthread_mutex_lock](https://pubs.opengroup.org/onlinepubs/007908799/xsh/pthread_mutex_lock.html)
条件变量
[pthread_cond(3)](https://www.daemon-systems.org/man/pthread_cond.3.html)
_建议去听一下阿苏讲的多线程算法，听完后会觉得实验里的并发非常简单。_

###  Using threads (moderate)
很简单
ph函数本质上是对输入按照NBUCKET进行哈希分类，用链表结构头插入余数相同的桶里。

_假设现在有两个线程T1和T2，两个线程都走到put函数，且假设两个线程中key%NBUCKET相等，即要插入同一个散列桶中。两个线程同时调用insert(key, value, &table[i], table[i])，insert是通过头插法实现的。如果先insert的线程还未返回另一个线程就开始insert，那么前面的数据会被覆盖_

所以要做的就是给插入操作上锁就可以了。
```
void put(int key, int value)
{
...
  if(e){
    // update the existing key.
    e->value = value;
  } else {
    // the new is new.
    pthread_mutex_lock(&lock);
    insert(key, value, &table[i], table[i]);
    pthread_mutex_unlock(&lock);
  } 
}
```
实际上，最好的办法是每一个桶单独用一个锁，可以提升效率。但是测试发现我一共只用了一把锁也可以通过fast测试。
### Barrier
```barrier.c
static int nthread = 1;
static int round = 0;
  
struct barrier {
  pthread_mutex_t barrier_mutex;
  pthread_cond_t barrier_cond;
  int nthread;      // Number of threads that have reached this round of the barrier
  int round;     // Barrier round
} bstate;
```
程序有这几个变量，一定是用于全局判断和轮数判断的。
我们可以在barrier中设置一个等待并增加`bstate.nthread`，让与`nthread`相等时再放出。

实际上，不需要while调用wait，在本例的逻辑中，我们只需要用if，每一个线程调用barrier时如果不是最后一个便开始等待。最后一个线程满足条件后出发signal会唤醒其他所有的wait。
```barrier.c
static void
barrier()
{
  // Block until all threads have called barrier() and
  // then increment bstate.round.
  pthread_mutex_lock(&bstate.barrier_mutex);
  bstate.nthread++;
  if(bstate.nthread!=nthread)
  {
    pthread_cond_wait(&bstate.barrier_cond,&bstate.barrier_mutex);
  }
  else
  {
    bstate.round++;
    bstate.nthread=0;
    pthread_cond_signal(&bstate.barrier_cond);
  }
  pthread_mutex_unlock(&bstate.barrier_mutex);
}
```
注意，改变全局变量的操作一定要放在锁的作用范围内，否则会引发冲突，会使条件无法满足。
___
