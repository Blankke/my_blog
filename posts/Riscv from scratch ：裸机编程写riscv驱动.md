---
title: Riscv from scratch ：裸机编程写riscv驱动
cover: false
tags:
  - riscv
  - bare-metal
  - driver
---

```c
        uart@10000000 {
                interrupts = <0x0a>;
                interrupt-parent = <0x02>;
                clock-frequency = <0x384000>;
                reg = <0x00 0x10000000 0x00 0x100>;
                compatible = "ns16550a";
        };
```
[RISC-V from scratch 2_编译器option push和option pop-CSDN博客](https://blog.csdn.net/df12138/article/details/120485263?spm=1001.2014.3001.5502)
[RISC-V from scratch 3: 写 UART 驱动_risc-v uart驱动-CSDN博客](https://blog.csdn.net/df12138/article/details/120485921?spm=1001.2014.3001.5502)
[RISC-V from scratch 4: 写 UART 驱动_16550a编程-CSDN博客](https://blog.csdn.net/df12138/article/details/120528750?spm=1001.2014.3001.5502)
可以参考上面的两个博客
## 实现：
```cpp
 int UART_NS16550::put_char(u8 c)
 {
//UART 中寄存器 LSR 的 bit 5 是用来指示 THR 寄存器是否为空
    while( !( readRegister( LSR ) & 0x20 ) ); // 等待发送缓冲区空
    writeRegister( THR, c ); // 发送字符
    return 0;
 }
u8 UART_NS16550::get_char()
 {
    u8 c;
    while( !( readRegister( LSR ) & 0x01 ) ); // 等待接收缓冲区非空
    c = readRegister( RHR ); // 读取接收缓冲区
    if( c == 0x0D ) // 如果是回车符
    {
        put_char( 0x0A ); // 发送换行符
    }
    return c;
 }
```

这里使用了while来循环等待缓冲区，浪费了许多cpu资源，实际上以后实现了中断之后可以进行改进。



## 裸机编程
不依赖操作系统，直接在硬件上运行。
- **C++ 程序​**​：实现业务逻辑（如通过 UART 收发数据）。
- ​**​链接脚本（.ld）​**​：定义内存布局（代码、数据、栈的地址分配）。
- ​**​启动代码（crt0.S）​**​：初始化硬件环境（设置栈指针、清零 `.bss` 段等），最后跳转到 `main` 函数。
所有的内存操作、串口通信均直接通过直接读写硬件寄存器完成。

crt0.S的代码
```c

.section .text.init
.globl _start
_start:
    la sp, _stack_top   #必须与链接脚本中的_stack_top符号一致
    call main
1:  j 1b                # 停机循环
```
这是放在init段里面的，在链接脚本处一定要处理这个段.启动程序是从virt机器是首地址开始的，所以一定需要放在起始地址`0x80000000`
crt0其实就是boot程序，启动时处于机器模式。

### 问题：打印字符串时出现这个问题：
```
/tmp/ccw0sKNs.o: in function `.L0 ':
/home/czc/uart_16550/main.cc:7:(.text+0x44): relocation truncated to fit: R_RISCV_HI20 against `.LC0'
```

写入链接脚本注意的是virt机器的基地址是    uart.init((void*)0x10000000); // QEMU RISC-V virt 机器的 UART 地址
链接脚本中，ROM 的起始地址是 `0x80000000`，而 `.text` 和 `.rodata` 被强制放置在此地址：
```
MEMORY {
    ROM (rx) : ORIGIN = 0x80000000, LENGTH = 256K  /* 高位地址 */
    RAM (rwx) : ORIGIN = 0x80040000, LENGTH = 256K
}

SECTIONS {
    . = 0x80000000;  /* 起始地址为 0x80000000 */
    .text : { ... } >ROM
    .rodata : { ... } >ROM
}
```
- 如果你未在编译命令中显式指定 `-mcmodel=medany`，编译器会默认使用 ​**​`medlow` 模型​**​。
- `medlow` 模型要求所有符号地址必须位于 ​**​32位有符号整数范围​**​ 内（即 `0x7FFFFFFF` 以下）。
- 但你的 `.rodata` 段地址是 `0x80000000`（超过 `0x7FFFFFFF`），直接违反 `medlow` 模型约束。
- 当编译器生成访问 `.LC0` 的指令时，会使用 `lui` 指令加载地址的高20位。
- 如果 `.LC0` 的地址是 `0x80000000`，其高20位为 `0x80000`（二进制 `1000 0000 0000 0000 0000`），但 `lui` 的立即数字段 ​**​只能表示有符号的20​**​（范围 `-524288` 到 `524287`）。
- `0x80000` 对应的有符号值是 `-524288`，但链接器发现无法正确截断地址，因此报错：​**​`relocation truncated to fit: R_RISCV_HI20`​**​。

### 那么为什么我一直调用put_char并不会报错，传入字符串调用put_string就会报错呢？
当你在代码中直接使用字符串字面量（例如 `uart.put_string("\nHello, World!\n")`）时：
- 编译器会将整个字符串 ​**​作为只读数据​**​ 存储在 `.rodata` 段（Read-Only Data Segment）。
- 由于你的链接脚本强制将 `.rodata` 段放在高位地址（例如 `0x80000000`），访问该字符串需要通过 `lui` 指令加载其高20位地址。
当你逐个调用 `uart.put_char('H')`、`uart.put_char('e')` 等时：
- 每个字符（如 `'H'`）会被编译器视为 ​**​立即数​**​（ASCII 码值 `0x48`），直接嵌入到指令中，无需存储到内存。

## 机器模式启动
将crt0.s直接改名为boot.s
#### mhartid 寄存器
考虑到 `QEMU` `virt` 机器可以使用多个处理器，那么我们就需要防止多个 hart 执行 `boot.s` ，在机器刚开始运行（以及我们刚开始编写代码时），一哄而上可不是什么好的选择。
```
_start:
    # read our hart identifier into t0
    # see if it is 0, if not to busy loop
    csrr t0, mhartid
    bnez t0, 4f
    ...
4:
    wfi
    j 4b

```
因此这里我们首先使用 mhartid 寄存器获取 hart 的 ID ，csrr 是一个伪指令，它读取一个 CSR 寄存器。让非 0 的 hart 全部跳转到死循环里，并将它们 stall 住，死循环中 wfi 指令在这方面是专家：
>The Wait for Interrupt instruction (WFI) provides a hint to the implementation that the current hart can be stalled until an interrupt might need servicing.

#### satp 寄存器
现在，我们就要开始设置一些寄存器了以及一些初始化任务。

我们需要取消内存分页机制，这样我们就可以完全控制 MMU (Memory Management Unit) ，只不过控制的方式就是让 virtual memory = physical memory 。参考 RISC-V 特权架构 和 RISC-V 中文手册，使用 csrw 语句，向 satp 寄存器写 0 即可。
```
    # SATP should be 0 
    # Supervisor Address Translation and Protection
    csrw satp, zero

```

#### mstatus 寄存器
刚开始执行代码一定是机器模式，但是我们总不能一直让 hart 在机器模式下运行；此外，全局中断使能位也需要我们控制。这些都可以在 mstatus 寄存器上找到，关于 mstatus 寄存器，RISC-V 特权架构 和 RISC-V 中文手册上都有详细介绍。在此就略写几句。

当进入 main 函数时，hart 最好要进入监管者模式。因为 main 函数事实上是我们操作系统内核最主要的函数之一，此外，我们也希望中断能被打开。对照 mstatus 寄存器的位图，我们可以在对应位域置 1 ，来打开中断或者记录信息等。

![位图](https://img-blog.csdnimg.cn/92f16080e0de44a2a6d865f7ab344723.png?x-oss-process=image/watermark,type_ZHJvaWRzYW5zZmFsbGJhY2s,shadow_50,text_Q1NETiBAZGYxMjEzOA==,size_20,color_FFFFFF,t_70,g_se,x_16#pic_center|300)

比如，我们想先打开机器模式的中断使能，那么我们需要：

将 mstatus.MIE 位置为 1 ，因为它代表机器模式全局下的中断使能
将 mstatus.MPIE 位置为 1 ，它代表了在中断/异常发生前，机器模式全局下的中断使能（我们肯定不想在中断/异常发生一次后，使能就失效了吧）
我们还要将 mstatus.MPP 位置为 01，它代表了中断/异常发生前，代码运行的模式。之所以置为 01（监管者模式），是为了在执行 mret 的时候进入监管者模式。结合之前所说的，写下如下代码：
```
    li   t0, (0b01 << 11) | (1 << 7) | (1 << 3)
    csrw mstatus, t0
```
#### 初始化 BSS 数据段
如果你了解了 C 语言内存分布，你就会知道全局未初始化变量都会放在 BSS 段中，即我们在链接器文件里描述的 .bss section 。这里不得不说一句，写 C/C++ 未在定义时初始化是非常危险的😅，因为这会导致不确定行为。那么，作为操作系统的开发人员，初始化 BSS 数据段的责任就担在我们身上了。

还记得我们之前定义的` __bss_start` 和 `__bss_end` 吧，它们一个在 .bss 数据段前面，一个在后面，这两个符号是为方便数据初始化而设定的，那么目前，我们先把 .bss 段全部初始化为 0 。
```
    la  a0, __bss_start
    la  a1, __bss_end
    bgeu a0, a1, 2f
l1:
    sd   zero, (a0)
    addi a0, a0, 8
    bltu a0, a1, l1

```
#### mie 寄存器
mie 寄存器包含了中断使能位，用于控制中断是否有效。其位域如下图：

![在这里插入图片描述](https://img-blog.csdnimg.cn/0bc6de4d9d32485f9c19104b1249b160.png#pic_center)
我们除了要打开机器模式下的全局中断使能，还需要打开软件、时钟、外部这三部分子中断使能，参照 mie 寄存器的位域图，我们可以写出下面的代码，打开所有机器模式下的中断使能。
```
    li   t3, (1 << 3) | (1 << 7) | (1 << 11)
    csrw mie, t3
```
#### mtvec 寄存器
mtvec 寄存器又是什么？该寄存器全名 Machine Trap-Vector Base-Address Register，它存放了 trap vector 信息，包括了基地址和模式位。换句话说，当中断/异常发生时，PC 值肯定需要跳转到中断/异常处理程序，该寄存器就保存了这些处理程序的地址。对 mtvec 寄存器的详细介绍，还是要参考 RISC-V 特权架构 和 RISC-V 中文手册 和 RISC-V privileged manual 资料。

我们先不考虑中断/异常处理程序，先定义一个符号 mtrap_vector ，把它当作处理程序的开始点，然后，把它放入到 mtvec 寄存器中。
```
la   t2, mtrap_vector
csrw mtvec, t2
```
#### 转到 main
看起来我们快要写完了。到这时候，大家可能会变得不耐烦且急躁。于是，写出了最后一句指令 mret 。

哦不，等等，mret 指令会把我们带到哪里？回顾一下 crt0.s ，在快结束的时候，我们使用指令 jal zero, main 跳转到了 main 函数里，我们的 boot.s 当然也需要跳转到 main 函数。但是，我们还可以用 jal zero, main 指令跳转吗？不行。这样跳转的话，我们仍在机器模式下。为了使 hart 跑在监管者模式下，我们必须使用 mret 。

所以，mret 指令会把我们带到哪里？参考 RISC-V 的相关资料，在处理 mret 指令时，PC 值会从 mepc 寄存器取得。因此，我们必须将 main 函数的地址存入 mepc 寄存器。
```
la   t1, main
csrw mepc, t1
...
mret

```
