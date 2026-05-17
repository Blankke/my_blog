---
title: II.CUDA & GPU 基础
cover: false
categories:
  - Matmul Fusion
tags:
  - CSE234
---
>[!quote] GPU的基本属性。
>做问题一的时候总觉得少点什么，原来是缺了这一节课没有听，所以grid啥的知识点不明白。

![[Pasted image 20260510200059.png|800]]
- SM/SMP（Streaming Multi-processor）

![[Pasted image 20260510200217.png|800]]
- 线程(thread)就是最小的工作单元，对应一个cuda/tensor core。core就是alu嵌入到gpu中
- 块（block）就是共享内存的线程块，每一个前文提到的SM就对应一个Block，然后会包含很多的线程，都并行工作
- 网（grid）就是一堆block的集合，然后对应的就是GPU
- Kernel就是GPU代码，我们不叫他们program，是一个fancy的名字

>[!note] GPU是为了SIMD（simple instruction multiple processing）
>
>More power GPU generally means:
>- More SMs 
>- More core per SM 
>- More powerful cores

## CUDA
CUDA是c-like的，为开发者准备在GPU编程的，CUDA的设计完全贴合grid/block/thread 概念。

```c
//all are CPU codes
const int Nx = 12;  const int Ny = 6; //矩阵的形状
dim3 threadsPerBlock(4，3，1);
dim3 numBlocks(Nx/threadsPerBlock.x，
            Ny/threadsPerBlock.y，1);
// assume A,B，C are allocated Nx x Ny float arrays
//this call will trigger execution of 72 CUDA threads:
// 6 thread blocks of12 threads each
matrixAdd<<<numBlocks, threadsPerBlock>>>(A，B，C);    //the only GPU code

```
上面的代码就是在启动一个kernel之前定义的metadata。基本上说，就是这个kernel会在多少个Block以及每个Block多少个thread上跑。这是静态定义的.

这里我们说一个GPU就只有一个grid，基本概念为：
- GridDim: The dimensions of the grid 
- blockIdx: The block index within the grid
- blockDim: The dimensions of a block 
- threadIdx: The thread index within a block
所以这里没有GridId或threadDim。有的话也都为1

### CUDA program
除了上面说的CPU代码，还需要kernel的具体实现。
```c
__device__ float doubleValue(float x)
{
    return 2 * x;
}

// kernel definition
__global__ void matrixAddDoubleB(
    float A[Ny][Nx],
    float B[Ny][Nx],
    float C[Ny][Nx]
)
{
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    int j = blockIdx.y * blockDim.y + threadIdx.y;

    C[j][i] = A[j][i] + doubleValue(B[j][i]);
}
```
这段kernel实现的是`C = A + 2B`这一个算子。
- `__global__`标记代表这是一个cuda kernel
- 每一个thread只做总工作的一部分
- 所以这里的`i`,`j`其实就相当于去计算了这个thread在排布中的位置
- 注意避免写入冲突，线程不能重复写入同一个区域。
这里可以把前文有一张描述blockIdx等概念的图记在脑子里
![[Pasted image 20260510204216.png|500]]
计算出的`(i,k)`就是图中这个坐标。原来这个数据就是`12*6`的然后我们block是`3*2`,thread是`4*3`，这个thread的分布也是`12*6`的，所以能够对上，每一个线程只算一个数据。

我们把CPU code与GPU code严格分开，一个是串行，一个是SIMD并行，我们叫他们Host code和Device code。
cpu代码的作用就是定义kernel的元数据，其中的这个调用
```c
matrixAdd<<<numBlocks, threadsPerBlock>>>(A，B，C);    //the only GPU code
```
值的返回会阻塞，并等待所有线程返回。但是cpu其实不会阻塞执行，如果下面还有代码会继续执行。所以下面的cpu执行和gpu是并行执行的
我们的解决方法是cuda synchronize这个函数
>[!explain] 同步原语
>`__syncthreads()`: wait for all threads in a block to arrive at this point
>`cudasycnhronize()`: sync between host and device
### CUDA Control flow
gpu每个线程本来是做相同的事情，以相同的速度，但是如果有越界，或者其他条件判断的问题，控制流这个问题就会扰乱这个速度。
CUDA是static的，意思是他们不能在同一时间做不同的事情。
![[Pasted image 20260510210145.png|800]]
类似图中这种情况，T和F的线程不能同时做不同的事情，所以只能等待，每一个branch做不同的事情。非常低效，如果有更多的branch会更加低效。画叉的区域也称为bubble，这也是控制冒险，类似cpu的控制冒险产生bubble
- **masking**
CUDA的解决方法是masking，意思是说在每个branch上都要执行所有的线程，但是对于不满足条件的线程来说，他们的结果会被mask掉，不会被写入内存中。但是masking非常慢，所以我们要尽量避免branching，或者说让branching的条件尽量相似，这样就不会有太多的masking了。
### 内存
- 我们以后将会用
    - DRAM表示CPU mem
    - HBM表示GPU mem。比cpu的更高速。
- 内存管理是
    - CPU是页式分布
    - GPU是直接写成内存池
    - 二者无法互相直接访问
cuda也有相应的内存malloc代码
```c
float* A = new float[N];

// populate host address space pointer A
for (int i = 0; i < N; i++)
    A[i] = (float)i;

int bytes = sizeof(float) * N;

float* deviceA;                 // allocate buffer in
cudaMalloc(&deviceA, bytes);   // device address space

// populate deviceA
cudaMemcpy(deviceA, A, bytes, cudaMemcpyHostToDevice);

// note: deviceA[i] is an invalid operation here (cannot
// manipulate contents of deviceA directly from host.
// Only from device code.)
```
>[!note]  更多概念：Pinned Memory（页锁定内存）
>- 属于主机（CPU）内存的一部分
>- 针对 CPU 与 GPU 之间的数据传输做了优化
>- 不会被操作系统分页（不可换页），也叫“锁页内存”  
>- 某些 CUDA API 只能用于 Pinned Memory

### CUDA调度
因为不同的GPU有不同的SMP，但是用户写的kernel是静态的，可能数量更大，我们GPU无法分配
需要一个`scheduler`来满足不同的需求
- 核心假设：不同的thread可以乱序执行。（因为理想化都是并行的，所以乱序没关系）
比如：
#### 深入理解 CUDA 调度（CUDA Scheduling）
- 在 `1024 × 1024` 数据上执行 Conv1d
- 每个线程块（thread block）包含 128 个 CUDA 线程
- 总共有 1024 个线程块
- 每个线程块需要申请 `130 × 4 = 520` 字节共享内存（shared memory）
- 已知：GPU 有 2 个 SM（流式多处理器），规格如下
- CUDA 的线程调度会是什么样子？

![[Pasted image 20260510213016.png|800]]
动态调度算法会按序在不同的SM的共享内存允许的情况下，把不同的块map在几个SM上，直到内存满了（over-subscription）
就会把剩下的block放进队列中，等待当前的结束。
>[!note] Warp Scheduler（线程束调度器）
>[9. Warp Scheduler - 知乎](https://zhuanlan.zhihu.com/p/658688561)
>考虑 NVIDIA GTX 980 (2014) 的下列配置：
>-  96KB of shared memory 
>- 16 SMs 
>- 2048 threads/SM 
>- 128 CUDA cores/SM
>这里thread数目远大于core数目，为什么？
>这里用到的32 个线程 = 1 warp
>在上面我们提到的SM 调度的是 warp，而warp内部本身负责
>- 上下文切换
>- 调度优先级
>- 资源管理
>- 分支处理