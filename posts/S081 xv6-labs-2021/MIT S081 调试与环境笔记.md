---
title: MIT S081 调试与环境笔记
cover: false
categories:
  - MIT S081
---

# MIT S081 调试与环境笔记

LYBTAARI1YPPOVXSQO2G982CKUL2ZBJ3
快捷键
cd .. 返回上一级目录
ctrl A+ X退出qemu
- [x] 参考书：
[1.2 I/O和文件描述符 · 6.S081 All-In-One](http://xv6.dgs.zone/tranlate_books/book-riscv-rev1/c1/s2.html)

## 调试
- **_gdb 调试_**
在一个窗口执行`make qemu-gdb`
```
# 实验指导书上说, 调试的时候指定一个CPU运行会更好一些
make CPUS=1 qemu-gdb
```

在另一个窗口执行

```sh
gdb-multiarch kernel/kernel

# (gdb) 进入gdb后执行

set confirm off
set architecture riscv:rv64
target remote localhost:26000
set riscv use-compressed-breakpoints yes
```
- **_地址定位_**
```sh
# 可以将地址转为行数

addr2line -e kernel/kernel

<your addr>
```
[进去看34:28](https://www.bilibili.com/video/BV1LT4y1B79b/?spm_id_from=333.337.search-card.all.click)
- 输入`.o`文件可以使gdb识别更多符号
```sh
	file user/sleep.o 
```
