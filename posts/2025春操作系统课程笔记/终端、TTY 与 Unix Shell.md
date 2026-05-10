---
title: 终端、TTY 与 Unix Shell
cover: false
categories:
  - 2025春操作系统课程笔记
---

# 终端、TTY 与 Unix Shell

## 终端
- 打字机
	- 为降低打字速度而设计“qwerty”键盘，防止卡键。
	- Shift是使字锤向上移动一段距离，切换字符集（*机械结构，上下两个打印头*）
	- `\r\n`和`\n`来源也是打字机机构
		- `\r` CR (Carriage Return): 回车，将打印头移回行首
	    - `print('Hel\rlo')`
	- `\n` LF (Line Feed): 换行，将纸张向上移动一行
	    - UNIX 的 `\n` 同时包含 CR 和 LF
	-  Tab & Backspace
		- 位置移动 (~~Backspace + 减号 = 错了划掉~~)打字机的效果
- 电传打字机
	- 用于发电报，在收发两端同时打印
	- 使用Baudot Code（5bit code）
	- Video Teletypewriter (DEC, 1978)
- **转义序列（Escape Sequence）​** 是编程中用来表示特殊字符或控制字符的一种机制。它们通常以**反斜杠（`\`）开头**，后跟特定字符或符号，用于在字符串中表达无法直接输入或显示的字符。
- ***终端***
	- *输出*：接受uart（Universal Asynchronous Receiver/Transmitter）信号并显示
	- *输入*：收到按键信号，把键盘按键的ascii码输出到uart
- 今天：***伪终端（Pseudo Terminal）***
	- 像一对管道
	- 主设备 (PTY Master): 连接到终端模拟器 直接控制的端点，获取*从设备*的输出，从键盘发送输入到*从设备*
	- 从设备 (PTY Slave): 连接到 shell 或其他程序
	    - 例如 `/dev/pts/0`
	- tty命令
	- pts就是终端设备，可以用echo往另一个终端里面发送。
		- 使用函数openpty通过ptmx申请一个新终端返回两个文件描述符(master/slave)
		- ptmx也是设备(ptmx, pts - pseudoterminal master and slave)
	- 终端的分配
		- 每一次都会分配一个新的终端的设备
- 终端模拟器
	- ttyd可以内嵌到网页端
	- 使用网页实现
	- kitty 使用转义序列
- 终端模式
	- Canonical Mode: 按行处理
	    - 回车发送数据 (终端提供行编辑功能)
	- Non-canonical Mode: 按字符处理
	    - 每个字符立即发送给程序
	    - 用于实现交互式程序: vim, ssh sshtron.zachlatta.com，两个设备同时接入一个终端可实现网络游戏。
## 终端与操作系统
- unix启动，init，创建一个终端
	- agetty
- 进程管理：终端ctrl -c 终止哪个进程
	- 终端只管传输字符
		- ctrl+D是eof
		- ctrl+C是终止
		- `stty -a`可以看到更多的功能
		```
		intr = ^C; quit = ^\; erase = ^?; kill = ^U; eof = ^D; eol = <undef>; eol2 = <undef>; swtch = <undef>; start = ^Q;
		stop = ^S; susp = ^Z; rprnt = ^R; werase = ^W; lnext = ^V; discard = ^O; min = 1; time = 0;
		```
		- ctrl+Z可以后台运行
		- 比如ctrl+\可以传输SIGQUIT
	- 操作系统收到字符后转化为信号，对当前进程发送信号
- *ctrl+C需要找到一个当前进程*
	- fork()的进程树
		- 还有托孤行为
	- [ ] tty是什么指令
	- [ ] stty都是啥指令
- 系统登陆的时候会创建一个会话Session。
![[Pasted image 20250326115004.png]]
- fork创建的进程会在同一个进程组中(Process Group)
	- shell创建的进程会分配一个新的进程组,最开始创建的那个进程是Leader
	- 每一个新的运行的进程(Leader)再创建都会在同一个进程组中。当前运行的是前台进程组
	- ctrl+Z放在后台的就是后台进程组
	- 每一个会话都有一个控制终端(controling terminal)，从任何地方重新启动都需要一个pts.
	- 进程会引入一个Session ID大分组，子进程会继承父进程的Session ID
		- 每一个Session关联一个控制终端
		- Leader退出时，全体进程收到HangUp信号(SIGHUP)
	- 再引入一个Process Group ID小分组
	- ctrl+C会给这个终端的前台的进程组里所有的进程发送SIGINT(遍历所有前台)
		- 所以无论有没有托孤，父进程已经退出，当INT信号发出后照样能够杀死所有一个组的进程（依靠的是PGID）
- 所有这些api都可以访问:
	- setsid/getsid
	    - setsid 会脱离 controlling terminal
	- setpgid/getpgid
	- tcsetpgrp/tcgetpgrp
	    - 迷惑 API
- ***能否重新设计pty？***
	- 理论上session和pg两个概念可以去掉一个.
	- 这是POSIX的一部分  
		- window manager只需要进程组
		- Android：每个app都是不同的用户
			- 设置里的强行终止：遍历所有进程,找到属于用户的进程并删掉
			- 相当于用户当作了session
		- snap：相当于隔离的沙箱。程序相当于在“虚拟机”运行。
			- 隔离了tmp文件夹，无法被恶意软件捕捉临时数据
			- 那么也不能make submit
- 人机交互：
	- 人类是sequential creature
	- 我们很少能清醒地认识到
	    - 我要做 X
	    - 应该分解成 Y→(Z,W)→T
	- 因此，**坐在电脑前的大部分时间都浪费了**
## Unix Shell：一门编程语言
- UNIX 的用户可都是 hackers!
- UNIX Shell: **基于文本替换的极简编程语言**
    - 只有一种类型：字符串
    - 算术运算？对不起，我们不支持 😂 (但可以 expr 1 + 2)
	    - 虽然bash可以echo $((123+456 ))
	- c里面的预编译都是文本
### 语言机制
- 预处理: `$()`, `<()`（把输出变成文件）
	- 可以把任何两个程序的输出变成文件后作为对象传给命令行处理
- 重定向: `cmd > file < file 2> /dev/null`
- 顺序结构: `cmd1; cmd2`, `cmd1 && cmd2`, `cmd1 || cmd2`
	- &&短路求值
	- ||可以作为error，前面的错误后面的才会执行。
- 管道: `cmd1 | cmd2`
    - 这些**命令**被翻译成**系统调用**序列 (open, dup, pipe, fork, execve, waitpid, ...)
- 推荐读man sh
