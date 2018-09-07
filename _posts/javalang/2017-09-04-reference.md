---
layout: post
title:  "java中的Reference类型"
date:   2017-09-04 14:56:17 +0800
categories: [javalang]
---

> 本文简要总结java中的Reference类型。

> 最近在研读jdk并发框架，其中AQS是重点，由于我打破砂锅问到底的轻微强迫症，google了AQS作者Doug Lea的论文原文[[The java.util.concurrent Synchronizer Framework](http://gee.cs.oswego.edu/dl/papers/aqs.pdf)]，有兴趣的同学可以自行下载。其中谈到设计同步框架的核心是选择一个严格意义上的FIFO队列，作为阻塞线程队列并对其进行维护。对此主要由两种选择，一个是MCS锁，另一个时CLH锁。因为CLH锁比MCS对取消和超时的处理更方便，所以AQS就选择将CLH锁作为基础对其进行改进。于是我又打算先弄懂什么是CLH锁，在网上搜索了一圈之后找到很多人对CLH锁进行了java实现，实现中用到了ThreadLocal类型，于是我发现我好像对ThreadLocal也不太熟，于是去看openjdk的源码，又发现ThreadLocal的内部类ThreadLocalMap中的Entry是继承自WeakReference，好了，既然这几个我好像都没弄得很明白过，所以我决定先了解一下Reference。

在我们平时开发过程中很少会遇到需要与各种不同类型的reference打交道的时候，所以很多时候我们在自己写的代码中很少会碰到需要使用不同的reference类型，可能很多人也会向我这样，想要深入学习一下jdk源码或者其他某些框架的源码的时候才会看到诸如WeakReference这样的类型。

# 问题

假设在一个应用中，需要从一个名为test的数据库表中获取数据。但凡有点经验的开发人员都会避免应用获取相同的数据每次都去查询数据库，因为I/O操作过去频繁势必会降低应用性能。

显然，我们首先想到的就是使用缓存。应用首先查询缓存，如果需要的数据存在直接拿来用就好；如果缓存未命中，才去数据库查询，并且把查询到的数据放入缓存，以便下次应用发起相同请求时可以直接从缓存获取数据而不用再次去数据库查询。

## 使用缓存会提高性能吗？

答案是这需要根据具体情况分析，如果从test获取需要缓存的数据量较少，使用缓存会非常合适且一定会提升性能。但假若需要从test表查询放到缓存里的数据量非常大，那就会出现一个问题：由于数据量过大可能会导致内存不足，而不单单是提升性能了。假如说把表中所有数据都放入缓存，那么缓存的可能会占据大部分jvm的内存或者索性直接产生一个OOM错误。

## 解决方案

最佳的方案是如果我们可以创造一种可以按需扩展和收缩的动态缓存，当我们的数据量需要而内存充裕的时候可以适当增加，但内存不足是可以按不同方案对其进行回收。

# 目的

这里引出的一个问题，就是为什么要在Java中使用不同类型的reference？我们的应用在运行过程中会产生很多对象，这些对象驻留在内存中，它们大小不同，重要性不同，使用频率不同，生命周期不同，比如有些对象只要应用启动就一直存活直到应用停止，而有些对象生命周期与创建它的线程相同，还有些对象只作临时变量短时间就消亡，再比如某些缓存数据，内存充裕的时候可以存活，内存不足的时候可能需要被首先牺牲被回收，所以很容易想象对于不同的对象，我们希望对他们的创建销毁采取不同的策略，可是不幸的是java不像C一样可以由开发者决定对象的析构销毁，而是将管理内存的活统一交给了jvm进行gc，但jvm显然不知道这些对象的区别。于是设计者们在java 1.2加入了reference，使jvm可以对不同的reference对象采取不同的回收策略以达到提高应用性能的目的。

# java.lang.ref 包

实际上java.lang.ref包中就有以下几种不同的reference类型，分别是：

* StrongReference
* SoftReference
* WeakReference
* PhantomReference
* FinalReference

![reference uml](http://meneltarma-pictures.nos-eastchina1.126.net/javalang/reference/references-uml.png)

## StrongReference

我们发现在类图中我们并没有发现 StrongReference 类型，原因是我们平时写的代码基本上都是 StrongReference 。我们最常的创建对象方式就是 new 一个对象，然后将其赋值给一个声明为这个对象的类型及其父类的引用。如果对象有一个 StrongReference ，那么这个对象将不会被gc回收。

### 举例

```java
HelloWorld hello = new HelloWorld();
```
这里 hello 就是一个 HelloWorld 对象的 StrongReference。

## SoftReference

如果一个对象没有 StrongReference 但存在一个 SoftReference ，那么 gc 将会在虚拟机需要释放一些内存的时候回收这个对象。可以通过对对象的 SoftReference 调用 get() 方法获取该对象。如果这个对象没有被 gc 回收，则返回此对象，否则返回 null 。

## WeakReference

如果一个对象没有 StrongReference 但有存在一个 WeakReference ，那么 gc 将会在下一次运行时对其进行回收，哪怕虚拟机的内存还足够多。

## PhantomReference 与 FinalReference

如果某个对象没有以上这些类型的引用，那么它可能有一个 PhantomReference 。PhantomReference 不能用于直接访问对象。调用 get() 方法都会返回 null 。

FinalReference 与虚拟机密切相关，这里先挖个坑，下次再具体解析。

# 对象可达性判断

当前主流java虚拟机都是采用 GC Roots Tracing 算法，比如 Sun 的 Hotspot 虚拟机便是采用该算法。java虚拟机进行gc时，判断一个对象的被引用情况决定是否回收，都是从根节点引用（Root set of Reference）开始标识可达路径的。对于某个对象可能会存在其多个引用，且这多个引用的类型不同。

如下图所示：

![对象可达路径](http://meneltarma-pictures.nos-eastchina1.126.net/javalang/reference/different-reference-path.png)

Root Tracing 算法根据以下两个原则标记对象的可达性：

* 单一路径中，以最弱的引用为准
* 多路径中，以最强的引用为准

如上图所示，对对象4存在3条引用路径：(1)(6),(2)(5),(3)(4)。那么从根对象到对象4的最强引用时(2)(5)，因为(2)和(5)都是强引用。如果对象4仅存在一条(1)(6)引用，那么对它的引用就是最弱的引用为准，也就是 SoftReference ，对象4就是 softly-reachable 对象。

# 不同类型 reference java 代码举例

```java
package com.example.reference;
import java.lang.ref.PhantomReference;
import java.lang.ref.ReferenceQueue;
import java.lang.ref.SoftReference;
import java.lang.ref.WeakReference;
public class ReferenceExample {
       private String status ="Hi I am active";
       public String getStatus() {
              return status;
       }
       public void setStatus(String status) {
              this.status = status;
       }
       @Override
       public String toString() {
              return "ReferenceExample [status=" + status + "]";
       }
       public void strongReference()
       {
              ReferenceExample ex = new ReferenceExample();
              System.out.println(ex);
       }
       public void softReference()
       {
              SoftReference<ReferenceExample> ex = new SoftReference<ReferenceExample>(getRefrence());
              System.out.println("Soft refrence :: " + ex.get());
       }
       public void weakReference()
       {
              int counter=0;
              WeakReference<ReferenceExample> ex = new WeakReference<ReferenceExample>(getRefrence());
              while(ex.get()!=null)
              {
                     counter++;
                     System.gc();
                     System.out.println("Weak reference deleted  after:: " + counter + ex.get());
              }
       }
       public void phantomReference() throws InterruptedException
       {
              final ReferenceQueue queue = new ReferenceQueue();
              PhantomReference<ReferenceExample> ex = new PhantomReference<ReferenceExample>(getRefrence(),queue);
              System.gc();
              queue.remove();
              System.out.println("Phantom reference deleted  after");
       }
       private ReferenceExample getRefrence()
       {
              return new ReferenceExample();
       }
       public static void main(String[] args) {
              ReferenceExample ex = new ReferenceExample();
              ex.strongReference();
              ex.softReference();
              ex.weakReference();
              try {
                     ex.phantomReference();
              } catch (InterruptedException e) {
                     // TODO Auto-generated catch block
                     e.printStackTrace();
              }
       }
}
Output :
ReferenceExample [status=Hi I am active]
Soft refrence :: ReferenceExample [status=Hi I am active]
Weak reference deleted  after:: 1null
Phantom reference deleted  after
```


# 总结

通过对以上各类型的 reference 介绍可以发现其实 reference 主要是用来与虚拟机 gc 进行交互，使得虚拟机根据对象的不同引用类型，对其采用不同的内存回收策略。strong 引用的对象正常情况下不会被回收，soft 引用的对象会在出现 OOM 错误之前被回收，而 weak 引用的对象在下一次 gc 的时候就会被回收，对 reference 的基本理解就差不多了。至于 PhantomReference 与 FinalReference 下次再讲。


## 参考文献

* [java学习教程之Reference详解](http://www.androidstar.cn/java%E5%AD%A6%E4%B9%A0%E6%95%99%E7%A8%8B%E4%B9%8Breference%E8%AF%A6%E8%A7%A3/)
* [Different Types of References in Java](https://dzone.com/articles/java-different-types-of-references)
