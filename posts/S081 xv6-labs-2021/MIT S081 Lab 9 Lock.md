---
title: "MIT S081 Lab 9: Lock"
cover: false
categories:
  - MIT S081
  - S081 xv6-labs-2021
---

# MIT S081 Lab 9: Lock
_和lab8换一下顺序_
## 知识
锁提供了互斥，确保一次只有一个CPU可以持有锁。如果程序员将每个共享数据项关联一个锁，并且代码在使用一个数据项时总是持有相关联的锁，那么该项一次将只被一个CPU使用。在这种情况下，我们说锁保护数据项。尽管锁是一种易于理解的并发控制机制，但锁的缺点是它们会扼杀性能，因为它们会串行化并发操作。
[第六章 锁 · 6.S081 All-In-One](https://xv6.dgs.zone/tranlate_books/book-riscv-rev1/c6/s0.html)
[3.5 代码：物理内存分配 · 6.S081 All-In-One](https://xv6.dgs.zone/tranlate_books/book-riscv-rev1/c3/s5.html)
### 竞态条件
### 自旋锁（spinlocks）和睡眠锁（sleep-locks）
```spinlock.c
void
acquire(struct spinlock *lk)
{
  push_off(); // disable interrupts to avoid deadlock.
  if(holding(lk))
    panic("acquire");
  
#ifdef LAB_LOCK
    __sync_fetch_and_add(&(lk->n), 1);
#endif      
  
  // On RISC-V, sync_lock_test_and_set turns into an atomic swap:
  //   a5 = 1
  //   s1 = &lk->locked
  //   amoswap.w.aq a5, a5, (s1)
  while(__sync_lock_test_and_set(&lk->locked, 1) != 0) {
#ifdef LAB_LOCK
    __sync_fetch_and_add(&(lk->nts), 1);
#else
   ;
#endif
  }
  
  // Tell the C compiler and the processor to not move loads or stores
  // past this point, to ensure that the critical section's memory
  // references happen strictly after the lock is acquired.
  // On RISC-V, this emits a fence instruction
  __sync_synchronize();
  
  // Record info about lock acquisition for holding() and debugging.
  lk->cpu = mycpu();
}
```
Xv6的`acquire`(**_kernel/spinlock.c_**:22)使用可移植的C库调用归结为`amoswap`的指令`__sync_lock_test_and_set`；返回值是`lk->locked`的旧（交换了的）内容。`acquire`函数将swap包装在一个循环中，直到它获得了锁前一直重试（自旋）。每次迭代将1与`lk->locked`进行swap操作，并检查`lk->locked`之前的值。如果之前为0，swap已经把`lk->locked`设置为1，那么我们就获得了锁；如果前一个值是1，那么另一个CPU持有锁，我们原子地将1与`lk->locked`进行swap的事实并没有改变它的值。
_` while(__sync_lock_test_and_set(&lk->locked, 1) != 0)`一直尝试交换，若值成功改变返回值才会是1，也就是while退出的条件是`lk->locked==1`，_
获取锁后，用于调试，`acquire`将记录下来获取锁的CPU。`lk->cpu`字段受锁保护，只能在保持锁时更改。

禁止自旋锁持有的时候执行流切换。

Xv6以睡眠锁（sleep-locks）的形式提供了这种锁。`acquiresleep` (**_kernel/sleeplock.c_**:22) 在等待时让步CPU，使用的技术将在第7章中解释。在更高层次上，睡眠锁有一个被自旋锁保护的锁定字段，`acquiresleep`对`sleep`的调用原子地让出CPU并释放自旋锁。结果是其他线程可以在`acquiresleep`等待时执行。
_其实本质上也是互斥锁。也就是尝试获取锁，获取失败的时候就切换线程（sleep），释放锁的时候，如果有线程在等待这把锁就把相应的线程唤醒。_
### Q:互斥锁和自旋锁区别是什么？
#### 锁的类型
##### 自旋锁（Spinning Lock）：
自旋锁是一种忙等待（busy-waiting）的锁机制。当一个线程尝试获取一个已被其他线程持有的自旋锁时，它不会立即阻塞（即不会进入睡眠状态），而是在当前位置不断循环检查锁是否已被释放。这种方式称为“自旋”，因为线程在锁被释放前会持续“旋转”或循环检查。
**特点**：
- 忙等待：线程在锁被持有时不会睡眠，而是不断检查锁的状态。
- 低延迟：适用于锁持有时间短且线程不希望在锁释放前让出CPU的情况。
- 适用于中断处理：在中断上下文中通常不允许睡眠，自旋锁是首选。
- CPU资源消耗：如果锁被长时间持有，自旋锁会导致CPU资源的浪费。
##### 睡眠锁（Sleeping Lock）：
睡眠锁通常指的是那些在无法立即获得时会让线程进入睡眠状态的锁，如互斥锁（mutex）。当一个线程尝试获取一个已被其他线程持有的睡眠锁时，它会进入睡眠状态，直到锁被释放并被唤醒。
**特点**：
- 线程睡眠：当线程无法获取锁时，它会被放入睡眠状态，直到锁被释放。
- 适用于长持有时间：当锁可能被长时间持有时，使用睡眠锁可以避免浪费CPU资源。
- 可能引起线程切换：线程在睡眠时可能会引起操作系统进行线程切换。
- 可能涉及上下文切换开销：唤醒线程并将其调度到运行状态可能涉及上下文切换的开销。
###   死锁和锁排序
如果一个自旋锁被中断处理程序所使用，那么CPU必须保证在启用中断的情况下永远不能持有该锁。Xv6更保守：当CPU获取任何锁时，xv6总是禁用该CPU上的中断。中断仍然可能发生在其他CPU上，此时中断的`acquire`可以等待线程释放自旋锁；由于不在同一CPU上，不会造成死锁。

- [MIT6.S081实验-Lab7. 生产者消费者模型_哔哩哔哩_bilibili](https://www.bilibili.com/video/BV1Ua411s77u/?spm_id_from=333.1387.upload.video_card.click&vd_source=f22a5dbc88f588b0e9cea7207935f4e7)有空看下这个视频。

## Memory allocator(moderate)
这个实验打印的信息是各个部分的锁被占用时其他程序尝试获取锁的次数，我们的目标是降低这个锁的抢占次数，主要是kmem，然后把kmem的信息打印出来
### 要点
- 修改结构体
```kalloc.c
struct {
  struct spinlock lock;
  struct run *freelist;
} kmem[NCPU];
```
- 修改函数：`kinit()``kalloc()``kfree`
kinit需要按照要求命名函数为kmem开头。
kfree需要把本来的单个变量改为数组变量中的元素，注意关中断获取当前cpu号
kalloc需要在没有空余页面时把返回值改为别人的页面（kalloc原本作用是返回一个内核可用的页面的指针，此时需要改成另一个cpu拥有的空余列表的指针）

push_off()和pop_off()是通过修改cpu结构体的noff变量来标志开关中断的

```kalloc
void * kalloc(void)
{
 ...
  r = kmem[id].freelist;
  if(r)
    kmem[id].freelist = r->next;
 ...
 }
```
关于这个函数中，`kmem[id].freelist = r->next;`不能写成`r=r->next`.要改的内容是空闲列表。（这问题也只有我能出现了）
### 遗留问题

实现这个功能之前是什么样的呢？整个内存空间当作一个空闲列表，只有一把锁被8个cpu争抢吗。

我的打印信息是  `n = snprintf(buf, sz, "lock: %s: #test-and-set %d #acquire() %d\n"`
实验官网给的是`lock: kmem: #fetch-and-add 0 #acquire() 42843`，区别是？

## Buffer cache ([hard](https://pdos.csail.mit.edu/6.S081/2021/labs/guidance.html))
减少块缓存中的争用比`kalloc`更复杂，因为bcache缓冲区真正的在进程（以及CPU）之间共享。对于`kalloc`，可以通过给每个CPU设置自己的分配器来消除大部分争用；这对块缓存不起作用。我们建议您使用每个哈希桶都有一个锁的哈希表在缓存中查找块号。

### 步骤 
根据提示一步一步来
#### 1、定义哈希结构
```bio.c
#define NBUCKET 13
#define HASH(id) (id % NBUCKET)

struct {
  struct buf buf[NBUF];
  struct hashbuf buckets[NBUCKET];  // 散列桶
} bcache;

```
13个散列桶的哈希结构，随即使用13把锁
#### 2、在`binit`中，
1. 初始化散列桶的锁，
2. 将所有散列桶的`head->prev`、`head->next`都指向自身表示为空，
3. 将所有的缓冲区挂载到`bucket[0]`桶上
#### 3、 删除head
删除保存了所有缓冲区的列表（`bcache.head`等），改为标记上次使用时间的时间戳缓冲区（即使用`kernel/trap.c`中的`ticks`）。通过此更改，`brelse`不需要获取bcache锁，并且`bget`可以根据时间戳选择最近使用最少的块。
_这里的意思是本来brelse需要访问bcache，把释放的块从链表中去掉，这个操作需要获取锁。如果用`ticks`替代链表的顺序操作，就可以省去这一次对锁的获取。_
 在**buf.h** 中增加新字段`timestamp`，这里来理解一下这个字段的用途：在原始方案中，每次`brelse`都将被释放的缓冲区挂载到链表头，禀明这个缓冲区最近刚刚被使用过，在`bget`中分配时从链表尾向前查找，这样符合条件的第一个就是最久未使用的。而在提示中建议使用时间戳作为LRU判定的法则，这样我们就无需在`brelse`中进行头插法更改结点位置
#### 4、更改`brelse`，不再获取全局锁
```
void
brelse(struct buf* b) {
  if(!holdingsleep(&b->lock))
    panic("brelse");

  int bid = HASH(b->blockno);

  releasesleep(&b->lock);

  acquire(&bcache.buckets[bid].lock);//全局锁改为哈希锁
  b->refcnt--;

  // 更新时间戳
  // 由于LRU改为使用时间戳判定，不再需要头插法
  acquire(&tickslock);
  b->timestamp = ticks;
  release(&tickslock);

  release(&bcache.buckets[bid].lock);
}
```
这里的ticks是自启动以来经过的时间
#### 5、 更改`bget`
当没有找到指定的缓冲区时进行分配，分配方式是优先从当前列表遍历，找到一个没有引用且`timestamp`最小的缓冲区，如果没有就申请下一个桶的锁，并遍历该桶，找到后将该缓冲区从原来的桶移动到当前桶中，最多将所有桶都遍历完。在代码中要注意锁的释放



### 遗留问题
报错out of blocks，博客上没说出现这种错误，研究一下方法有什么问题。

_报这个错不是代码的问题，是文件系统大小不够。进去fs.c发现分配的块数不够。可以在parah.h里面修改FSSIZE_


___
