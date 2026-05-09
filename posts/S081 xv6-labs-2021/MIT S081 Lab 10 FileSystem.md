---
title: "MIT S081 Lab 10: FileSystem"
cover: false
categories:
  - MIT S081
  - S081 xv6-labs-2021
---

# MIT S081 Lab 10: FileSystem
##### 还有关于fs crash的问题没有了解过，可以进入s081的课程中去听一下什么是file system crash。
>[Lec15 Crash recovery (Frans) | MIT6.S081](https://mit-public-courses-cn-translatio.gitbook.io/mit6-s081/lec15-crash-recovery-frans)
## 前置知识
![[Pasted image 20250215093712.png]]
### **FAT**
文件以链表方式存储。，固定大小连续存储。文件信息分别存放在链表和目录项中。
 
### **UNIX**
`// Disk layout:
`// [ boot block | super block | log | inode blocks | free bit map | data blocks]
- superblock: metadata(fs.h)
- log
- inode结构体保存了文件的信息：大小属性……
- 
## Large files(moderate)
### 相关知识
##### 数据结构
`dinode`定义如下
```fs.h
#define NDIRECT 12
#define NINDIRECT (BSIZE / sizeof(uint))
#define MAXFILE (NDIRECT + NINDIRECT)
struct dinode {
  short type;           // File type
  short major;          // Major device number (T_DEVICE only)
  short minor;          // Minor device number (T_DEVICE only)
  short nlink;          // Number of links to inode in file system
  uint size;            // Size of file (bytes)
  uint addrs[NDIRECT+1];   // Data block addresses
};
```
`NINDIRECT`为块大小除以uint
![[Pasted image 20250216154746.png]]
原本的文件系统如下，12个直接索引，1个间接索引（通过索引，一个块可存储256个地址）。
_我们需要将address12修改为二级间接，指向256个一级间接（indirect）_
##### 映射关系
找到bmap函数（fs.c）。明白函数的作用:
1. 对于前N个直接指向的块（NDIRECT），函数直接从`ip->addrs[bn]`中获取地址。如果地址为空，则分配一个新的块，并存储到数组中，返回该地址。
2. 当块号超过直接引用范围后，减去N个直接块，进入间接块处理。间接块的数量为NINDIRECT。读取间接索引的内容，再从内存中读取对应编号的内容。
### 步骤
#### 1、修改数据结构
添加二级索引数量。
- 改fs.h中dinode，以及修改file.h中inode
#### 2、添加二级映射关系
- 别忘了把你`bread()`的每一个块都`brelse()`。
```fs.c
static uint
bmap(struct inode *ip, uint bn)

{
   ...
   ...
  //二级
  bn -= NINDIRECT;
  struct buf *bp2;
  if(bn<NDINDIRECT){
    int NUM= bn / NINDIRECT;  //在二级间接块中位置
    bn = bn % NINDIRECT;      //在一级间接块中位置
    if((addr = ip->addrs[NDIRECT+1])==0) //读取二级间接块
      ip->addrs[NDIRECT+1]=addr=balloc(ip->dev);
    bp=bread(ip->dev,addr);
    a = (uint*)bp->data;
    if((addr = a[NUM]) == 0){
      a[bn] = addr = balloc(ip->dev);
      log_write(bp);
    }
    bp2=bread(ip->dev,addr);
    a = (uint*)bp2->data;
    if((addr = a[bn]) == 0){
      a[bn] = addr = balloc(ip->dev);
      log_write(bp2);
    }
    brelse(bp);
    brelse(bp2);
    return addr;
  }
...
...
}
```
#### 3、 确保`itrunc`释放文件的所有块，包括二级间接块。
```fs.c
void
itrunc(struct inode *ip)
{
  . . .
  . . .
  //二级
  struct buf* bp2;
  if(ip->addrs[NDIRECT+1])
  {
    bp = bread(ip->dev, ip->addrs[NDIRECT+1]);
    a = (uint*)bp->data;
    for ( i = 0; i < NINDIRECT; i++)
      if(a[i])
      {
        bp2 = bread(ip->dev, a[i]);
        b = (uint*)bp2->data;
        for(j = 0; j < NINDIRECT; j++){
          if(b[j])
            bfree(ip->dev, b[j]);
        }
        brelse(bp2);
        bfree(ip->dev, a[i]);
        a[i] = 0;
      }
    brelse(bp);
    bfree(ip->dev,ip->addrs[NDIRECT+1]);
    ip->addrs[NDIRECT+1]=0;
  }
  ip->size = 0;
  iupdate(ip);
}
```
### 遗留问题
#### inode和dinode的关系是什么
## Symbolic links(moderate)
### 相关知识
主要还是多看看其他文件系统函数是如何实现的（sys_open 函数帮助很大，还有 namei, readi, writei 等跟 inode 有关的函数）。
#### 事务（日志）
[8.6 代码：日志 · 6.S081 All-In-One](https://xv6.dgs.zone/tranlate_books/book-riscv-rev1/c8/s6.html)学习一下怎么使用日志

#### 硬链接
`Sys_link`为现有inode创建一个新名称。函数`create`（**_kernel/sysfile.c_**:242）为新inode创建一个新名称。它是三个文件创建系统调用的泛化：带有`O_CREATE`标志的`open`生成一个新的普通文件，`mkdir`生成一个新目录，`mkdev`生成一个新的设备文件。与`sys_link`一样，`create`从调用`nameiparent`开始，以获取父目录的inode。然后调用`dirlookup`检查名称是否已经存在（**_kernel/sysfile.c_**:252）。如果名称确实存在，`create`的行为取决于它用于哪个系统调用：`open`的语义与`mkdir`和`mkdev`不同。如果`create`是代表`open`（`type == T_FILE`）使用的，并且存在的名称本身是一个常规文件，那么`open`会将其视为成功，`create`也会这样做（**_kernel/sysfile.c_**:256）。否则，这是一个错误（**_kernel/sysfile.c_**:257-258）。如果名称不存在，`create`现在将使用`ialloc`（**_kernel/sysfile.c_**:261）分配一个新的inode。如果新inode是目录，`create`将使用`.`和`..`条目对它进行初始化。最后，既然数据已正确初始化，`create`可以将其链接到父目录（**_kernel/sysfile.c_**:274）。`Create`与`sys_link`一样，同时持有两个inode锁：`ip`和`dp`。不存在死锁的可能性，因为索引结点`ip`是新分配的：系统中没有其他进程会持有`ip`的锁，然后尝试锁定`dp`。

使用`create`，很容易实现`sys_open`、`sys_mkdir`和`sys_mknod`。`Sys_open`（**_kernel/sysfile.c_**:287）是最复杂的，因为创建一个新文件只是它能做的一小部分。如果`open`被传递了`O_CREATE`标志，它将调用`create`（**_kernel/sysfile.c_**:301）。否则，它将调用`namei`（**_kernel/sysfile.c_**:307）。`Create`返回一个锁定的inode，但`namei`不锁定，因此`sys_open`必须锁定inode本身。这提供了一个方便的地方来检查目录是否仅为读取打开，而不是写入。假设inode是以某种方式获得的，`sys_open`分配一个文件和一个文件描述符（**_kernel/sysfile.c_**:325），然后填充该文件（**_kernel/sysfile.c_**:337-342）。请注意，没有其他进程可以访问部分初始化的文件，因为它仅位于当前进程的表中。
#### 软链接
首先不懂什么叫软链接。
软链接也是文件，但是**文件内容指向另一个文件的 inode**。打开这个文件时，会自动打开它指向的文件，类似于 windows 系统的快捷方式。

#### 文件
学习一下写入inode的方法
```fs.c
// Write data to inode.
// Caller must hold ip->lock.
// If user_src==1, then src is a user virtual address;
// otherwise, src is a kernel address.
// Returns the number of bytes successfully written.
// If the return value is less than the requested n,
// there was an error of some kind.
int
writei(struct inode *ip, int user_src, uint64 src, uint off, uint n);
```
和创建
```sys_file.c
static struct inode*
create(char *path, short type, short major, short minor);
```

![[Pasted image 20250216171446.png]]
### 步骤
#### 1、添加接口
跟着提示走
#### 2、实现symlink
需要做两件事。
1. 用path创建一个inode
2. 将target链接在inode上
#### 3、修改open函数，处理符号链接
- 如果文件不存在，则打开必须失败。当进程向`open`传递`O_NOFOLLOW`标志时，`open`应打开符号链接（而不是跟随符号链接）。_即O_NOFOLLOW标志位为0时处理链接_
- 如果链接文件也是符号链接，则必须递归地跟随它，直到到达非链接文件为止。如果链接形成循环，则必须返回错误代码。你可以通过以下方式估算存在循环：通过在链接深度达到某个阈值（例如10）时返回错误代码。
### 遗留问题
#### inode的锁是怎么回事？
`iunlockput`和`ilock`，什么时候该调用，什么时候不该。
___
