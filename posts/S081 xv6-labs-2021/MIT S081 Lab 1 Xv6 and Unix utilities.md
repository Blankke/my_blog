---
title: "MIT S081 Lab 1: Xv6 and Unix utilities"
cover: false
categories:
  - MIT S081
  - S081 xv6-labs-2021
---

# MIT S081 Lab 1: Xv6 and Unix utilities
##  sleep ([easy](https://pdos.csail.mit.edu/6.S081/2021/labs/guidance.html))

代码：
```c
#include "kernel/types.h"
#include "user/user.h"
int main(int argc, char *argv[])
{
    if(argc !=2)
    {
        fprintf(2,"use of sleep invalid argument!\n");
        exit(1);
    }
    int ticks =atoi(argv[1]);
    if(ticks<=0)
    {
        fprintf(2,"sleep:invalid number of ticks:%s\n",argv[1]);
        exit(1);
    }
    sleep(ticks);
    exit(0);
}
```
### 解释
  argc和argv参数在用命令行编译程序时有用。main( int argc, char* argv[], char **env ) 中   
        第一个参数，int型的argc，为整型，用来统计程序运行时发送给main函数的命令行参数的个数，在VS中默认值为1。   
        第二个参数，char*型的argv[]，为字符串数组，用来存放指向的字符串参数的指针数组，每一个元素指向一个参数。各成员含义如下：   
        argv[0]指向程序运行的全路径名   
        argv[1]指向在DOS命令行中执行程序名后的第一个字符串   
        argv[2]指向执行程序名后的第二个字符串   
        argv[3]指向执行程序名后的第三个字符串   
        argv[argc]为NULL



## Ping-pong 

