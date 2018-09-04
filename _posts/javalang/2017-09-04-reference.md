---
layout: post
title:  "java中的Reference类型"
date:   2017-09-04 14:56:17 +0800
categories: [javalang]
---

> 本文简要总结java中的Reference类型。

> 最近在研读jdk并发框架，其中AQS是重点，由于我打破砂锅问到底的轻微强迫症，google了AQS作者Doug Lea的论文原文[[The java.util.concurrent Synchronizer Framework](http://gee.cs.oswego.edu/dl/papers/aqs.pdf)]，有兴趣的同学可以自行下载。其中谈到设计同步框架的核心是选择一个严格意义上的FIFO队列，作为阻塞线程队列并对其进行维护。对此主要由两种选择，一个是MCS锁，另一个时CLH锁。因为CLH锁比MCS对取消和超时的处理更方便，所以AQS就选择将CLH锁作为基础对其进行改进。于是我又打算先弄懂什么是CLH锁，在网上搜索了一圈之后找到很多人对CLH锁进行了java实现，实现中用到了ThreadLocal类型，于是我发现我好像对ThreadLocal也不太熟，于是去看openjdk的源码，又发现ThreadLocal的内部类ThreadLocalMap中的Entry是继承自WeakReference，好了，既然这几个我好像都没弄得很明白过，所以我决定先了解一下Reference。

在我们平时开发过程中很少会遇到需要与各种不同类型的reference打交道的时候，所以很多时候我们在自己写的代码中很少会碰到需要使用不同的reference类型，可能很多人也会向我这样，想要深入学习一下jdk源码或者其他某些框架的源码的时候才会看到诸如WeakReference这样的类型.

# 目的

这里引出了第一个问题，那就是为什么要在Java中使用不同类型的reference？我们的应用在运行过程中会产生很多对象，这些对象驻留在内存中，它们大小不同，重要性不同，使用频率不同，生命周期不同，所以很容易想象对于不同的对象，我们希望对他们的创建销毁采取不同的策略，可是不幸的是java不像C一样可以由开发者决定对象的析构销毁，而是将管理内存的活统一交给了jvm进行gc，但jvm显然不知道这些对象的区别。于是设计者们在java 1.2加入了reference，使jvm可以对不同的reference对象采取不同的回收策略以达到提高应用性能的目的。


实际上Java中有以下几种不同的reference类型，分别是：

* StrongReference
* SoftReference
* WeakReference
* PhantomReference
* FinalReference

![reference uml](http://meneltarma-pictures.nos-eastchina1.126.net/javalang/reference/references-uml.png)
