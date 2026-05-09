---
title: "MIT S081 Lab 5: xv6 lazy page allocation"
cover: false
categories:
  - MIT S081
  - S081 xv6-labs-2021
---

# MIT S081 Lab 5: xv6 lazy page allocation
这个实验在S081 2021网站上已经没有了，参见国人翻译的实验指导书[Lab5: Xv6 lazy page allocation · 6.S081 All-In-One](http://xv6.dgs.zone/labs/requirements/lab5.html)，只能看，2020版是包含这个实验的。

即便做不了，还是建议阅读一下里面的代码，然后看一下这个实验用到了哪些函数，在Lab6里面会提到。
- ==内核崩溃会报出这样的错误信息：
`"usertrap(): unexpected scause %p pid=%d\n", r_scause(), p->pid), sepc=%p stval=%p\n", r_sepc(), r_stval());`这时我们就能够看到`sepc`，然后进入kernel/kernel.asm的汇编文件去考察sepc所在的指令地址。==
## Eliminate allocation from sbrk()
```sysproc.c
uint64
sys_sbrk(void)
{
  int addr;
  int n;
  if(argint(0, &n) < 0)
    return -1;
  addr = myproc()->sz;
  if(growproc(n) < 0)
    return -1;
  return addr;
}
```
其中`uint64 sz;           // Size of process memory (bytes)`
## Lazy allocation (moderate)
所以是用户空间每一次都使用sbrk请求堆内存，请求时因为懒分配，会让用户进程的大小加n，但实际上没有分配内存。当用户态访问到那部分内存时，会引起页面错误（usertrap）并且是用户态的陷入。所以在用户态的陷入中缺页异常都是懒分配引起的，这时只需要延后分配一个页面。处理usertrap中的页面错误，分配一个新的页面。
那么在分配页面之前，pte也是无效的。页表在释放时，其中的页表项有很多无效的pte，需要无视。
传统的设计中，free页表时页表的所有空间都是有效的。而懒分配中会允许大量有效位为0的页表项出现。此时uvmunmap的时候只需要跳过，且改变真正的释放页表的条件（只有页表项有效时才释放）

我们考虑3级页表的读取方式
```c
static pte_t *
walk(pagetable_t pagetable, uint64 va, int alloc)
{
  if(va >= MAXVA)
    panic("walk");

  for(int level = 2; level > 0; level--) {
    pte_t *pte = &pagetable[PX(level, va)];
    if(*pte & PTE_V) {
      pagetable = (pagetable_t)PTE2PA(*pte);
    } else {
      if(!alloc || (pagetable = (pde_t*)kalloc()) == 0)
        return 0;
      memset(pagetable, 0, PGSIZE);
      *pte = PA2PTE(pagetable) | PTE_V;
    }
  }
  return &pagetable[PX(0, va)];
}
```
level=2和1时会判断pte是否有效，而最低级页表不会判断是否有效，无效的pte也可能被返回。这个问题需要在unmap中正确调用。
这就是为什么总是在freewalk里面爆出panic:freewalk:leaf(`freewalk`的作用是递归释放​**​页表结构​**​（非叶子页表项），预期所有​**​叶子页表项​**​（直接映射物理内存的项）应已提前被释放。这个panic的原因就是叶子节点没有被uvmunmap正确释放)
```c
static void
freewalk(pagetable_t pagetable)
{
  // there are 2^9 = 512 PTEs in a page table.
  for(int i = 0; i < 512; i++){
    pte_t pte = pagetable[i];
    if((pte & PTE_V) && (pte & (PTE_R|PTE_W|PTE_X)) == 0){
      // this PTE points to a lower-level page table.
      uint64 child = PTE2PA(pte);
      freewalk((pagetable_t)child);
      pagetable[i] = 0;
    } else if(pte & PTE_V){   //此处最低级页表判断项可能没有被unmap
      panic("freewalk: leaf");
    }
  }
  kfree((void*)pagetable);
}
```
```c
void
uvmunmap(pagetable_t pagetable, uint64 va, uint64 size, int do_free)
{
  uint64 a, last;
  pte_t *pte;
  uint64 pa;

  a = PGROUNDDOWN(va);
  last = PGROUNDDOWN(va + size - 1);
  for(;;){
    pte = walk(pagetable, a, 0);
    // if((*pte & PTE_V) == 0)
    if(*pte&&PTE_FLAGS(*pte) == PTE_V)
      panic("uvmunmap: not a leaf");
    if(*pte&&do_free){
      pa = PTE2PA(*pte);
      kfree((void*)pa);
    }
    if(*pte)
      *pte = 0;
    if(a == last)
      break;
    a += PGSIZE;
    pa += PGSIZE;
  }
}
```
## Lazytests and Usertests (moderate)
- 处理`sbrk()`参数为负的情况。
- 如果某个进程在高于`sbrk()`分配的任何虚拟内存地址上出现页错误，则终止该进程。
    - 即不能超过当前内存的大小。用`myproc()->sz`来判断地址是否超过。
- 在`fork()`中正确处理父到子内存拷贝。
- 处理这种情形：进程从`sbrk()`向系统调用（如`read`或`write`）传递有效地址，但尚未分配该地址的内存。
    - syscall的流程是用户陷入，r_scause=8，进入syscall。此时如果参数中的地址是未分配的，就不会因为陷入进入r_scause=13||15的pagefault处理之中。所以需要在syscall的处理地址参数处分配
- 
- 正确处理内存不足：如果在页面错误处理程序中执行`kalloc()`失败，则终止当前进程。
- 处理用户栈下面的无效页面上发生的错误。
___
