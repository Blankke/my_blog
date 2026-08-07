---
title: "MIT S081 Lab 4: Traps"
cover: false
categories:
  - MIT S081
---

# MIT S081 Lab 4: Traps
>gdb break怎么实现的
## 前置知识
### 寄存器
- `stvec`：陷阱处理程序的地址；RISC-V跳转到这里处理陷阱。
```riscv.h
static inline uint64
r_stvec()
{
  uint64 x;
  asm volatile("csrr %0, stvec" : "=r" (x) );
  return x;
}
```
- `sepc`：保存程序计数器`pc`（因为`pc`会被`stvec`覆盖）
- `scause`： 陷阱原因的数字。
- `sscratch`：内核在这里放置了一个值，这个值在陷阱处理程序一开始就会派上用场。

_当`uservec`启动时，所有32个寄存器都包含被中断代码所拥有的值。但是`uservec`需要能够修改一些寄存器，以便设置`satp`并生成保存寄存器的地址。RISC-V以`sscratch`寄存器的形式提供了帮助。`uservec`开始时的`csrrw`指令交换了`a0`和`sscratch`的内容。现在用户代码的`a0`被保存了；`uservec`有一个寄存器（`a0`）可以使用；`a0`包含内核以前放在`sscratch`中的值。

-  `satp` ： 指向页表地址（如内核页表或某一个进程的页表）
- `sstatus`：其中的**SIE**位控制设备中断是否启用。如果内核清空**SIE**，RISC-V将推迟设备中断，直到内核重新设置**SIE**。**SPP**位指示陷阱是来自用户模式还是管理模式，并控制`sret`返回的模式。

```

// Supervisor Status Register, sstatus
#define SSTATUS_SPP (1L << 8)  // Previous mode, 1=Supervisor, 0=User
#define SSTATUS_SPIE (1L << 5) // Supervisor Previous Interrupt Enable
#define SSTATUS_UPIE (1L << 4) // User Previous Interrupt Enable
#define SSTATUS_SIE (1L << 1)  // Supervisor Interrupt Enable
#define SSTATUS_UIE (1L << 0)  // User Interrupt Enable

static inline uint64
r_sstatus()
{
  uint64 x;
  asm volatile("csrr %0, sstatus" : "=r" (x) );
  return x;
}

static inline void
w_sstatus(uint64 x)
{
  asm volatile("csrw sstatus, %0" : : "r" (x));
}

```
请注意，CPU不会切换到内核页表，不会切换到内核栈，也不会保存除`pc`之外的任何寄存器。内核软件必须执行这些任务。CPU在陷阱期间执行尽可能少量工作的一个原因是为软件提供灵活性；例如，一些操作系统在某些情况下不需要页表切换，这可以提高性能。
### 陷阱帧
![[./img/MIT S081 Lab 4 Traps-02.png]]
### 指令
**ecall**
涉及到的寄存器有stvec、sepc、scause、sstatus

执行如下操作
1. 如果陷阱是设备中断，并且状态**SIE**位被清空，则不执行以下任何操作。
2. 清除**SIE**以禁用中断。
3. User mode -> supervisor mode
4. Let sepc = pc
5. Let pc = stvec
6. Jump to pc
7. 设置`scause`以反映产生陷阱的原因。
8. 将当前模式（用户或管理）保存在状态的**SPP**位中。

**uservec**
1. 保存现场（32个通用寄存器）
2. 把内核的page table、内核的stack、当前执行该进程的CPU号装载到寄存器里
3. 跳转到usertrap继续执行
**usertrap**
1. 分情况，执行系统调用/中断/异常的处理逻辑
2. 修改了stvec的值，还可能会修改sepc的值
**usertrapret**
1. 填入了trapframe的内容，这样下一次从用户空间转换到内核空间时可以用到这些数据。
2. 恢复stvec、sepc的值（supervisor mode register）
**userret**
1. 恢复现场
2. 把用户空间的page table、用户空间的stack装载到寄存器里
3. 执行sret指令
## BackTrace
#### 1、添加原型kernel/defs.h
#### 2、在kernel/riscv.h中添加帧指针
#### 3、在kernel/printf.c中添加函数实现

```
//获取当前帧指针
 uint64 fp=r_fp();  

//设置上下限
 uint64 top=PGROUNDUP(fp);
 uint64 botton=PGROUNDDOWN(fp);
```
注意，此时获得的fp是帧指针在栈上的地址，我们要想访问栈上的数据需要用指针进行访问。
_根据提示，栈上的存储如下图![[./img/MIT S081 Lab 4 Traps-01.png]]
`fp-8`是return address，`fp-16`是下一个fp。
```
     uint64 ret_addr=*(uint64*)(fp-8);

     uint64 next_fp=*(uint64*)(fp-16);
```


