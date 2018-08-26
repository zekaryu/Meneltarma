---
layout: post
title:  "netty 源码解读三 内存分配相关（1）- jemalloc 内存分配算法"
date:   2018-08-26 14:56:17 +0800
categories: [netty]
---

>jemalloc是netty中ByteBuf分配缓存策略的主要思想，本文主要介绍算法

## 前言
PooledByteBufAllocator 实现相当复杂，其中涉及许多复杂的数据结构类：

1）PoolArena

2）PoolChunk

3）PoolSubpage

5）PoolThreadCache

还有其他相关辅助类包括 PoolChunkList

其核心思想是利用了为 FreeBSD 设计的 jemalloc 内存分配算法和 buddy  分配算法。本节首先着重介绍 jemalloc  分配算法。

## 作者简介：

jemalloc 作者 Jason Evans 系统软件工程师，在美国爱达荷大学获得计算机科学理学学士和生物信息学博士，分别在期间激发了他对操作系统和编程语言的兴趣。2005年他在研究生学习期间开发了一款实验性语言运行时，2006年的时候他将那套语言运行时的一部分 jemalloc（按他的原话当时开发的实验性语言已经没什么大的用处了，被人提醒他可以利用 jemalloc） 集成到了 FreeBSD 操作系统。2008年他与 Mozilla 一起着手提升 FireFox 火狐浏览器的内存使用的性能和碎片行为，尤其是在Windows 系统上，而当时其 malloc 内存分配算法相当糟糕。2009年开始之后的5年他加入 Facebook 参与 Facebook 的后端基础软件工作（主要是HHVM），不过他也花了很多时间在 jemalloc 上，主要提升了为大型系统服务的可伸缩性和各种内部的其他能力。

## 历史：
FreeBSD 之前采用 Kamp 实现的 malloc(3) 算法，一般现在成为 phkmalloc，其在很长一段时间都作为最理想的算法之一，在与其他算法的比较中也很有优势。不过，在设计这个算法的当时，多核系统还不常见，而且对多线程的支持也不完美。FreeBSD之后在对 SMP （对称多处理）系统提供可扩展性方面取得很大的进步，以至于 malloc(3) 算法反倒成为某些多线程应用的性能瓶颈。

而作者开发的 jemalloc 原本是他发明的一种语言（Lyken，还远未完成）的运行时库的一部分。在一段时间之后由于作者决定使用一种 复制/压缩 垃圾收集策略，这使得 jemalloc 分配器没什么用武之地了。刚好，他一个朋友跟他提到 FreeBSD 支持可扩展 SMP 的 malloc 实现，于是他就将其集成到了 FreeBSD 的 libc 中，jemalloc 就这样从差点被废弃到被成功挽救。

## 算法相关介绍：

