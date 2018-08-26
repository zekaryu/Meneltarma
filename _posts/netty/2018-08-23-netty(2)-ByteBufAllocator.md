---
layout: post
title:  "netty 源码解读二 ByteBufAllocator 接口"
date:   2018-08-23 14:56:17 +0800
categories: [netty]
---
>在上一篇 [netty 源码解读之一](https://www.numenor.cn/netty/2018/08/18/netty(1)-ByteBuf-interface.html) ByteBuf 接口 中我们解读了一遍 ByteBuf 源码
，应该对这个 netty 中最核心的缓存数据结构有所了解了。但我们在前文发现 ByteBuf 中没有用于创建 ByteBuf 本身的方法，今天我们就来解读一下 netty 中用于创建 ByteBuf 的辅助接口 ByteBufAllocator 及其体系结构。

## 首先看一下 ByteBufAllocator 家族体系：
![ByteBufAllocator 家族体系](http://meneltarma-pictures.nos-eastchina1.126.net/netty/netty-source-2/ByteBufAllocator%20hierarchy.png)

其中 ByteBufAllocator 是顶层接口，AbstractByteBufAllocator 是其骨架抽象实现。两个实现类分别为池化分配和非池化分配。

## 注释概要：

```
/**
 * Implementations are responsible to allocate buffers. Implementations of this interface are expected to be
 * thread-safe.
 */
 ```
 其实现类负责具体的 buffer 分配创建工作。实现类是线程安全的。

## 下面我们看一下 ByteBufAllocator 接口方法：
 ![ByteBufAllocator 接口方法](http://meneltarma-pictures.nos-eastchina1.126.net/netty/netty-source-2/ByteBufAllocator%20interface.png)

 查看源码发现，接口方法的声明非常清晰，规律，其方法按方法声明前缀，大致可以封为四类：

>
>1. buffer*前缀为分配普通 buffer；
>2. ioBuffer*前缀为分配适用于 I/O 操作的 buffer；
>3. directBuffer*前缀为分配直接内存 buffer；
>4. composite*前缀为分配合成 buffer；

## 接下来看一下 AbstractByteBufAllocator ：
分析其源码，我看可以看到：
```java
@Override
public CompositeByteBuf compositeBuffer() {
    if (directByDefault) {
        return compositeDirectBuffer();
    }
    return compositeHeapBuffer();
}

@Override
public CompositeByteBuf compositeBuffer(int maxNumComponents) {
    if (directByDefault) {
        return compositeDirectBuffer(maxNumComponents);
    }
    return compositeHeapBuffer(maxNumComponents);
}

@Override
public CompositeByteBuf compositeHeapBuffer() {
    return compositeHeapBuffer(DEFAULT_MAX_COMPONENTS);
}

@Override
public CompositeByteBuf compositeHeapBuffer(int maxNumComponents) {
    return new CompositeByteBuf(this, false, maxNumComponents);
}

@Override
public CompositeByteBuf compositeDirectBuffer() {
    return compositeDirectBuffer(DEFAULT_MAX_COMPONENTS);
}

@Override
public CompositeByteBuf compositeDirectBuffer(int maxNumComponents) {
    return new CompositeByteBuf(this, true, maxNumComponents);
}
```
在创建 CompositeByteBuf 时直接用 new  关键字调用了 CompositeByteBuf 构造方法新建 buffer 。

```java
/**
 * Create a heap {@link ByteBuf} with the given initialCapacity and maxCapacity.
 */
protected abstract ByteBuf newHeapBuffer(int initialCapacity, int maxCapacity);

/**
 * Create a direct {@link ByteBuf} with the given initialCapacity and maxCapacity.
 */
protected abstract ByteBuf newDirectBuffer(int initialCapacity, int maxCapacity);
```
在创建其他 buffer 时它采用了设计模式中的模板模式，均调用了其两个抽象方法 newHeapBuffer() 和 newDirectBuffer()。

## 最后我们看一下 UnpooledByteBufAllocator ：
```java
@Override
protected ByteBuf newHeapBuffer(int initialCapacity, int maxCapacity) {
    return new UnpooledHeapByteBuf(this, initialCapacity, maxCapacity);
}

@Override
protected ByteBuf newDirectBuffer(int initialCapacity, int maxCapacity) {
    ByteBuf buf;
    if (PlatformDependent.hasUnsafe()) {
        buf = new UnpooledUnsafeDirectByteBuf(this, initialCapacity, maxCapacity);
    } else {
        buf = new UnpooledDirectByteBuf(this, initialCapacity, maxCapacity);
    }

    return toLeakAwareBuffer(buf);
}
```
UnpooledByteBufAllocator 中，newHeapBuffer() 直接调用 UnpooledHeapByteBuf 类的构造方法创建 buffer，newD irectBuffer() 则根据系统是否支持 Unsafe 直接调用 UnpooledUnsafeDirectByteBuf 类构造方法或者  UnpooledDirectByteBuf 类构造方法来创建 buffer。

由于池化的 PooledByteBufAllocator 创建 buffer 原理比较复杂，所以在之后单独分析。
