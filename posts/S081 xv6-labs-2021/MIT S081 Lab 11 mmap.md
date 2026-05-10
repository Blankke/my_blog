---
title: "MIT S081 Lab 11: mmap"
cover: false
categories:
  - MIT S081
---

# MIT S081 Lab 11: mmap

## 前置知识
### 什么是mmap
#### 实验描述
可以通过多种方式调用`mmap`，但本实验只需要与内存映射文件相关的功能子集。_**您可以假设`addr`始终为零**_，这意味着内核应该决定映射文件的虚拟地址。`mmap`返回该地址，如果失败则返回`0xffffffffffffffff`。`length`是要映射的字节数；它可能与文件的长度不同。`prot`指示内存是否应映射为可读、可写，以及/或者可执行的；您可以认为`prot`是`PROT_READ`或`PROT_WRITE`或两者兼有。`flags`要么是`MAP_SHARED`（映射内存的修改应写回文件），要么是`MAP_PRIVATE`（映射内存的修改不应写回文件）。您不必在`flags`中实现任何其他位。`fd`是要映射的文件的打开文件描述符。_**可以假定`offset`为零（它是要映射的文件的起点）。**_

允许进程映射同一个`MAP_SHARED`文件而不共享物理页面。

`munmap(addr, length)`应删除指定地址范围内的`mmap`映射。如果进程修改了内存并将其映射为`MAP_SHARED`，则应首先将修改写入文件。`munmap`调用可能只覆盖`mmap`区域的一部分，但您可以认为它取消映射的位置要么在区域起始位置，要么在区域结束位置，要么就是整个区域(但不会在区域中间“打洞”)。
#### 博客描述
[内存映射mmap：原理、优缺点与适用场景-CSDN博客](https://blog.csdn.net/lki_suidongdong/article/details/119920638?ops_request_misc=%257B%2522request%255Fid%2522%253A%25228549e51cb377603947e78f9e5905cb06%2522%252C%2522scm%2522%253A%252220140713.130102334..%2522%257D&request_id=8549e51cb377603947e78f9e5905cb06&biz_id=0&utm_medium=distribute.pc_search_result.none-task-blog-2~all~top_positive~default-1-119920638-null-null.142^v101^pc_search_result_base5&utm_term=mmap&spm=1018.2226.3001.4187)
#### 课程中的介绍

通过上面的系统调用，可以将文件描述符指向的文件内容，从起始位置加上offset的地方开始，映射到特定的内存地址（如果指定了的话），并且连续映射len长度。这使得你可以实现Memory Mapped File，你可以将文件的内容带到内存地址空间，进而只需要方便的通过普通的指针操作，而不用调用read/write系统调用，就可以从磁盘读写文件内容。这是一个方便的接口，可以用来操纵存储在文件中的数据结构。实际上，你们将会在下个lab实现基于文件的mmap，下个lab结合了XV6的文件系统和虚拟内存，进而实现mmap。
讲的不是很懂，可能边做实验边看才能懂这什么东西。
### VMA（虚拟内存区域）
提示三提到的内容在这里：[17.2 支持应用程序使用虚拟内存的系统调用 | MIT6.S081](https://mit-public-courses-cn-translatio.gitbook.io/mit6-s081/lec17-virtual-memory-for-applications-frans/17.2-zhi-chi-ying-yong-cheng-xu-shi-yong-xu-ni-nei-cun-de-xi-tong-tiao-yong)
## 步骤
### 1、添加系统调用接口
### 2、声明VMA结构体

```proc.h

#define NVMA 16
struct VMA
{
  int used;
  uint64 addr;        // 起始地址
  int len;            // 长度
  int prot;           // 权限
  int flags;          // 标志位
  int vfd;            // 对应的文件描述符
  struct file* vfile; // 对应文件
  int offset;         // 文件偏移，本实验中一直为0
};
//并添加到proc里面
struct proc
{
 . . .
 struct VMA vma[NVMA]
}
```

### 3、初始化VMA
在`allocproc`函数中分配空间，
```proc.c
static struct proc*
allocproc(void)
{
  . . .
  //initialize vma to 0.
  memset(&p->vma,0,sizeof(&p->vma));
  return p;
}
```
并在mmap函数中增加VMA中文件指针的引用。%% `mmap`应该增加文件的引用计数，以便在文件关闭时结构体不会消失（提示：请参阅`filedup`）。运行`mmaptest`：第一次`mmap`应该成功，但是第一次访问被`mmap`的内存将导致缺页异常并终止`mmaptest`。 %%
mmap需要正常读取参数，并根据提示判断addr、offset是否为0，判断读写权限，是否溢出等.
```sysfile.c
sys_mmap(void)
{
 uint64 addr;
  int length;
  int prot;
  int flags;
  int vfd;
  struct file* vfile;
  int offset;
  uint64 err = 0xffffffffffffffff;


  // 获取系统调用参数
  if(argaddr(0, &addr) < 0 || argint(1, &length) < 0 || argint(2, &prot) < 0 ||
    argint(3, &flags) < 0 || argfd(4, &vfd, &vfile) < 0 || argint(5, &offset) < 0)
    return err;
  
  // 实验提示中假定addr和offset为0，简化程序可能发生的情况
  if(addr != 0 || offset != 0 || length < 0)
    return err;
  // 文件不可写则不允许拥有PROT_WRITE权限时映射为MAP_SHARED
  if(vfile->writable == 0 && (prot & PROT_WRITE) != 0 && flags == MAP_SHARED)
    return err;
  struct proc* p = myproc();
  // 没有足够的虚拟地址空间
  if(p->sz + length > MAXVA)
    return err;
  
  // 遍历查找未使用的VMA结构体
  for(int i = 0; i < NVMA; ++i) {
    if(p->vma[i].used == 0) {
      p->vma[i].used = 1;
      p->vma[i].addr = p->sz;
      p->vma[i].len = length;
      p->vma[i].flags = flags;
      p->vma[i].prot = prot;
      p->vma[i].vfile = vfile;
      p->vma[i].vfd = vfd;
      p->vma[i].offset = offset;
  
      // 增加文件的引用计数
      filedup(vfile);
  
      p->sz += length;
      return p->vma[i].addr;
    }
  }

  return err;
}

```
运行`mmaptest`：第一次`mmap`应该成功，但是第一次访问被`mmap`的内存将导致缺页异常并终止`mmaptest`。
_为什么第一次成功，访问mmap的内存发生什么事了？_
**此时只完成了映射到虚拟内存的工作，第一步并没有为它分配内存，所以尝试访问内存会发生缺页异常。**
### 4、处理缺页异常，在缺页时为虚拟页面分配一页的空间。
- 提示：  添加代码以导致在`mmap`的区域中产生缺页异常，从而分配一页物理内存，将4096字节的相关文件读入该页面，并将其映射到用户地址空间。使用`readi`读取文件，它接受一个偏移量参数，在该偏移处读取文件（但必须lock/unlock传递给`readi`的索引结点）。不要忘记在页面上正确设置权限。运行`mmaptest`；它应该到达第一个`munmap`。
- 类似trap的调用，在usertrap里面添加处理page fault的情况,然后在添加处理。
```trap.c
else if(r_scause() == 13 || r_scause() == 15) {
    #ifdef LAB_MMAP
        // 读取产生缺页故障的虚拟地址，并判断是否位于有效区间
        uint64 fault_va = r_stval();
        if(PGROUNDUP(p->trapframe->sp) - 1 < fault_va && fault_va < p->sz) {
          if(mmap_handler(r_stval(), r_scause()) != 0) p->killed = 1;
        } else
          p->killed = 1;
    #endif
      } else {
    printf("usertrap(): unexpected scause %p pid=%d\n", r_scause(), p->pid);
    printf("            sepc=%p stval=%p\n", r_sepc(), r_stval());
    p->killed = 1;
  }
```
- 使用的辅助函数`mmap_handler()`来进行处理
	- 分配物理页面
	- 读取文件内容  (注意添加不同标志位)
	- 添加映射关系
```trap.c
int mmap_handler(int va, int cause) {
  int i;
  struct proc* p = myproc();
  // 根据地址查找属于哪一个VMA
  for(i = 0; i < NVMA; ++i) {
    if(p->vma[i].used && p->vma[i].addr <= va && va <= p->vma[i].addr + p->vma[i].len - 1) {
      break;
    }
  }
  if(i == NVMA)
    return -1;
  
  int pte_flags = PTE_U;
  if(p->vma[i].prot & PROT_READ) pte_flags |= PTE_R;
  if(p->vma[i].prot & PROT_WRITE) pte_flags |= PTE_W;
  if(p->vma[i].prot & PROT_EXEC) pte_flags |= PTE_X;
  
 
  struct file* vf = p->vma[i].vfile;
  // 读导致的缺页异常
  if(cause == 13 && vf->readable == 0) return -1;
  // 写导致的缺页异常
  if(cause == 15 && vf->writable == 0) return -1;

 
  void* pa = kalloc();
  if(pa == 0)
    return -1;
  memset(pa, 0, PGSIZE);
  
  // 读取文件内容
  ilock(vf->ip);
  // 计算当前页面读取文件的偏移量，实验中p->vma[i].offset总是0
  // 要按顺序读读取，例如内存页面A,B和文件块a,b
  // 则A读取a，B读取b，而不能A读取b，B读取a
  int offset = p->vma[i].offset + PGROUNDDOWN(va - p->vma[i].addr);
  int readbytes = readi(vf->ip, 0, (uint64)pa, offset, PGSIZE);
  // 什么都没有读到

  if(readbytes == 0) {
    iunlock(vf->ip);
    kfree(pa);
    return -1;
  }
  iunlock(vf->ip);
  
  // 添加页面映射
  if(mappages(p->pagetable, PGROUNDDOWN(va), PGSIZE, (uint64)pa, pte_flags) != 0) {
    kfree(pa);
    return -1;
  }
  
  return 0;
}
```
### 5、根据提示6实现`munmap`
%%找到地址范围的VMA并取消映射指定页面（提示：使用`uvmunmap`）。如果`munmap`删除了先前`mmap`的所有页面，它应该减少相应`struct file`的引用计数。如果未映射的页面已被修改，并且文件已映射到`MAP_SHARED`，请将页面写回该文件。查看`filewrite`以获得灵感。%%
提示7中说明无需查看脏位就可写回%%- 理想情况下，您的实现将只写回程序实际修改的`MAP_SHARED`页面。RISC-V PTE中的脏位（`D`）表示是否已写入页面。但是，`mmaptest`不检查非脏页是否没有回写；因此，您可以不用看`D`位就写回页面。%%
```
uint64
sys_munmap(void)
{
  uint64 addr;
  int length;
  if(argaddr(0, &addr) < 0 || argint(1, &length) < 0)
    return -1;
  
  int i;
  struct proc* p = myproc();
  for(i = 0; i < NVMA; ++i) {
    if(p->vma[i].used && p->vma[i].len >= length) {
      // 根据提示，munmap的地址范围只能是
      // 1. 起始位置
      if(p->vma[i].addr == addr) {
        p->vma[i].addr += length;
        p->vma[i].len -= length;
        break;
      }
      // 2. 结束位置
      if(addr + length == p->vma[i].addr + p->vma[i].len) {
        p->vma[i].len -= length;
        break;
      }
    }
  }
  if(i == NVMA)
    return -1;
  
  // 将MAP_SHARED页面写回文件系统
  if(p->vma[i].flags == MAP_SHARED && (p->vma[i].prot & PROT_WRITE) != 0) {
    filewrite(p->vma[i].vfile, addr, length);
  }
  
  // 判断此页面是否存在映射
  uvmunmap(p->pagetable, addr, length / PGSIZE, 1);
  
 
  // 当前VMA中全部映射都被取消
  if(p->vma[i].len == 0) {
    fileclose(p->vma[i].vfile);
    p->vma[i].used = 0;
  }
  
  return 0;
}
```

### 6、 修改`exit`将进程的已映射区域取消映射
%%就像调用了`munmap`一样。运行`mmaptest`；`mmap_test`应该通过，但可能不会通过`fork_test`%%添加下面这段代码
```proc.c
    // 将进程的已映射区域取消映射
   for(int i = 0; i < NVMA; ++i) {
     if(p->vma[i].used) {
       if(p->vma[i].flags == MAP_SHARED && (p->vma[i].prot & PROT_WRITE) != 0) {
         filewrite(p->vma[i].vfile, p->vma[i].addr, p->vma[i].len);
       }
       fileclose(p->vma[i].vfile);
       uvmunmap(p->pagetable, p->vma[i].addr, p->vma[i].len / PGSIZE, 1);
       p->vma[i].used = 0;
     }
   }
```
### 7、 修改`fork`
%%以确保子对象具有与父对象相同的映射区域。不要忘记增加VMA的`struct file`的引用计数。在子进程的页面错误处理程序中，可以分配新的物理页面，而不是与父级共享页面。后者会更酷，但需要更多的实施工作。运行`mmaptest`；它应该通过`mmap_test`和`fork_test`。%%添加下面的代码。
```
 // 复制父进程的VMA
  for(i = 0; i < NVMA; ++i) {
   if(p->vma[i].used) {
      memmove(&np->vma[i], &p->vma[i], sizeof(p->vma[i]));
      filedup(p->vma[i].vfile);
    }
  }
```



  /**
   * Page Fault
   */
  else if (r_scause() == 13 || r_scause() == 15)
  {
    /* printf("****************************page fault!****************************\n");
    printf("-------------------------before page table:\n");
    vmprint(p->pagetable, 1);
    printf("usertrap(): unexpected scause %p pid=%d\n", r_scause(), p->pid);
    printf("            sepc=%p stval=%p\n", r_sepc(), r_stval());
     */
    //char *mem;
    uint64 va;
    
    va = r_stval();
    /* printf("size alloc:%d\n", p->sz);
    printf("va:%d\n", va); */
    if(va >= p->sz)
    {

      printf("Virtual Address is greater than sbrk(n) \n");
      p->killed = 1;
    }
    else {

      uint64 va_boundry = PGROUNDDOWN(va);
      mem = kalloc();
      if(mem != 0){
        memset(mem, 0, PGSIZE);
        //printf("%p\n", (uint64)mem);
     
        if(mappages(p->pagetable, va_boundry, PGSIZE, (uint64)mem, PTE_W|PTE_X|PTE_R|PTE_U) != 0){
          printf("Cannot allocate so much memory");
          kfree(mem);
          uvmdealloc(p->pagetable, va_boundry, p->sz);
          p->killed = 1;
        }
        //printf("%p\n", (uint64)mem);
        //printf("-------------------------after page table:\n");
        //vmprint(p->pagetable, 1);
        //printf("map:%p\n", walkaddr(p->pagetable, va)); 
      }
      else{
        printf("Mem is 0 \n");
        p->killed = 1;
      } 
    }
  } else {
    printf("usertrap(): unexpected scause %p pid=%d\n", r_scause(), p->pid);
    printf("            sepc=%p stval=%p\n", r_sepc(), r_stval());
    p->killed = 1;
  }
