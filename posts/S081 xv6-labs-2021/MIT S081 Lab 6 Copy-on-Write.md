---
title: "MIT S081 Lab 6: Copy-on-Write"
cover: false
categories:
  - MIT S081
---

# MIT S081 Lab 6: Copy-on-Write
## 前置知识
### 问题
准备：切换到 cow 分支

**思厥先祖父，暴霜露，斩荆棘，以有尺寸之地。子孙视之不甚惜，举以予人，如弃草芥。**

目前 xv6 的 fork 系统调用创建的子进程会赋值父进程所有的用户态内存，如果父进程比较大，那么这个复制过程会很耗时，而且一般通过 fork 创建的进程会紧接着执行 exec 系统调用，这将丢弃 fork 阶段拷贝的所有内存。

因此，我们需要实现一个具有cow功能的fork，在创建子进程的时候仅创建一个页表，而实际的内容(PTE)仍然指向父进程。当进程需要写某些内容的时候，发生页错误，在页错误的处理函数中为进程分配一个新的页面，并拷贝该页面的内容（不管是父进程还是子进程，谁先触发谁拷贝）。

cow会使得物理页的回收变得麻烦，因为一个物理页可能被很多进程共享，只有最后一个引用该页面的进程释放该页面，该页面才能得到回收。
#### **详细说明** 
[8.4 Copy On Write Fork | MIT6.S081](https://mit-public-courses-cn-translatio.gitbook.io/mit6-s081/lec08-page-faults-frans/8.4-copy-on-write-fork)
先阅读以上的原理说明
[Lab6: Copy-on-Write Fork for xv6 · 6.S081 All-In-One](http://xv6.dgs.zone/labs/requirements/lab6.html)
再看这是实验的解决计划。
## 思路
 1. 将子进程的页表映射到父进程上，并将二者的权限设为READ。
_修改PTE项位_
 2. 考察触发的page fault是否是COW导致的（在PTE上设置标记位，标记这是copy-on-write的页面。）
_若是，则解除映射，拷贝到新的存储空间。定义新的PTE位_
 3. 对于有其他映射的物理页面，使用引用计数（当我们释放虚拟page时，我们将物理内存page的引用数减1，如果引用数等于0，那么我们就能释放物理内存page。）
## 步骤
### 1、修改uvmcopy
**直接将地址映射而不是分配新内存。传参数改为原本的物理地址，将新分配的mem删除**
```vm.c
int
uvmcopy(pagetable_t old, pagetable_t new, uint64 sz)

{
  pte_t *pte;
  uint64 pa, i;
  uint flags;
  for(i = 0; i < sz; i += PGSIZE){
    if((pte = walk(old, i, 0)) == 0)
      panic("uvmcopy: pte should exist");
    if((*pte & PTE_V) == 0)
      panic("uvmcopy: page not present");
    pa = PTE2PA(*pte);
    *pte =*pte & ~PTE_W;
    *pte =*pte | PTE_COW;
    flags = PTE_FLAGS(*pte);
    incr((void*)pa);
    if(mappages(new, i, PGSIZE, (uint64)pa, flags) != 0){
      printf("uvncopy error\n");
      goto err;
    }
  }
  return 0;
 err:
  uvmunmap(new, 0, i / PGSIZE, 1);
  return -1;
}
```
此处回收pte中的写权限，并添加标志位`PTE_COW`，添加定义.
```riscv.h
#define                    PTE_COW (1L << 8) //8-> cow bit
```
将mappage中的mem修改为pa，
-  _mappage函数用于添加映射`int mappages(pagetable_t pagetable, uint64 va, uint64 size, uint64 pa, int perm)`，其中`perm`用于添加标志（` *pte = PA2PTE(pa) | perm | PTE_V;`）_
- _uvmunmap函数用于解除映射（`void uvmunmap(pagetable_t pagetable, uint64 va, uint64 npages, int do_free)`）,`do_free`标记是否调用`kfree`删除该页_
### 2、修改`usertrap()`以识别缺页异常
**添加缺页异常的else情况**
```trap.c
  else if(r_scause()==13||r_scause()==15)
  {
    uint64 va =r_stval();
      if(is_cowpage(p->pagetable,va))
    {
       if(cow_alloc(p->pagetable,va)<0)
     {
       printf("usertrap():cow_alloc failed.");
       p->killed=1;
     }
   } else {
      printf("usertrap(): unexpected scause before cowpage %p pid=%d\n", r_scause(), p->pid);
      printf("            sepc=%p stval=%p\n", r_sepc(), r_stval());
      p->killed = 1;
    }
  }
```
`r_stval()`返回异常的虚拟地址。
`r_scause()==13||r_scause()==15`意味着缺页异常
![[./img/MIT S081 Lab 6 Copy-on-Write-01.png]]

**在defs里面声明判断函数和分配函数**
分配函数请参照uvmcopy
```vm.c
int is_cowpage(pagetable_t pagetable,uint64 va)
{
  va=PGROUNDDOWN(va);
  pte_t *pte= walk(pagetable, va, 0);
  if(va >= MAXVA)
    return 0;
  if(pte == 0)
  {
    printf("1\n");
    return 0;
  }
  if((*pte & PTE_V) == 0)
  {
    printf("2\n");
    return 0;
  }
  if((*pte & PTE_U) == 0)
  {
    printf("3\n");
    return 0;  
  }
  if((*pte & PTE_COW))
    return 1;
  
  return 0;
}
  ```
判断如果无效，或者用户态无法访问，则提前返回。否则判断是否是cow情况。
```
int cow_alloc(pagetable_t pagetable,uint64 va)
{
  va=PGROUNDDOWN(va);
  pte_t *pte= walk(pagetable, va, 0);
  uint64 pa= PTE2PA(*pte);
  uint flags=PTE_FLAGS(*pte);
  char *mem;
  if((mem = kalloc()) == 0)
{    printf("cow_alloc kalloc failed");
     return -1;
}
  memmove(mem,(char*)pa,PGSIZE);  //分配一页新内存，并复制原本的物理地址处的内存。
  uvmunmap(pagetable,va,1,1); //解除映射
  
  flags &= ~(PTE_COW);  //解除原本页的cow属性。
  flags |= PTE_W;     //并加上写的权限
  if(mappages(pagetable,va, PGSIZE, (uint64)mem, flags) < 0)
    {
      kfree(mem);
      printf("cow_alloc unmap failed");
      return -1;
    }
    return 0;
}
```
注意此处的问题：在cow_alloc里面，一定要把flags提前，否则uvmunmap解除映射时会改变pte的标志位，导致原本的调用无效。
此处调用了kfree，具体释放逻辑将在kfree函数中修改。
- _memmove函数用于页面复制`void* memmove(void *vdst, const void *vsrc, int n)`从src复制n大小到dst之中_

### 3、添加引用计数
~~**kalloc中修改kinit，参照freerange制作一个page_cnt，计数有多少页面。**~~
_其实只需要用最大物理地址除以PGSIZE就能得出_    `#define PAGECNT PHYSTOP/PGSIZE`

**设置一个index数组，设置increase和decrease函数。**
```kalloc.c
struct {
  struct spinlock lock;
  struct run *freelist;
  int page_idx[PAGECNT];
} kmem;
```
由于需要加锁，所以在kmem这个已经锁好的结构中更方便
```
int page_index(uint64 pa)
{
  pa=PGROUNDDOWN(pa);
  int index=(pa-(uint64)end)/PGSIZE;
  if(index<0||index>PAGECNT)
  {
    panic("pageindex failed\n");
  }
  return index;
}
void incr(void *pa)
{
  int index=page_index((uint64)pa);
  acquire(&kmem.lock);
  kmem.page_idx[index]++;
  release(&kmem.lock);
}
void decr(void *pa)
{
  int index=page_index((uint64)pa);
  acquire(&kmem.lock);
  kmem.page_idx[index]--;
  release(&kmem.lock);
}
```
用`page_index`作为辅助函数，定义`incr`和`decr`两个函数，上述三个函数需要在defs.h中定义。

**在kalloc设置为1，在uvmcopy的时候调用incr，在kfree的时候判断index大于1则decr，只有等于1的时候释放，释放的时候归零。**
全局数组会初始化为0，此处alloc的时候赋值为1即可。
```kalloc.c
void *
kalloc(void)
{
  struct run *r;
  
  acquire(&kmem.lock);
  r = kmem.freelist;
  if(r)
    kmem.freelist = r->next;
  release(&kmem.lock);
  if(r)
    {
      memset((char*)r, 5, PGSIZE); // fill with junk
      incr(r);
    }
  return (void*)r;
}
```
此处注意，incr仅在r不为0时调用。
### 4、修改copyout
_在写的时候修改_
 修改`copyout()`在遇到COW页面时使用与缺页异常相同的方案。
```vm.c
int
copyout(pagetable_t pagetable, uint64 dstva, char *src, uint64 len)
{
  uint64 n, va0, pa0;
  
  while(len > 0){
    va0 = PGROUNDDOWN(dstva);
    if(is_cowpage(pagetable,va0))
    {
      if(cow_alloc(pagetable,va0)<0)
      {
      printf("copyout():cow_alloc failed.");
      return -1;
      }
    }
    pa0 = walkaddr(pagetable, va0);
    if(pa0 == 0)
      return -1;
    n = PGSIZE - (dstva - va0);
    if(n > len)
      n = len;
    memmove((void *)(pa0 + (dstva - va0)), src, n);
  
    len -= n;
    src += n;
    dstva = va0 + PGSIZE;
  }
  return 0;
}
```
___
