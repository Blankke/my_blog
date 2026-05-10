---
title: "MIT S081 补充: Findx 与 Buddy"
cover: false
categories:
  - MIT S081
---

# MIT S081 补充: Findx 与 Buddy

## Findx
本步骤为xv6-riscv系统增加带首/尾星号通配符的find命令：findx，找到给定目录的文件名部分符合参数要求的所有文件。

注意事项：
1. 命令的源代码位于xv6-riscv/user/目录，文件名为findx.c，最终的可执行命令为findx
2. 如果命令行参数首字母为星号，例如：`*example`，则匹配给定目录及以下所有名称以example结束的文件
3. 如果命令行参数尾字母为星号，例如：`example*`，则匹配给定目录及以下所有名称以example开始的文件
4. 如果命令行参数首尾都为星号，例如：`*example*`，则匹配名称中带有example字符串的文件  
5. 参考前面步骤的user/find.c的实现
6. 使用递归来查询子目录
7. 不要对"."和".."目录进行递归
8. 用户对文件系统的改变在不同qemu环境运行之间是保持的，可通过make clean，make qemu重新来过
9. 通过修改Makefile的UPROGS变量添加命令

```c
#include "kernel/types.h"
#include "kernel/stat.h"
#include "user/user.h"
#include "kernel/fs.h"

char* fmtname(char *path)
{
    static char buf[DIRSIZ+1];
    char *p;

    // 提取最后一个斜杠后的文件名
    for(p = path + strlen(path); p >= path && *p != '/'; p--)
        ;
    p++;

    // 返回填充空白后的名称
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
int match(char* path,char* target)
{
    int len = strlen(target);
    // 如果命令行参数不包含星号，则直接匹配名称
    if(strcmp(fmtname(path), target) == 0) {
        return 1;
    }
    // 如果命令行参数首尾都为星号，例如：*example*，则匹配名称中带有example字符串的文件
    if(target[0] == '*' && target[len - 1] == '*') {
        char *substr = fmtname(path);
        int i, j;
        for(i = 0; substr[i] != '\0'; i++) {
            for(j = 1; j < len - 1 && substr[i + j - 1] == target[j]; j++)
            ;
            if(j == len - 1) {
            return 1;
            }
        }
    }
    // 如果命令行参数首字母为星号，例如：*example，则匹配给定目录及以下所有名称以example结束的文件
    if(target[0] == '*') {
        char *substr = fmtname(path);
        int substr_len = strlen(substr);
        int match = 1;
        for(int i = 0; i < len - 1; i++) {
            if(substr[substr_len - (len - 1) + i] != target[i + 1]) {
                match = 0;
                break;
            }
        }
        if(match) {
            return 1;
        }
    }
    // 如果命令行参数尾字母为星号，例如：example*，则匹配给定目录及以下所有名称以example开始的文件
    if(target[len - 1] == '*') {
        char *substr = fmtname(path);
        int match = 1;
        for(int i = 0; i < len - 1; i++) {
            if(substr[i] != target[i]) {
                match = 0;
                break;
            }
        }
        if(match) {
            return 1;
        }
    }
    return 0;

}
void find(char *path, char* target)
{
    char buf[512], *p;
    int fd;
    struct dirent de;
    struct stat st;

    if((fd = open(path, 0)) < 0) {
        fprintf(2, "findx: cannot open %s\n", path);
        return;
    }

    if(fstat(fd, &st) < 0) {
        fprintf(2, "findx: cannot stat %s\n", path);
        close(fd);
        return;
    }

    if(match(fmtname(path), target) == 1) {
        printf("%s\n", path);
    }

    switch(st.type) {
        case T_FILE:
            break;

        case T_DIR:
            if(strlen(path) + 1 + DIRSIZ + 1 > sizeof buf) {
                printf("ls: path too long\n");
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

## Buddy
- 注释掉file.c中第十九行
- 原本的file_alloc由NFILE限制，我们希望使用buddy算法，buddy.c中的bd_alloc进行分配，从而使文件的限制由内存直接限制而不是NFILE
- 第一步修改file_alloc
```c
struct file*
filealloc(void)
{
  struct file *f;

  acquire(&ftable.lock);

  f=bd_malloc(sizeof(*f));  //this place use buddy allocation
  if(f == 0){
    release(&ftable.lock);
    return 0;
  }
  f->ref = 1;
  release(&ftable.lock);
  return f;
}

```
- 第二步修改fileclose.在 `fileclose` 中，您将释放分配的内存。请注意，您可以简化 `fileclose`，因为不再需要 `ff`。
```c

```


[MIT6.S081-Lab7 Lab Networking [2021Fall] - duile - 博客园](https://www.cnblogs.com/duile/p/16277647.html)
