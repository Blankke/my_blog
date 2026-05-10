---
title: 驱虫日志：修复posix_spawnp related execve bad address bug
cover: false
categories:
    - 驱虫日志
tags:
    - starryos
---

# 驱虫日志：修复posix_spawnp related execve bad address bug

- 修复[posix_spawnp related execve bad address bug](https://github.com/Starry-OS/StarryOS/issues/17)

配置过程按照issue原文进行配置，test只保留spawn
首先我找到了 StarryOS 中 execve系统调用的实现位置：execve.rs
```c
TEST(posix_spawnp(&pid, "echo", &fa, 0, (char *[]){"echo","hello",0}, 0), 0);
```
上面是libctest的代码，其中对于spawn（底层调用为execve）的参数的环境变量为0.

根据 POSIX 标准，execve允许 envp为 NULL（表示使用空环境变量）。但 StarryOS 的实现没有处理这种情况，直接对 NULL 指针调用 vm_load_until_nul，导致返回 `EFAULT` (BadAddress) 错误。

我查看了 QEMU 中 Linux 的 execve 实现，发现它在处理 envp 之前会检查指针是否为 NULL.

我在arg和env前面添加了检查：
```rust
    // Handle NULL argv (treat as empty array)
    let args = if argv.is_null() {
        Vec::new()
    } else {
        vm_load_until_nul(argv)?
            .into_iter()
            .map(vm_load_string)
            .collect::<Result<Vec<_>, _>>()?
    };

    // Handle NULL envp (treat as empty array)
    let envs = if envp.is_null() {
        Vec::new()v
    } else {
        vm_load_until_nul(envp)?
            .into_iter()
            .map(vm_load_string)
            .collect::<Result<Vec<_>, _>>()?
    };

```