### 1.内存的分配尺寸
![size allocate](http://meneltarma-pictures.nos-eastchina1.126.net/netty/netty-3-jemalloc/size%20allocate.png)

总共分为 small，large，huge 三类型的尺寸。small又分为三个子类tiny，quantum-spaced，sub-page。其中quantum-spaced 相邻大小16B的等差数列，tiny和sub-page都是翻倍增长。
虚拟内存在逻辑上分成2^k（默认 4MB）大小的 chunk 块。因此，可以在常数时间内通过指针操作寻址allocator元数据中的  small/large 对象，可以在对数时间内在一个全局红黑树中查找huge对象的元数据。

### 2.术语
Arena：一个自治的独立内存分配器。不需要要任何其他任何组件的支持，完全独立可用的内存非配器。

&nbsp;&nbsp;Chunk：1024 个连续 page （4MB），按 4MB 的边界进行对齐。适用于 huge 尺寸的分配，有可能好几个 chunk 组成一个 huge 块。

&nbsp;&nbsp;&nbsp;&nbsp;Page run：某个 chunk 里面 1 个或以上的 page 组成一个 page run。

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Region：连续的多个字节，可以用来分配小于 16KB 的对象。

Unused dirty page：被应用写入数据的虚拟内存页，已经被释放，但操作系统内核仍然将其作为活跃的内存。

### 3.Arena chunks
结构图如下所示：
![arena chunk](http://meneltarma-pictures.nos-eastchina1.126.net/netty/netty-3-jemalloc/arena-chunk.png)

上图表示一个4MB的arena chunk。

第一次分配 small/large 对象的时候，arena 会以轮询的形式赋给应用线程。Arena 之间都是完全独立的。他们会维护自己的 chunk 块，arena 在分配 small/large 对象的时候会将它的 chunk 块切割为多个 page run。被释放的存储空间会被原来它所在的 arena 回收，无论是哪个线程释放的。

每个 arena chunk 包含一个 header 头元数据（主要是一个 page 位图），之后是一个或者多个 page run。small 对象会被组合到一起，每个 page run 开头也会有额外的 run header 元数据，而 large 对象是相互独立的，她们的元数据会完全驻留在他们所在的 arena chunk 的 header 中。每个 arena 会通过红黑树（每个尺寸维护一棵树）记录未满的 small 对象 page run，并且从未满的 page run 的低地址开始为特定尺寸的分配请求进行分配。每个 arena 通过两个红黑树记录 page runs 的分配信息——一个用于记录 clean/untouched page runs， 一个用于记录 dirty/touched page runs。page runs 会优先从 dirty 树进行分配，从低地址开始适配一个最佳位置。

### 4.Arena and thread cache layout
![arena layout](http://meneltarma-pictures.nos-eastchina1.126.net/netty/netty-3-jemalloc/arena%20layout.png)

每个线程为 small 对象维护一个 cache，小于限定大小（默认 32KB）的 large 对象也包括。因此，大部分分配请求会在进入某个 arena 之前先去检查是否存在一个已缓存的可用对象。通过线程 cache 进行内存分配无论什么时候都不需要担心锁的问题，而通过 arena 进行内存分配需要对一个 arena bin（每个 small 尺寸对应一个）或者/和 所在整个 arena 上锁。
 这里使用线程 cache 的主要目的是为了减少同步事件的发生。因此，实践中每种尺寸大小的缓存对象的最大数量是要根据其对同步事件的降低程度来定的。对某些应用来说越高的缓存限制会加速内存分配，但从一般情况看，这也会导致内存碎片的代价变得不可接受。为了进一步限制碎片的产生，线程 cache 会进行增量 “垃圾回收”（GC），cache 会根据分配请求测算次数。已经不使用的被用于一次或多次 GC 的缓存对象会以指数衰退的方式渐进地返回到其对应的 arena 中。

### 5. page run 队列
page 会根据第一次分配 small 内存时给的不同尺寸切割成相同大小的 region 块。由于每个 page run 管理的 region 个数是有限制的，算法规定会为每种不同 size 的类别提供多个 run。在任何时刻，每种 size 最多对应一个“当前”run。当前 run 会一直存在，直到它完全满了或者空了。考虑到如果没有滞后机制，单次分配/释放都可能会导致一个 run 的创建/销毁。为了避免出现这种情况，run 会根据其占用四分位比来分类，属于QINIT的 run  永远不会被销毁。如果一个 run 需要销毁，它必须升级到比它高一级的类别中。

按内部占用比例分类还为在所有未满的 run 中选择一个新的 run 提供了一种机制。选择的优先级如下：Q50，Q25，Q0，Q75。Q75 优先级最低，因为Q75其中的 run 基本都快被完全使用了；按常规套路选择这些 run 会导致当前 run 快速的来回切换。

![page run queue](http://meneltarma-pictures.nos-eastchina1.126.net/netty/netty-3-jemalloc/page%20run%20queue.png)

上图为各个类别和其 region 百分比对应情况：

QINIT：run 的初始状态，不会被删除

Q0：使用百分比(0,50)，当使用率达到50%时，run 移动到 Q25；当使用率减小到0时，run 被删除

Q25：使用百分比[25.75)，当使用率达到75%时，run 移动到 Q50；当使用率减小到25%以下时，run 移动到 Q0

Q50：使用百分比[50.100)，当使用率达到100%时，run 移动到 Q100；当使用率减小到50%以下时，run 移动到 Q25

Q75：使用百分比[75.100)，当使用率达到100%时，run 移动到 Q100；当使用率减小到75%以下时，run 移动到 Q50

Q75：使用率达到100%，当使用率不足100%以下时，run 移动到 Q75。

### 6. Internal/external fragmentation
![Internal/external fragmentation](http://meneltarma-pictures.nos-eastchina1.126.net/netty/netty-3-jemalloc/fragmentation.png)

page runs 主要关心外部碎片问题。假设page size =4KB，现在分配了四个16B的空间，这就导致外部碎片异常大。

而当我分配12B 的空间时，算法会自动将其标准化为最接近并且大于12的2次幂也就是16B，于是多出来的4B就成为了内存碎片。

### 7.碎片规避
1. 重用的时候优先从低地址开始扫描。就像在一个数组中，你从左向右遍历，找到第一个空间的索引。事实证明这种策略不比其他策略差，而且在实践中表现优异，phkmalloc很早就采用了这种策略。

2. 只要是排序稳定的实现，差不多都运行良好。

jemalloc 中违反以上规则的几个例外：

· 按尺寸划分 会导致违反规则1，因为有可能低地址的size 比需要分配的空间小，而jemalloc 不会在需要分配32B的空间时用两个连续的16B 的size块来分配，而是直接找去找符合32B空间的单块内存，而这个地址相比未使用的地址可能是相对的高地址。

· 独立的 arena，独立的arena导致分配的时候起始地址不同，必然存在违反规则1的情况。

· 线程本地缓存。

· 未使用的 dirty page 缓存会导致 page run 的合并延迟。

### 8.Dirty page都是翻倍增长 purging 脏页清洗
· 调用 madvise() 触发 page 的回收

· dirty page 的回收是 page run 成功合并

![fragmentation status](http://meneltarma-pictures.nos-eastchina1.126.net/netty/netty-3-jemalloc/fragmentation%20status.png)

### 8.算法步骤简要说明

因为本文主要目的让大家对jemalloc有个大概了解，以便我们更好分析 netty 中的内存分配，所以这里对其算法步骤仅作简要说明，如下。

这里一般针对多核处理器。为了降低 arena 被并发访问的概率，算法会根据处理器的单核数量分配更多的 arena 数量。

当线程第一次请求分配或者释放内存时，算法会以轮询方式获取可用 arena 并分配给请求线程。之后会将请求内存的大小于缓存能存储的最大块比较：

step1. 若请求size小于缓存最大块值，则先会从线程 cache 中查找有没有线程缓存，如果有就分配，如果没有就会从属于 arena 的chunk 中或分配一个 run（对于size 较小的）或直接取 page 的整数倍大小空间（size 较大的）进行分配。

step2. 若请求size大于缓存的最大块值，但又不大于 chunk 大小，则具体过程与 step1 类似，唯一区别是，不查询 cache 直接分配。

step3. 若请求size大于chunk大小，则直接通过mmap直接内存映射方法分配。

内存的回收过程此处暂且省略。。下一篇我们会介绍 netty 分配用到的另一个算法 buddy 伙伴分配算法。