## Alarm(hard)
[MIT6.S081最详解析与归纳——lab4:Traps_6.s081实验-CSDN博客](https://blog.csdn.net/qq_45456064/article/details/140605347?ops_request_misc=%257B%2522request%255Fid%2522%253A%25227b53604a03a5d7e121c48be30888f068%2522%252C%2522scm%2522%253A%252220140713.130102334..%2522%257D&request_id=7b53604a03a5d7e121c48be30888f068&biz_id=0&utm_medium=distribute.pc_search_result.none-task-blog-2~all~sobaiduend~default-2-140605347-null-null.142^v101^pc_search_result_base5&utm_term=s081%20trap&spm=1018.2226.3001.4187)
### 步骤
#### Test0
1. Makefile 中添加alarmtest函数
2. user/user.h中声明函数
~~~ 
    int sigalarm(int ticks, void (*handler)());
    int sigreturn(void);
~~~
3. 添加 Update user/usys.pl (which generates user/usys.S), kernel/syscall.h, and kernel/syscall.c to allow alarmtest to invoke the sigalarm and sigreturn system calls.
4. 初始化，在alloc和free里面赋值为0.
5. 定义sys_sigalarm()，存入当前进程的变量值
```sysproc.c
uint64

sys_sigalarm(void)

{

  int alarmticks;

  uint64 handler;

  if(argint(0, &alarmticks) < 0 || argaddr(1, &handler) < 0)

    return -1;

  

  struct proc *p = myproc();

  p->alarmticks = alarmticks;

  p->handler = (void (*)())handler;

  p->passedticks = 0;

  

  return 0;

}
```
7. 在usertrap()中实现计时的功能：
 已知CPU每隔tick的时间都会发出一个时钟中断，那么我们便可将`passedticks++`，等到`passedticks==alarmticks`时调用handler就可以达到目标了。

处理中断时我们是处于内核态的，内核态下无法调用用户函数handler。一是handler是用户空间下的虚拟地址，处于内核态的系统没有用户页表，无法寻址。二是从pagetable实验中我们可知，为了保证安全性，用户程序的pte设有PTE_U标志位，内核访问会发生page fault。三是就算能访问，也没有PTE_W和PTE_X标志位，只可读。隔离性决定了不能从内核态直接跳入用户程序。
 ```trap.c
 
void
usertrap(void)
{
  // ...
  // timer interrupt
  if(which_dev == 2){
    if(p->alarmticks != 0 && ++p->passedticks == p->alarmticks){
      p->passedticks = 0;
      // 因为页表已经切换成内核页表了，所以无法索引到handler的物理地址
      // 只能将程序计数器切到handler，等回到用户空间后再执行
      p->trapframe->epc = (uint64)p->handler;
    }
  }
  // ...
}
```
#### Test1&2
##### 问题： test0在陷入时没有保存用户态寄存器。
即原本trapframe保存的是test的内容，在进入handler之后，会保存handler的内容从而覆盖掉test里面的东西。我们需要保存一个副本即可。
1. 在proc结构体中加入一个trapframe副本，将整个trapframe都保存下来。
```
  struct trapframe *trapframe; // data page for trampoline.S

  struct trapframe *trapframecopy;  //紧跟着储存副本
```
此处紧跟着声明副本，然后在allocproc中会将副本和原本的陷阱帧存在一起。一次声明一页的内存，这一页将包括二者。
2. 修改usertrap，让每次调用时存储副本
```
    if(which_dev == 2){

    if(p->alarmticks != 0 && ++p->passedticks == p->alarmticks){

      // 在修改寄存器前，存一下trapframe的副本

        // 移动到p->trapframe后的512个字节处，位于同一页面

        p->trapframecopy = (struct trapframe*)((char *)p->trapframe + 512);

        // 不要使用memcpy，string.h中可以看到memcpy被替换成了memmove

        // memmove可以避免内存冲突问题

        memmove(p->trapframecopy, p->trapframe, sizeof(struct trapframe));

  

        // 因为页表已经切换成内核页表了，所以无法索引到handler的物理地址

        // 只能将程序计数器切到handler，等回到用户空间后再执行

        p->trapframe->epc = (uint64)p->handler;

    }

  }

  usertrapret();

}
```
3. 在sigreturn中修改函数，恢复trapframe
- sys_sigreturn()不能直接返回0，因为返回值会存储在a0中，如果返回其它值，会覆盖test中原有的a0，所以只能返回p->trapframe->a0
##### 问题： 调用handler后没有防止执行完毕前第二次调用
可以设置一个flag，标记是否有handler正在执行，但有一个更简单的方法。
只需要将p->passedticks = 0从原本的 usertrap() 移至 sys_sigreturn() 中即可，这样旧的handler在sys_sigreturn返回前，会一直卡在if(p->alarmticks != 0 && ++p->passedticks == p->alarmticks)的条件上而无法执行新的handler，直到返回后，计时器才清零，重新计时
```
uint64
sys_sigreturn(){
  struct proc *p = myproc();
  // 恢复寄存器内容
  // 这里不能直接让p->trapframe = p->trapframecopy，会造成原p->trapframe的内存无法释放
  if(p->trapframecopy != (struct trapframe *)((char *)p->trapframe + 512)) {
    return -1;
  }
  memmove(p->trapframe, p->trapframecopy, sizeof(struct trapframe));

  // 返回前再重新开始计时，这样就不会冲突
  p->passedticks = 0;

  // 返回值会存储在a0中，如果返回其它值，会覆盖原有的a0，所以只能返回p->trapframe->a0
  return p->trapframe->a0;
}

```
___
