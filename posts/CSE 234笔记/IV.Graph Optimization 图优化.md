---
title: IV.Graph Optimization 图优化
cover: false
categories:
  - Matmul Fusion
tags:
  - CSE234
---
# IV.Graph Optimization 图优化
用到的论文: [TASO](https://dl.acm.org/doi/abs/10.1145/3341301.3359630)
推荐阅读：[TVM](https://arxiv.org/pdf/1802.04799)
## symbolic vs imperative
符号式的是整个都一起写好框架，然后再运行，所以数据是后注入的
命令式的和python一样，是直接运行的，写一行执行一行
## Control flow
控制流转为数据流，在Symbolic里面通过boolean控制数据是否为空，在结构上两边同时存在     
switch根据bool的值选择值输出。
merge操作从两边不为dead的中合并
![[./img/IV.Graph Optimization 图优化-01.png]]

## Templates
### fusion
 融合算子来优化图有他的优缺点
 ![[./img/IV.Graph Optimization 图优化-02.png|500]]
 优点是：
- 减少IO时间
- 减少kernel launch时间
缺点是：
- 有很多融合的`ops`不能复用。
- 会让codebase变得不可管理。

>[!help]- NVIDIA API
>英伟达做了一个api，如果打开，会把程序的所有kernel收集到一起launch，然后一起执行。
>这么做的目的是减少串行launch kernels的时候会出现的bubble，也就是launch的时间比gpu的计算时间更长时会出现gpu空闲的等待时间，然而放在一起的launch时间小于分别launch的和。
>https://pytorch.org/blog/accelerating-pytorch-with-cuda-graphs/
>![[./img/IV.Graph Optimization 图优化-03.png|800]]


### Constant Folding常量折叠
有点类似编译器的优化。常量可以在编译时预计算，是恒定的静态计算量。
![[./img/IV.Graph Optimization 图优化-04.png|800]]
### CommonSubexpression Elimination公共子表达式消除
也是编译器中常用的优化方式，找到等价的表达式，消除重复表达的语句
![[./img/IV.Graph Optimization 图优化-05.png]]
### DeadCodeElimination 死代码消除
永远不会执行到的代码

### “基于模板的图优化存在的问题”
1. 鲁棒性：专家设计的经验规则，不能适用于所有 DNN 模型和硬件平台。
2. 可扩展性：新的算子和图结构出现时，需要不断增加新的规则。
3. 性能：容易遗漏针对特定 DNN 模型或硬件的细微优化机会

## 自动图优化
- ***Key Idea:*** 不再依赖人工手写的图优化规则，而是自动生成并验证适用于张量代数的图替换规则。
>[!example]- [TASO](https://dl.acm.org/doi/abs/10.1145/3341301.3359630)
>TASO 的核心思想是：用自动生成和验证的图替换规则，取代人工设计的图优化规则。
>
>具体来说，用户首先给出当前程序中可能使用的一组算子，例如 `Conv2D`、`Normalization`、`Pooling`、`MatMul` 等。TASO 会基于这些算子枚举出一定规模内所有可能的计算子图，并将它们作为候选集合，即图中的 `candidate substitutions`。
>
>随后，TASO 会从候选子图集合中寻找语义等价的图结构。如果两个子图在张量代数意义上计算结果完全一致，就可以形成一个等价替换规则，表示为一个 substitution tuple，例如：
>
>`Graph A -> Graph B`
>
>在实际图优化阶段，TASO 会在原始计算图中匹配这些可替换的子图，并尝试用等价但可能更高效的子图进行替换。如果替换后的计算图能够降低执行代价，例如减少计算量、访存开销或 kernel 数量，那么该替换就会被采用。
>
>因此，TASO 的整体流程可以概括为：
>
>1. 给定一组基础算子；
>2. 枚举这些算子可能组成的小规模计算图；
>3. 验证不同计算图之间的等价性；
>4. 生成可用的图替换规则；
>5. 在优化阶段搜索并应用能够提升性能的替换。
>
>![[./img/IV.Graph Optimization 图优化-06.png]]

### Graph Substitution Generator
枚举固定长度下的所有可能的图，同时定义substitution为一对等价的图
- 做法是随机初始化一堆张量然后放进去作为这些图的输入，然后找出相同的输出来认为是substitutions
- ![[./img/IV.Graph Optimization 图优化-07.png|800]]
### 重复图剪枝
为了削减set的规模，可以通过重命名或等价子图的方法。
## partially equivalent transformations
有些图并不是完全等价，但它们的大部分计算结果是一样的，只有一小部分位置不一样。如果我们能检测出“不一样的部分”，再额外做一点修正，那么也可以把它变成可用的优化替换。这就是 partially equivalent transformations，也就是“部分等价变换”。
![[./img/IV.Graph Optimization 图优化-08.png|800]]
先从原始程序出发，生成很多“变体程序”，也就是 mutant programs。然后判断这些变体程序和原程序之间是不是完全等价，或者部分等价。如果是部分等价，就交给 mutant corrector 尝试修正。修正之后，得到 corrected mutants。最后优化器从这些候选程序里选择性能更好的程序。
### Mutant Generator
- ***step 1***
它的做法和 TASO 很像：给定硬件后端支持的一组算子，然后枚举这些算子在固定规模以内能够组成的所有可能程序。
也就是说，原始输入子图可能是一个小计算图。Mutant Generator 会基于可用算子，生成很多结构不同的新计算图。这些新图就是候选 mutant programs。
- ***step 2***
生成候选图之后，要区分两类变换
- 第一类是 fully equivalent transformations，即完全等价变换。它要求两个程序的输出结果完全一样。例如对所有输入 `I`，都有：`f(I) = g(I)`.这种变换最安全，可以直接作为图替换规则。
- 第二类是 partially equivalent transformations，即部分等价变换。它不要求两个程序的所有输出值都一样，而是要求它们的输出 shape 一样。这类变换不能直接替换，因为结果可能错。但它有潜在价值：如果只有一小部分输出位置不一样，我们可以尝试额外修正这些位置，从而得到一个正确但可能更快的程序。
### Verify
假设有两个程序`Program f` 和 `Program g`它们输入 shape 一样，输出 shape 也一样。但是输出矩阵中的某些位置可能不同。
那么要解决两个问题：
第一，哪一部分计算结果不等价？也就是找出输出中哪些位置 `p` 满足：`f(I)[p] != g(I)[p]`
第二，如何修正这些位置？如果我们能知道哪些位置错了，就可以只对这些位置补充计算，或者用原程序的结果覆盖这些错误位置。这样 `g` 虽然本来不完全等价，但经过 correction 之后就能变成正确程序。
- **方法**：枚举
    - 对输入m以及输出形状n进行检查，对于每一个可能输入 `I`，再对于输出中的每一个位置 `p`，判断 if` f(I)[p] == g(I)[p]`
    - 复杂度O(m × n)
- 如何减少n?
    - 我们能不能只检查少数几个输出位置，甚至只检查一个位置，然后推断整个计算是否正确或错误？
    - 答案是：在大约 80% 的计算中可以。
>[!explain] multi-linear
>这里的 multi-linear 可以简单理解为：
一个算子对每个输入变量分别都是线性的。
>- 加法线性：`f(..., X, ...) + f(..., Y, ...) = f(..., X + Y, ...)`
>- 数乘线性：`αf(..., X, ...) = f(..., αX, ...)`

**如何减少 n？**
- 定理 1：对于两个多线性函数 `f` 和 `g`，如果它们在某个区域内的 `O(1)` 个位置上满足 `f = g`，那么它们在该区域内的所有位置上都满足 `f = g`。
- 含义：对于每个区域，只需要检查常数个位置。
那么复杂度可以从：`O(mn)`降低到：`O(mr)`其中 `r` 是区域数量，并且 `r << n`。
**如何减少 m？**
- 定理 2：如果存在某个输入 `I` 和某个位置 `p`，使得：`f(I)[p] ≠ g(I)[p]`那么 `f` 和 `g` 在 `t` 个随机输入上都给出相同结果的概率是：$(1 / 2^{31})^t$
- 用随机输入运行 `t` 次测试。如果所有测试都通过，那么 `f` 和 `g` 实际上不等价的概率非常低。
### Correct the Mutant
如果 mutant program 只有少量位置错了，那就没有必要完全放弃它。可以保留 mutant program 的大部分计算结果，只针对错误区域额外调用一个 correction kernel 进行补算。

修正虽然会带来额外开销，但可以通过 kernel fusion 把这个开销压低。这样部分等价变换才有可能真的带来性能收益。不仅要额外计算错误区域，还要尽量把这个修正计算和其他算子融合起来，减少额外 kernel launch 和中间内存读写。
![[./img/IV.Graph Optimization 图优化-09.png|800]]