### 帖子
[理解pid_t与fork()函数-CSDN博客](https://blog.csdn.net/zwtxy1231010/article/details/84951126?ops_request_misc=%257B%2522request%255Fid%2522%253A%25223866dc57a370c3ef9b2d69bbd1723b9d%2522%252C%2522scm%2522%253A%252220140713.130102334..%2522%257D&request_id=3866dc57a370c3ef9b2d69bbd1723b9d&biz_id=0&utm_medium=distribute.pc_search_result.none-task-blog-2~all~top_positive~default-1-84951126-null-null.142^v101^pc_search_result_base5&utm_term=pid_t&spm=1018.2226.3001.4187)
## prime [hard]

标准答案：```
```c
#include "kernel/types.h"
#include "kernel/stat.h"
#include "user/user.h"
#define MSGSIZE 35
#define ZERO '0'
#define ONE '1'
void prime(int receive_pipe, int send_pipe);
int main(int argc, char *argv[]) {
    int fd[2];
    pipe(fd);
    char nums[MSGSIZE];
    nums[0] = ZERO;
    for (int i = 1; i < MSGSIZE; ++i) {
        nums[i] = ONE;
    }
    int pid = fork();
    if (pid > 0) {
        nums[1] = 0;
        write(fd[1], nums, MSGSIZE);
        wait(0);
    }
    if (pid == 0) {
        prime(fd[0], fd[1]);
    }
    wait(0);
  
    exit(0);
}

void prime(int receive_pipe, int send_pipe) {
    char nums[MSGSIZE];
    read(receive_pipe, nums, MSGSIZE);
    int val = 0;
    for (int i = 0; i < MSGSIZE; ++i) {
        if (nums[i] == ONE) {
            val = i;
            break;
        }
    }
    if (val == 0) {
        return;
    }
    printf("prime: %d\n", val);
    nums[val] = ZERO;
    for (int i = 0; i < MSGSIZE; ++i) {
        if (i % val == 0) {
            nums[i] = ZERO;
        }
    }
    int pid = fork();
    if (pid > 0) {
        write(send_pipe, nums, MSGSIZE);
    } else {
        prime(receive_pipe, send_pipe);
    }
}
```


## Find
需要一些目录相关的函数，用于打开和遍历目录。
[理解Linux系统调用：stat、fstat与struct stat详解-CSDN博客](https://blog.csdn.net/weixin_37926485/article/details/122804385?ops_request_misc=%257B%2522request%255Fid%2522%253A%25227e6abb4bcdfb43c71003a724a4df4c2e%2522%252C%2522scm%2522%253A%252220140713.130102334..%2522%257D&request_id=7e6abb4bcdfb43c71003a724a4df4c2e&biz_id=0&utm_medium=distribute.pc_search_result.none-task-blog-2~all~top_positive~default-1-122804385-null-null.142^v101^pc_search_result_base5&utm_term=fstat&spm=1018.2226.3001.4187)
```
int fd; 
fd = open ("/etc/passwd", O_RDONLY);
```
pipe也是一种文件描述符
其余类似递归调用。
```c
#include "kernel/types.h"
#include "kernel/stat.h"
#include "user/user.h"
#include "kernel/fs.h"

char* fmtname(char *path)
{
    static char buf[DIRSIZ+1];
    char *p;

    // 
    for(p = path + strlen(path); p >= path && *p != '/'; p--)
        ;
    p++;

    // 
    if(strlen(p) >= DIRSIZ)
        return p;
    memmove(buf, p, strlen(p));
    memset(buf + strlen(p), 0, DIRSIZ - strlen(p));
    return buf;
}

int if_ok(char* path)
{
    char* buf = fmtname(path);
    if(buf[0] == '.' && buf[1] == 0) {        // .
        return 0;
    }
    if(buf[0] == '.' && buf[1] == '.' && buf[2] == 0) {  // 
        return 0;
    }
    return 1;
}

void find(char *path, char* target)
{
    char buf[512], *p;
    int fd;
    struct dirent de;
    struct stat st;

    if((fd = open(path, 0)) < 0) {
        fprintf(2, "find: cannot open %s\n", path);
        return;
    }

    if(fstat(fd, &st) < 0) {
        fprintf(2, "find: cannot stat %s\n", path);
        close(fd);
        return;
    }

    if(strcmp(fmtname(path), target) == 0) {
        printf("%s\n", path);
    }

    switch(st.type) {
        case T_FILE:
            break;

        case T_DIR:
            if(strlen(path) + 1 + DIRSIZ + 1 > sizeof buf) {
                printf("find: path too long\n");
                break;
            }
            strcpy(buf, path);
            p = buf + strlen(buf);
            *p++ = '/';
            
            while(read(fd, &de, sizeof(de)) == sizeof(de)) {
                if(de.inum == 0)
                    continue;
                memmove(p, de.name, DIRSIZ);
                p[DIRSIZ] = 0;
                
                if(stat(buf, &st) < 0) {
                    printf("ls: cannot stat %s\n", buf);
                    continue;
                }
                if(if_ok(buf)) {
                    find(buf, target);
                }
            }
            break;
    }
    close(fd);
}

int main(int argc, char *argv[])
{
    if(argc == 2) {
        find(".", argv[1]);
    }
    if(argc == 3) {
        find(argv[1], argv[2]);
    }
    exit(0);
}
```
记得fmtname填充改成用0填充而不是空格。
## xargs
### 命令行参数

以`mkdir a b c`为例，`a b c`就是`mkdir`接收的命令行参数

### 标准化输入

以`grep a`为例，当在shell里按下回车后，程序所等待的就是一个标准化输入。

### 标准化输出

命令的返回结果就是一个标准化输出。
### 管道符
```
cmdA | cmdB
```
管道符|的作用是，cmdA的标准输出会作为cmbB的标准输入。
### _**xargs**_
(short for "eXtended ARGuments")
```
cmdA | xargs cmdB
```
将xargs搭配管道符使用，cmdA的输出会作为cmdB的命令行参数。
此时cmdA命令会先执行，我们书写的函数仅为xargs一个命令，cmdA的输出为这个命令的标准化输入，而cmdB为这个命令的参数。

### 1、获取标准化输入
程序从文件描述符0中获取标准化输入，标准化输出在文件描述符1，错误信息发送到文件描述符2.
```
read(0,buf,MSGSIZE);
```
### 2、命令行参数
```
argv[argc]
```
### 3、使用exec
```
 exec(xargv[0],xargv );
```

### 问题
##### 为什么mkdir返回不了
```
$ mkdir a
mkdir: a failed to create
```
可能是创过一次了，删掉再跑测试指令。
```
rm -r a
mkdir a
```

为什么单独运行两个指令结果对了，用xargs还是不对。可能是用于参数的指令更慢（？）在程序开头加入一个sleep。

```c
#include "kernel/types.h"
#include "kernel/stat.h"
#include "user/user.h"
#include "kernel/fs.h"
#include "kernel/param.h"

#define MSGSIZE 16

int main(int argc, char* argv[]) {
    sleep(10);

    char buf[MSGSIZE];
    read(0, buf, MSGSIZE);

    char* xargv[MAXARG];
    int xargc = 0;
    for (int i = 1; i < argc; ++i) {
        xargv[xargc] = argv[i];
        xargc++;
    }

    char* p = buf;
    for (int i = 1; i < MSGSIZE; ++i) {
        if (buf[i] == '\n') {
            int pid = fork();
            if (pid > 0) {
                p = &buf[i + 1];
                wait();
            } else {
                buf[i] = 0;
                xargv[xargc] = p;
                xargc++;
                xargv[xargc] = 0;
                xargc++;
                exec(xargv[0], xargv);
                exit();
            }
        }
    }
    wait();
    exit();
}
```
## 遗留问题
buf到底是一个什么概念？父子进程联系在哪？

fork()到底怎么用，没太明白其中的用法。
___
