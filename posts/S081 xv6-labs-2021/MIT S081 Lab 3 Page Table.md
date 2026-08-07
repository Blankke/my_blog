---
title: "MIT S081 Lab 3: Page Table"
cover: false
categories:
  - MIT S081
---

# MIT S081 Lab 3: Page Table
## 相关知识

### xv6内存
XV6基于Sv39 RISC-V运行，这意味着它只使用64位虚拟地址的低39位；而高25位不使用。在这种Sv39配置中，RISC-V页表在逻辑上是一个由 $2^{27}$ 个页表条目（Page Table Entries/PTE）组成的数组，每个PTE包含一个44位的物理页码（Physical Page Number/PPN）和一些标志。分页硬件通过使用虚拟地址39位中的前27位索引页表，以找到该虚拟地址对应的一个PTE，然后生成一个56位的物理地址，其前44位来自PTE中的PPN，其后12位来自原始虚拟地址。图3.1显示了这个过程，页表的逻辑视图是一个简单的PTE数组（参见图3.2进行更详细的了解）。页表使操作系统能够以 4096 ( $2^{12}$ ) 字节的对齐块的粒度控制虚拟地址到物理地址的转换，这样的块称为页（page）。![[./img/MIT S081 Lab 3 Page Table-01.png]]
如图3.2所示，实际的转换分三个步骤进行。页表以三级的树型结构存储在物理内存中。该树的根是一个4096字节的页表页，其中包含512个PTE，每个PTE中包含该树下一级页表页的物理地址。这些页中的每一个PTE都包含该树最后一级的512个PTE（也就是说每个PTE占8个字节，正如图3.2最下面所描绘的）。分页硬件使用27位中的前9位在根页表页面中选择PTE，中间9位在树的下一级页表页面中选择PTE，最后9位选择最终的PTE。==多级页表==
![[./img/MIT S081 Lab 3 Page Table-02.png]]
xv6的内存映射如下
[3.2 内核地址空间 · 6.S081 All-In-One](http://xv6.dgs.zone/tranlate_books/book-riscv-rev1/c3/s2.html)
### 函数
```vm.c
pte_t * walk(pagetable_t pagetable, uint64 va, int alloc)
```
访问页表中va（虚拟地址）位置的pte
```vm.c
uint64 walkaddr(pagetable_t pagetable, uint64 va)
```
地址转换va到pa
```vm.c
int mappages(pagetable_t pagetable, uint64 va, uint64 size, uint64 pa, int perm)
```
为从va开始的虚拟地址创建PTE，这些地址引用以pa.va开头的物理地址和大小可能不是按页对齐。成功返回0，walk不能分配合适页面则返回-1
## Speed up system calls ([easy](https://pdos.csail.mit.edu/6.S081/2021/labs/guidance.html))
优化函数：

```user/ulib.c
int
ugetpid(void)
{
  struct usyscall *u = (struct usyscall *)USYSCALL;
  return u->pid;
}
```
相关的定义如下，蹦床页和trapframe,另一个是我们需要完善的系统调用页。
```memlayout.h

#define TRAMPOLINE (MAXVA - PGSIZE)
...
#define TRAPFRAME (TRAMPOLINE - PGSIZE)
#define USYSCALL (TRAPFRAME - PGSIZE)
```
### 1、map usyscall below trapframe
使用下述函数，为va开始的存储单元在pa的位置创建PTE，（perm为权限设置）
```vm.c
mappages(pagetable_t pagetable, uint64 va, uint64 size, uint64 pa, int perm)
```
添加内存关系的映射，仿照proc_pagetable()中的做法。并且需要为proc结构体添加一个usys成员
```kernel/proc.h
struct proc{
...
...
  struct trapframe *trapframe; 
  
  struct usyscall  *usyscall;  // here 
}
```
此时再在proc函数中仿照映射
```kernel/proc.c
// map the trapframe just below TRAMPOLINE, for trampoline.S.
  if(mappages(pagetable, TRAPFRAME, PGSIZE,
              (uint64)(p->trapframe), PTE_R | PTE_W) < 0){
    uvmunmap(pagetable, TRAMPOLINE, 1, 0);
    uvmfree(pagetable, 0);
    return 0;
  }   
//模仿上述函数
//  map usyscall

    if(mappages(pagetable, USYSCALL, PGSIZE,
              (uint64)(p->usyscall), PTE_R | PTE_U) < 0){
    uvmunmap(pagetable,USYSCALL,1,0);
    //此处比上面多一行unmap。
    uvmunmap(pagetable, TRAMPOLINE, 1, 0);
    uvmfree(pagetable, 0);
    return 0;
  }
```
### 2、设置用户单元为只读
权限设置在mappage函数中
```vm.c
mappages(pagetable_t pagetable, uint64 va, uint64 size, uint64 pa, int perm)
```
`PTE_V`指示PTE是否存在：如果它没有被设置，对页面的引用会导致异常（即不允许）。`PTE_R`控制是否允许指令读取到页面。`PTE_W`控制是否允许指令写入到页面。`PTE_X`控制CPU是否可以将页面内容解释为指令并执行它们。`PTE_U`控制用户模式下的指令是否被允许访问页面；如果没有设置`PTE_U`，PTE只能在管理模式下使用。
在1中的mappage函数中我们设置为PTE_R | PTE_U。
### 3、分配一个usyscall并初始化页面
进入函数allocproc()，仿照上述分配函数分配并初始化。
```proc.c
static struct proc* allocproc(void)
{
...
...
 // Allocate a trapframe page.
  if((p->trapframe = (struct trapframe *)kalloc()) == 0){
    freeproc(p);
    release(&p->lock);
    return 0;
  }
 //模仿上述函数，分配一个usyscall的页面
   //allocate a usyscall page

  if((p->usyscall = (struct usyscall *)kalloc()) == 0){
    freeproc(p);
    release(&p->lock);
    return 0;
  }
  //initialize
  p->usyscall->pid=p->pid;
}
```
### 4、free the page
释放进程有两个函数
```proc.c
static void  freeproc(struct proc *p)
{
 if(p->trapframe)
    kfree((void*)p->trapframe);//注意kfree函数，物理释放内存。
  p->trapframe = 0;
 if(p->pagetable)
    proc_freepagetable(p->pagetable, p->sz);//free_pagetable处也要释放

//此处模仿上述函数，在内存和页表中分别释放。
}
```
观察函数kfree()
```kalloc.c
// Free the page of physical memory pointed at by v,
// which normally should have been returned by a
// call to kalloc().  (The exception is when
// initializing the allocator; see kinit above.)
void kfree(void *pa);
```
释放一个指向物理内存页面的指针，使这段内存可以被重新分配使用。
```proc.c
static void  freeproc(struct proc *p)
{
...
...
  if(p->usyscall)
    kfree((void*)p->usyscall);
  p->usyscall=0;
}

void
proc_freepagetable(pagetable_t pagetable, uint64 sz)
{
  uvmunmap(pagetable, TRAMPOLINE, 1, 0);
  uvmunmap(pagetable, TRAPFRAME, 1, 0);
  uvmfree(pagetable, sz);
  
 // unmap usyscall page
  uvmunmap(pagetable, USYSCALL, 1, 0);

}
```
## Print a page table ([easy](https://pdos.csail.mit.edu/6.S081/2021/labs/guidance.html))
### 观察HINTs
#### 1、 put vmprint() in kernel/vm.c.

#### 2、Use the macros at the end of the file kernel/riscv.h.
```kernel/riscv.h
#define PGSIZE 4096 // bytes per page
#define PGSHIFT 12  // bits of offset within a page

//向上向下对齐
#define PGROUNDUP(sz)  (((sz)+PGSIZE-1) & ~(PGSIZE-1))
#define PGROUNDDOWN(a) (((a)) & ~(PGSIZE-1))

#define PTE_V (1L << 0) // valid
#define PTE_R (1L << 1)
#define PTE_W (1L << 2)
#define PTE_X (1L << 3)
#define PTE_U (1L << 4) // 1 -> user can access

// shift a physical address to the right place for a PTE.
#define PA2PTE(pa) ((((uint64)pa) >> 12) << 10)//将物理地址 `pa` 转换为页表项的格式
#define PTE2PA(pte) (((pte) >> 10) << 12)  //从页表项中提取物理地址
#define PTE_FLAGS(pte) ((pte) & 0x3FF)   //提取页表项的标志位（低 10 位），用于检查或修改页面属性。

// extract the three 9-bit page table indices from a virtual address.
#define PXMASK          0x1FF // 用于提取 9 位索引值（页表的每一层索引占 9 位）
#define PXSHIFT(level)  (PGSHIFT+(9*(level)))
//计算页表层级的偏移量：
//`level=0`：偏移为 12位（页内偏移后）。
//`level=1`：偏移为 12+9=21位。
//`level=2`：偏移为 12+18=30位

//从虚拟地址 `va` 中提取指定层级的索引：
//右移到对应层级的起始位，取低 9 位作为索引
#define PX(level, va) ((((uint64) (va)) >> PXSHIFT(level)) & PXMASK)

// one beyond the highest possible virtual address.
// MAXVA is actually one bit less than the max allowed by
// Sv39, to avoid having to sign-extend virtual addresses
// that have the high bit set.
#define MAXVA (1L << (9 + 9 + 9 + 12 - 1))
typedef uint64 pte_t;
typedef uint64 *pagetable_t; // 512 PTEs
```
#### 3、 The function freewalk may be inspirational.
```vm.c
// Recursively free page-table pages.
// All leaf mappings must already have been removed.
void
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
    } else if(pte & PTE_V){
      panic("freewalk: leaf");
    }
  }
  kfree((void*)pagetable);
}
```
这是一个递归释放页表中的页的函数，逻辑是访问多级页表，可以参考这个函数访问并打印PTE。
#### 4、Define the prototype for vmprint in kernel/defs.h so that you can call it from exec.c.
Insert`if(p->pid==1) vmprint(p->pagetable)`in exec.c just before the return argc, to print the first process's page table.
```defs.h
int             vmprint(pagetable_t);
```

#### 5、 Use %p in your printf calls to print out full 64-bit hex PTEs and addresses as shown in the example.

### 步骤
#### 1、书写vmprint

## Detecting which pages have been accessed ([hard](https://pdos.csail.mit.edu/6.S081/2021/labs/guidance.html))
### Hints
- Start by implementing sys_pgaccess() in kernel/sysproc.c.==起始位置==

- You'll need to parse arguments using argaddr() and argint().==这两个函数位于syscall.c中。将会被用到==
`argaddr(int n, int* ip)`将第n个参数复制到ip
`argint(int n,uint64* ip)`将第n个参数的地址复制到ip

- For the output bitmask, it's easier to store a temporary buffer in the kernel and copy it to the user (via copyout()) after filling it with the right bits.

`int copyout(pagetable_t pagetable, uint64 dstva, char *src, uint64 len)`Copy len bytes from src to virtual address dstva in a given page table.==copyout位于vm.c==

- It's okay to set an upper limit on the number of pages that can be scanned.

- walk() in kernel/vm.c is very useful for finding the right PTEs.
`pte_t *walk(pagetable_t pagetable, uint64 va, int alloc)`==将va处的pte返回==

- You'll need to define PTE_A, the access bit, in kernel/riscv.h. Consult the RISC-V manual to determine its value.![[./img/MIT S081 Lab 3 Page Table-03.png]]
PTE-A是第六位，也就是说`#define PTE_A (1L << 6)`

- Be sure to clear PTE_A after checking if it is set. Otherwise, it won't be possible to determine if the page was accessed since the last time pgaccess() was called (i.e., the bit will be set forever).
- vmprint() may come in handy to debug page tables.
### 步骤
#### 1、定义PTE-A
```riscv.h
#define PTE_V (1L << 0) 
#define PTE_R (1L << 1)
#define PTE_W (1L << 2)
#define PTE_X (1L << 3)
#define PTE_U (1L << 4) 

#define PTE_A (1L << 6) //here
```
#### 2、将walk加入defs.h
walk本来是vm所用的局部函数，在其他文件中无法使用。
#### 3、写代码
```sysproc.c

int
sys_pgaccess(void)
{
  uint64 start_va;
  int num_pages;
  uint64 bit_mask; //用户态地址
  if(argaddr(0,&start_va)<0)
    return -1;
  if(argint(1,&num_pages)<0)
    return -1;
  if(argaddr(2,&bit_mask))
    return -1;
  if(num_pages<0||num_pages>32)
    return -1;
  //初始化值
  uint64 mask=0;     //没有页表被访问过
  struct proc* p=myproc();
  pagetable_t pagetable=p->pagetable; //页表设置为当前进程
  pte_t *pte;
  //对一定数量内的页进行访问
  for(int i=0;i<num_pages;i++)
  {
    pte=walk(pagetable,start_va+i*PGSIZE,1);
    if(*pte&PTE_A)
    {
      mask |= 1<<i;     //将第i位的掩码置1
      *pte &= ~PTE_A;   //访问过的置0
    }
  }
  copyout(pagetable,bit_mask,(char*)&mask,sizeof(mask));
  return 0;
}
```

## 遗留问题
### 1、用户态和内核态的储存到底在哪？怎么算是不用切换到内核态，怎么算是在内核中放一个缓冲？
### 2、蹦床页和trapframe到底用来干什么，存储的结构是什么样的
___
