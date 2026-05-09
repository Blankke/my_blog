---
title: Graph
cover: false
categories:
  - 第一题 matmul fusion
---


## symbolic vs imperative
符号式的是整个都一起写好框架，然后再运行，所以数据是后注入的
命令式的和python一样，是直接运行的，写一行执行一行
## Control flow
控制流转为数据流，在Symbolic里面通过boolean控制数据是否为空，在结构上两边同时存在     
switch根据bool的值选择值输出。
merge操作从两边不为dead的中合并
![[Pasted image 20260424103603.png]]
