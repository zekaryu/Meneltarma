---
layout: post
title:  "netty 源码解读一 ByteBuf 接口"
date:   2017-08-18 14:56:17 +0800
categories: [netty]
tagline:
---

>ByteBuf 是 netty 中用于存储 I/O 数据的最核心的数据结构，本文解读其源码。

## 首先看一下 ByteBuf 的类层次：
![bytebuf 结构](http://meneltarma-pictures.nos-eastchina1.126.net/netty/hierachy-of-bytebuf.png)

我们先看一下其中主要的抽象类和具体实现类：

1. AbstractByteBuf

    本类是 ByteBuf 的骨架实现，其中实现了很多通用方法，为继承它的具体实现类完成了很多通用操作。
2. AbstractDerivedByteBuf

    本类继承 AbstractByteBuf，是包装其他 ByteBuf 的实现类的基类。
3. AbstractReferenceCountedByteBuf

    对于 ByteBuf 来说其中很重要的一点就是对其内存的管理，包括内存的分配，回收等等。此类对需要支持 buffer 内存管理的实现类提供支持，实现了许多基础功能，如对 buffer 引用计数的计算，设置，释放，维持等等。
4. CompositeByteBuf 

    此类相当于将多个 ByteBuf 合并成一个 buffer 的一个虚拟 buffer 视图。举个例子，在网络编程中，我们自己定义了一个基于 TCP/IP 的应用协议，包括固定结构的协议头，和协议体。这个时候我们采用两个独立的 ByteBuf 分别表示协议头和协议体，然后用一个 CompositeByteBuf 将它们捏合起来进行网络传输，这样协议头和协议体可以各自关心自己的业务逻辑，组合的事情交给 CompositeByteBuf 来做，大大有利于帮我们去除业务无关的干扰，提高开发效率，也使代码更可读。

5. UnpooledUnsafeDirectByteBuf

    非池化的基于Unsafe 的直接内存 buffer。
6. UnpooledDirectByteBuf

    非池化的基于 JDK NIO ByteBuffer 直接内存 buffer。
7. PooledByteBuf

    池化的 ByteBuf，其内部维护一个ByteBuf 对象池，向其请求 ByteBuf 对象时，池中的  ByteBuf 对象会重复利用。类似于线程池。
8. PooledUnsafeDirectByteBuf

    池化的基于 Unsafe 的直接内存 buffer。
9. PooledHeapByteBuf

    池化的基于 JVM 堆内存的 buffer。
10. PooledDirectByteBuf

    池化的基于直接内存的 buffer。

总结一下 netty 中的 ByteBuf 可以从两个大的角度各分为两类：
>
>    DirectByteBuf：直接内存
>
>    HeapByteBuf：堆内存

>
>    PooledByteBuf：池化的 buffer
>
>    UnpooledByteBuf：非池化的 buffer
另外系统是否支持 Unsafe 也会对 buffer 进行扩展。

直接内存与堆内存的区别在于，直接内存不属于 JVM 堆内存，其优点是由于采用直接内存省去了程序运行过程中数据反复在直接内存于堆内存之间不断复制，所以大大提高了I/O的效率，也减少了 JVM GC 的时间，但缺点是其创建和销毁过程开销会比堆内存大。

所以为了提高直接内存的效率，netty 采用了池化内存的方案，池化直接内存首先会在直接内存中申请一块内存，创建相应的 ByteBuf 时会从池中获取内存空间，用完之后将空间回收。

实际上查看源代码可以发现 UnpooledDirectByteBuf 创建调用了 NIO 的 ByteBuffer.allocateDirect(initialCapacity) 静态方法。

![UnpooledDirectByteBuf](http://meneltarma-pictures.nos-eastchina1.126.net/netty/UnpooledDirectByteBuf.png)

一步一步跟踪源代码，其返回的其实是 NIO DirectByteBuffer 实例。

![allocateDirect](http://meneltarma-pictures.nos-eastchina1.126.net/netty/allocateDirect.png)

进一步发现 DirectByteBuffer  继承自 NIO MappedByteBuffer。而 MappedByteBuffer 就是内存映射缓存。

![DirectByteBuffer](http://meneltarma-pictures.nos-eastchina1.126.net/netty/DirectByteBuffer.png)

自此，我们知道 netty 中的 DirectByteBuf 就是利用了 NIO 中的 MappedByteBuffer 并加强封装了它。

## 下面我们分析一下 netty 的缓存类最顶层的抽象 ByteBuf 接口：

### 注释概要：

```
* A random and sequential accessible sequence of zero or more bytes (octets).
* This interface provides an abstract view for one or more primitive byte
* arrays ({@code byte[]}) and {@linkplain ByteBuffer NIO buffers}.
```

一组由零个或多个字节（octets 表示 8 bit 字节，byte 这个单词由于历史原因曾经表示过不同的长度单元，所以这里用 octets  消除歧义，参见：octets 维基百科）组成的随机或者顺序可访问序列。本接口提供了一个针对一个或多个基本类型字节数组（  byte[]）和 ByteBuffer NIO buffer 的抽象视图。

### buffer 的创建：

```
* <h3>Creation of a buffer</h3>
*
* It is recommended to create a new buffer using the helper methods in
* {@link Unpooled} rather than calling an individual implementation's
* constructor.
*
```
建议使用 Unpooled 类中的辅助方法而不是调用特定实现类的构造方法来创建一个新的 buffer。

### Random Access Indexing 随机访问索引：

```
* <h3>Random Access Indexing</h3>
*
* Just like an ordinary primitive byte array, {@link ByteBuf} uses
* <a href="http://en.wikipedia.org/wiki/Zero-based_numbering">zero-based indexing</a>.
* It means the index of the first byte is always {@code 0} and the index of the last byte is
* always {@link #capacity() capacity - 1}.  For example, to iterate all bytes of a buffer, you
* can do the following, regardless of its internal implementation:
*
```
与其他普通基本类型字节数组类似，ByteBuf 也使用基于0下标的索引。也就是说 ByteBuf 索引 0 代表首字节，capacity()-1 代表末字节。例如，不考虑器内部实现，如果你要迭代一个 buffer 的所有字节，可以按以下方式：

```
* {@link ByteBuf} buffer = ...;
* for (int i = 0; i < buffer.capacity(); i ++) {
*     byte b = buffer.getByte(i);
*     System.out.println((char) b);
* }
```
### Sequential Access Indexing 顺序访问索引：

```
* {@link ByteBuf} provides two pointer variables to support sequential
* read and write operations - {@link #readerIndex() readerIndex} for a read
* operation and {@link #writerIndex() writerIndex} for a write operation
* respectively.  The following diagram shows how a buffer is segmented into
* three areas by the two pointers :
```
 ByteBuf 提供了两个指针变量来只是顺序读写操作，分别是：readerIndex 表示读操作索引，writerIndex表示写操作索引。下图表示一个 buffer 是如何被这两个指针分为三块区域的：

```
* <pre>
*      +-------------------+------------------+------------------+
*      | discardable bytes |  readable bytes  |  writable bytes  |
*      |                   |     (CONTENT)    |                  |
*      +-------------------+------------------+------------------+
*      |                   |                  |                  |
*      0      <=      readerIndex   <=   writerIndex    <=    capacity
* </pre>
```

Readable bytes（存放了 buffer 中可用的内容）可读字节：

```
* <h4>Readable bytes (the actual content)</h4>
*
* This segment is where the actual data is stored.  Any operation whose name
* starts with {@code read} or {@code skip} will get or skip the data at the
* current {@link \#readerIndex() readerIndex} and increase it by the number of
* read bytes.  If the argument of the read operation is also a
* {@link ByteBuf} and no destination index is specified, the specified
* buffer's {@link #writerIndex() writerIndex} is increased together.
* <p>
* If there's not enough content left, {@link IndexOutOfBoundsException} is
* raised.  The default value of newly allocated, wrapped or copied buffer&ampapos;
* {@link #readerIndex() readerIndex} is {@code 0}.
*
```

这部分是数据真正被存储的地方。任何以 read 或者 skip 开头的方法调用操作都会从当前的 readerIndex 读索引开始获取数据或者跳过，并且操作读了多少个字节，读索引就会相应往上增加。如果读操作的实参也是一个 ByteBuf 且目的索引未指定，则这个指定的实参 buffer 的写索引也会同时增加。

如果这个写入的 buffer 没有足够的空间，会抛出 IndexOutOfBoundsException 异常表示索引越界。新创建分配的 wrapped 或者 copied buffer （以后讲解，这里略过，只要知道是不同类型的 ByteBuf 就可以了）的读索引 readerIndex 的默认值为 0 。

我在本机上展示了上面这段话的例子：

![举例1](http://meneltarma-pictures.nos-eastchina1.126.net/netty/eg1.png)

可以看到 src 的容量为 30，dst 容量为10。若将 dst 容量修改为大于 src ，如40，则程序报 IndexOutOfBoundsException 异常：

![举例2](http://meneltarma-pictures.nos-eastchina1.126.net/netty/eg2.png)

迭代 buffer 中的可读字节：

```
* <pre>
* // Iterates the readable bytes of a buffer.
* {@link ByteBuf} buffer = ...;
* while (buffer.readable()) {
*     System.out.println(buffer.readByte());
* }
* </pre>
```

Writeable bytes 可写字节：

```
* This segment is a undefined space which needs to be filled.  Any operation
* whose name ends with {@code write} will write the data at the current
* {@link #writerIndex() writerIndex} and increase it by the number of written
* bytes.  If the argument of the write operation is also a {@link ByteBuf},
* and no source index is specified, the specified buffer's
* {@link #readerIndex() readerIndex} is increased together.
* <p>
* If there's not enough writable bytes left, {@link IndexOutOfBoundsException}
* is raised.  The default value of newly allocated buffer's
* {@link #writerIndex() writerIndex} is {@code 0}.  The default value of
* wrapped or copied buffer's {@link #writerIndex() writerIndex} is the
* {@link #capacity() capacity} of the buffer.
```

可写字节需要被填充的未定义部分。任何以 write 开头的方法调用操作都会从当前的 writerIndex 写索引开始写入数据，并且操作写了多少个字节，写索引就会相应往上增加。如果写操作的实参也是一个 ByteBuf 且源索引未指定，则这个指定的实参 buffer 的读索引也会同时增加。

如果这个写入的 buffer 没有足够的空间，会抛出 IndexOutOfBoundsException 异常表示索引越界。新创建分配的 wrapped 或者 copied buffer （以后讲解，这里略过，只要知道是不同类型的 ByteBuf 就可以了）的写索引 writerIndex 的默认值为 buffer 的 capacity()也就是其本身初始化定义的的容量 。

用随机整数填充 buffer 的 writeable bytes 可写字节：

```
* <pre>
* // Fills the writable bytes of a buffer with random integers.
* {@link ByteBuf} buffer = ...;
* while (buffer.maxWritableBytes() >= 4) {
*     buffer.writeInt(random.nextInt());
* }
* </pre>
```

Discardable bytes 可废弃字节：

```
*
* <h4>Discardable bytes</h4>
*
* This segment contains the bytes which were read already by a read operation.
* Initially, the size of this segment is {@code 0}, but its size increases up
* to the {@link #writerIndex() writerIndex} as read operations are executed.
* The read bytes can be discarded by calling {@link #discardReadBytes()} to
* reclaim unused area as depicted by the following diagram:
*
```

这部分包括了 buffer 中之前已经被读操作读取过的的字节。初始化时，这部分的大小为 0，不过当读操作被执行时，它会从 0 开始向 writerIndex 不断增加。这些字节可以通过调用  discardReadBytes() 来回收未使用的区域，如下图所示：

```
*
* <pre>
*  BEFORE discardReadBytes()
*
*      +-------------------+------------------+------------------+
*      | discardable bytes |  readable bytes  |  writable bytes  |
*      +-------------------+------------------+------------------+
*      |                   |                  |                  |
*      0      <=      readerIndex   <=   writerIndex    <=    capacity
*
*
*  AFTER discardReadBytes()
*
*      +------------------+--------------------------------------+
*      |  readable bytes  |    writable bytes (got more space)   |
*      +------------------+--------------------------------------+
*      |                  |                                      |
* readerIndex (0) <= writerIndex (decreased)        <=        capacity
* </pre>
*
* Please note that there is no guarantee about the content of writable bytes
* after calling {@link #discardReadBytes()}.  The writable bytes will not be
* moved in most cases and could even be filled with completely different data
* depending on the underlying buffer implementation.
*
```

注意在调用 discardReadBytes() 以后不保证 writable bytes 的内容。大多数情况下 writable bytes 不会被移动，甚至可能在当前实现类情况下被完全不同的数据填充。

清除 buffer 索引：

```
*
* <h4>Clearing the buffer indexes</h4>
*
* You can set both {@link #readerIndex() readerIndex} and
* {@link #writerIndex() writerIndex} to {@code 0} by calling {@link #clear()}.
* It does not clear the buffer content (e.g. filling with {@code 0}) but just
* clears the two pointers.  Please also note that the semantic of this
* operation is different from {@link ByteBuffer#clear()}.
*
```

你可以通过调用 clear() 方法将 readerIndex 和 writerIndex 重置为 0。它不会清除 buffer 的内容，仅仅只是重置这两个索引指针。还需注意的是这个 clear() 方法的语义与 JDK 的 ByteBuffer 的 clear() 是不同的。

```
*
* <pre>
*  BEFORE clear()
*
*      +-------------------+------------------+------------------+
*      | discardable bytes |  readable bytes  |  writable bytes  |
*      +-------------------+------------------+------------------+
*      |                   |                  |                  |
*      0      <=      readerIndex   <=   writerIndex    <=    capacity
*
*
*  AFTER clear()
*
*      +---------------------------------------------------------+
*      |             writable bytes (got more space)             |
*      +---------------------------------------------------------+
*      |                                                         |
*      0 = readerIndex = writerIndex            <=            capacity
* </pre>
*
```

### 搜索操作：

```
*
* <h3>Search operations</h3>
*
* For simple single-byte searches, use {@link #indexOf(int, int, byte)} and {@link #bytesBefore(int, int, byte)}.
* {@link #bytesBefore(byte)} is especially useful when you deal with a {@code NUL}-terminated string.
* For complicated searches, use {@link #forEachByte(int, int, ByteBufProcessor)} with a {@link ByteBufProcessor}
* implementation.
*
```

对于简单的单字节搜索，可以使用 indexOf(int, int, byte) 和 bytesBefore(int, int, byte)。当处理 NUL-terminated 字符串（网上查了一圈仍然没搞清楚NUL-terminated 到底该怎么解释，希望大神补充一下）时，bytesBefore(byte) 尤其有用。对于复杂搜索，使用 forEachByte(int, int, ByteBufProcessor)。

### Mark 标记和 reset 重置：

```
*
* <h3>Mark and reset</h3>
*
* There are two marker indexes in every buffer. One is for storing
* {@link #readerIndex() readerIndex} and the other is for storing
* {@link #writerIndex() writerIndex}.  You can always reposition one of the
* two indexes by calling a reset method.  It works in a similar fashion to
* the mark and reset methods in {@link InputStream} except that there's no
* {@code readlimit}.
*
```
每个 buffer 都有两个标记索引。一个用来存储读索引 readerIndex，另一个用于存储写索引 writerIndex。你可以随时通过调用 reset 方法一次重定位这两个索引其中之一。它与 InputStream 的 mark 和 reset 方法作用形式类似，除了没有 readlimit 读取限制。

### Derived buffers 衍生 ：

```
*
* <h3>Derived buffers</h3>
*
* You can create a view of an existing buffer by calling either
* {@link #duplicate()}, {@link #slice()} or {@link #slice(int, int)}.
* A derived buffer will have an independent {@link #readerIndex() readerIndex},
* {@link #writerIndex() writerIndex} and marker indexes, while it shares
* other internal data representation, just like a NIO buffer does.
* <p>
* In case a completely fresh copy of an existing buffer is required, please
* call {@link #copy()} method instead.
*
```
你可以通过调用现有 buffer 的 duplicate() 或者 slice() 或者 slice(int, int) 方法来创建它的一个视图。一个衍生的 buffer 拥有独立的读索引 readerIndex，写索引 writerIndex 和标记索引，但它与原始 buffer 共享其他内部数据，就像 NIO  buffer 一样。

如果需要现有 buffer 的一个完全独立的副本，请调用 copy() 方法。

### Conversion to existing JDK types 转换到已有的 JDK 类型：

#### Byte array 字节数组：

```
*
* <h4>Byte array</h4>
*
* If a {@link ByteBuf} is backed by a byte array (i.e. {@code byte[]}),
* you can access it directly via the {@link #array()} method.  To determine
* if a buffer is backed by a byte array, {@link #hasArray()} should be used.
*
```

如果某个 ByteBuf  实现类内部支持字节数组 byte[]，你可以通过 array() 方法直接访问它。可以通过 hasArray() 方法查看 buffer 实现类内部是否支持字节数组。

#### NIO Buffers:

```
*
* <h4>NIO Buffers</h4>
*
* If a {@link ByteBuf} can be converted into an NIO {@link ByteBuffer} which shares its
* content (i.e. view buffer), you can get it via the {@link #nioBuffer()} method.  To determine
* if a buffer can be converted into an NIO buffer, use {@link #nioBufferCount()}.
*
```

如果一个 ByteBuf  可以被转换成一个共享其内容的 NIO ByteBuffer（视图 buffer），你可以通过 nioBuffer() 方法获取它。可以通过 nioBufferCount() 方法查看 buffer 实现类是否可以被转换为 NIO buffer。

#### Strings 字符串：

```
*
* <h4>Strings</h4>
*
* Various {@link #toString(Charset)} methods convert a {@link ByteBuf}
* into a {@link String}.  Please note that {@link #toString()} is not a
* conversion method.
*
```

各个 toString() 方法用于将 ByteBuf 转换成 String 字符串，注意  toString() 不是转换方法。

#### I/O Streams 流：
```
*
* <h4>I/O Streams</h4>
*
* Please refer to {@link ByteBufInputStream} and
* {@link ByteBufOutputStream}.
*/
```
参见 ByteBufInputStream 和 ByteBufOutputStream 。

## 下面我们再逐个看一下 ByteBuf 这个基础接口里的各个方法：
```java
/**
 * Returns the number of bytes (octets) this buffer can contain.
 */
public abstract int capacity();
```
抽象方法。返回 buffer 能容纳的 bytes 字节（8 bit 字节）的数量。具体由实现类实现。

```java
/**
 * Adjusts the capacity of this buffer.  If the {@code newCapacity} is less than the current
 * capacity, the content of this buffer is truncated.  If the {@code newCapacity} is greater
 * than the current capacity, the buffer is appended with unspecified data whose length is
 * {@code (newCapacity - currentCapacity)}.
 */
public abstract ByteBuf capacity(int newCapacity);
```
抽象方法。调整 buffer 的容量。如果参数 newCapacity  小于当前容量，则 buffer 的内容会被截断。如果 newCapacity  大于当前容量，则 buffer 会在末尾添加 newCapacity  - currentCapacity 个长度字节的未指定数据。

```java
/**
 * Returns the maximum allowed capacity of this buffer.  If a user attempts to increase the
 * capacity of this buffer beyond the maximum capacity using {@link #capacity(int)} or
 * {@link #ensureWritable(int)}, those methods will raise an
 * {@link IllegalArgumentException}.
 */
public abstract int maxCapacity();
```
抽象方法。返回 buffer 所允许的最大容量。如果用户尝试使用 capacity(int) 或者 ensureWritable(int) 来增加 buffer 的容量并且其值产国了最大容量，则会在调用的方法中抛出 IllegalArgumentException 非法参数异常。

```java
/**
 * Returns the {@link ByteBufAllocator} which created this buffer.
 */
public abstract ByteBufAllocator alloc();
```
抽象方法。返回创建这个 buffer 的 ByteBufAllocator。

```java
/**
 * Returns the <a href="http://en.wikipedia.org/wiki/Endianness">endianness</a>
 * of this buffer.
 */
public abstract ByteOrder order();
```
抽象方法。返回这个 buffer 的大小端顺序。

```java
/**
 * Returns a buffer with the specified {@code endianness} which shares the whole region,
 * indexes, and marks of this buffer.  Modifying the content, the indexes, or the marks of the
 * returned buffer or this buffer affects each other's content, indexes, and marks.  If the
 * specified {@code endianness} is identical to this buffer's byte order, this method can
 * return {@code this}.  This method does not modify {@code readerIndex} or {@code writerIndex}
 * of this buffer.
 */
public abstract ByteBuf order(ByteOrder endianness);
```
抽象方法。返回指定大小端的 buffer，与源 buffer 共享整个数据区域，索引，标记。修改这两个 buffer 其中之一的内容，索引和标记都会影响另一个 buffer 的内容，索引和标记。如果指定的大小端与源 buffer 的字节序一致，那么此方法直接返回 this 对象。此方法不会更改源 buffer 的读索引 readerIndex 和写索引 writerIndex。

```java
/**
 * Return the underlying buffer instance if this buffer is a wrapper of another buffer.
 *
 * @return {@code null} if this buffer is not a wrapper
 */
public abstract ByteBuf unwrap();
```
抽象方法。如果此 buffer 是另一个buffer 包装后的实体，则返回被包装的当前 buffer 实例；如果比 buffer 不是一个包装类实体，则返回 null。

```java
/**
 * Returns {@code true} if and only if this buffer is backed by an
 * NIO direct buffer.
 */
public abstract boolean isDirect();
```
抽象方法。当且仅当此 buffer 内部支持 NIO 直接 buffer 时，返回 true。

```java
/**
 * Returns the {@code readerIndex} of this buffer.
 */
public abstract int readerIndex();
```
抽象方法。返回 buffer 读索引 readerIndex。

```java
/**
 * Sets the {@code readerIndex} of this buffer.
 *
 * @throws IndexOutOfBoundsException
 *         if the specified {@code readerIndex} is
 *            less than {@code 0} or
 *            greater than {@code this.writerIndex}
 */
public abstract ByteBuf readerIndex(int readerIndex);
```
抽象方法。设置 buffer 的读索引 readerIndex。如果设置的值小于0或者大于写索引 writerIndex，则抛数组越界异常。

```java
/**
 * Returns the {@code writerIndex} of this buffer.
 */
public abstract int writerIndex();
```
抽象方法。返回 buffer 写索引 writerIndex。

```java
/**
 * Sets the {@code writerIndex} of this buffer.
 *
 * @throws IndexOutOfBoundsException
 *         if the specified {@code writerIndex} is
 *            less than {@code this.readerIndex} or
 *            greater than {@code this.capacity}
 */
public abstract ByteBuf writerIndex(int writerIndex);
```
抽象方法。设置 buffer 的写索引 writerIndex。如果设置的值小于 readerIndex 或者大于 buffer 容量 capacity，则抛数组越界异常。


```java
/**
 * Sets the {@code readerIndex} and {@code writerIndex} of this buffer
 * in one shot.  This method is useful when you have to worry about the
 * invocation order of {@link #readerIndex(int)} and {@link #writerIndex(int)}
 * methods.
 * @throws IndexOutOfBoundsException
 *         if the specified {@code readerIndex} is less than 0,
 *         if the specified {@code writerIndex} is less than the specified
 *         {@code readerIndex} or if the specified {@code writerIndex} is
 *         greater than {@code this.capacity}
 */
 public abstract ByteBuf setIndex(int readerIndex, int writerIndex);
 ```
 抽象方法。一次性设置 buffer 的读索引 readerIndex 和写索引 writerIndex。当你不得不需要考虑 readerIndex(int) 和 writerIndex(int) 的调用顺序时，此方法很有用。如果指定的读索引小于0；指定的写索引小于读索引或者大于 buffer 容量 capacity，方法抛数组越界异常。

举例下面的例子都是失败的反例：

```
*
* <pre>
* // Create a buffer whose readerIndex, writerIndex and capacity are
* // 0, 0 and 8 respectively.
* {@link ByteBuf} buf = {@link Unpooled}.buffer(8);
*
* // IndexOutOfBoundsException is thrown because the specified
* // readerIndex (2) cannot be greater than the current writerIndex (0).
* buf.readerIndex(2);
* buf.writerIndex(4);
* </pre>
*
```
上面的例子种，首先创建一个读索引0，写索引0，容量为8的 buffer。调用 readerIndex(2) 时，程序抛数组越界异常，因为当前的写索引为0，根据 readerIndex(int) 定义，故抛异常。

```
* The following code will also fail:
*
* <pre>
* // Create a buffer whose readerIndex, writerIndex and capacity are
* // 0, 8 and 8 respectively.
* {@link ByteBuf} buf = {@link Unpooled}.wrappedBuffer(new byte[8]);
*
* // readerIndex becomes 8.
* buf.readLong();
*
* // IndexOutOfBoundsException is thrown because the specified
* // writerIndex (4) cannot be less than the current readerIndex (8).
* buf.writerIndex(4);
* buf.readerIndex(2);
* </pre>
*
```
这个例子也是错误的。首先创建一个读索引0，写索引8，容量为8的 wrappedbuffer。接着执行buf.readLong()，此时读索引 readerIndex 为8，调用 writerIndex(4) 时，程序抛数组越界异常，因为当前的读索引为8，根据 writerIndex(int) 定义，故抛异常。

```
* By contrast, this method guarantees that it never
* throws an {@link IndexOutOfBoundsException} as long as the specified
* indexes meet basic constraints, regardless what the current index
* values of the buffer are:
*
* <pre>
* // No matter what the current state of the buffer is, the following
* // call always succeeds as long as the capacity of the buffer is not
* // less than 4.
* buf.setIndex(2, 4);
* </pre>
*
```
相反，只要指定的索引满足基本约束，则无论 buffer 的当前索引值是多少，方法都保证不会抛数组越界异常。

举个例子，只要 buffer 的容量不小于4，则 buf.setIndex(2, 4) 的执行永远成功。

```java
/**
 * Returns the number of readable bytes which is equal to
 * {@code (this.writerIndex - this.readerIndex)}.
 */
public abstract int readableBytes();
```
抽象方法。返回 buffer 的可读字节数。它等于 this.writerIndex - this.readerIndex 的值。

```java
/**
 * Returns the number of writable bytes which is equal to
 * {@code (this.capacity - this.writerIndex)}.
 */
public abstract int writableBytes();
```
抽象方法。返回 buffer 的可写字节数。它等于 this.capacity - this.writerIndex 的值。

```java
/**
 * Returns the maximum possible number of writable bytes, which is equal to
 * {@code (this.maxCapacity - this.writerIndex)}.
 */
public abstract int maxWritableBytes();
```
抽象方法。返回 buffer 可写字节数的最大可能值。它等于 this.maxCapacity - this.writerIndex 的值。

```java
/**
 * Returns {@code true}
 * if and only if {@code (this.writerIndex - this.readerIndex)} is greater
 * than {@code 0}.
 */
public abstract boolean isReadable();
```
抽象方法。表示 buffer 是否可读。当且仅当 this.writerIndex - this.readerIndex 大于 0 时返回 true。

```java
/**
 * Returns {@code true} if and only if this buffer contains equal to or more than the specified number of elements.
 */
public abstract boolean isReadable(int size);
```
抽象方法。当且仅当 buffer  的可读字节数大于等于 size 的值时，返回 true。

```java
/**
 * Returns {@code true}
 * if and only if {@code (this.capacity - this.writerIndex)} is greater
 * than {@code 0}.
 */
public abstract boolean isWritable();

/**
 * Returns {@code true} if and only if this buffer has enough room to allow writing the specified number of
 * elements.
 */
public abstract boolean isWritable(int size);
```
以上两个方法与 isReadable() 和 isReadable(int size) 类似，不再赘述。

```java
/**
 * Sets the {@code readerIndex} and {@code writerIndex} of this buffer to
 * {@code 0}.
 * This method is identical to {@link #setIndex(int, int) setIndex(0, 0)}.
 * <p>
 * Please note that the behavior of this method is different
 * from that of NIO buffer, which sets the {@code limit} to
 * the {@code capacity} of the buffer.
 */
public abstract ByteBuf clear();
```
抽象方法。将 buffer 的读索引和写索引都置为0。此方法与 setIndex(0, 0) 相同。注意此方法与 NIO buffer 的 clear 不同，NIO buffer 的 clear 会同时将其 limit 设置为 buffer 的容量 capacity。

```java
/**
 * Marks the current {@code readerIndex} in this buffer.  You can
 * reposition the current {@code readerIndex} to the marked
 * {@code readerIndex} by calling {@link #resetReaderIndex()}.
 * The initial value of the marked {@code readerIndex} is {@code 0}.
 */
public abstract ByteBuf markReaderIndex();

/**
 * Repositions the current {@code readerIndex} to the marked
 * {@code readerIndex} in this buffer.
 *
 * @throws IndexOutOfBoundsException
 *         if the current {@code writerIndex} is less than the marked
 *         {@code readerIndex}
 */
public abstract ByteBuf resetReaderIndex();
```
markReaderIndex() 与 resetReaderIndex() 配合使用，前者标记当前 readerIndex，后者将读索引重置为前者当时标记的位置。

```java
/**
 * Marks the current {@code writerIndex} in this buffer.  You can
 * reposition the current {@code writerIndex} to the marked
 * {@code writerIndex} by calling {@link #resetWriterIndex()}.
 * The initial value of the marked {@code writerIndex} is {@code 0}.
 */
public abstract ByteBuf markWriterIndex();

/**
 * Repositions the current {@code writerIndex} to the marked
 * {@code writerIndex} in this buffer.
 *
 * @throws IndexOutOfBoundsException
 *         if the current {@code readerIndex} is greater than the marked
 *         {@code writerIndex}
 */
public abstract ByteBuf resetWriterIndex();
```
对写索引的 mark 和 reset 同理，不再赘述。

```java
/**
 * Discards the bytes between the 0th index and {@code readerIndex}.
 * It moves the bytes between {@code readerIndex} and {@code writerIndex}
 * to the 0th index, and sets {@code readerIndex} and {@code writerIndex}
 * to {@code 0} and {@code oldWriterIndex - oldReaderIndex} respectively.
 * <p>
 * Please refer to the class documentation for more detailed explanation.
 */
public abstract ByteBuf discardReadBytes();
```
抽象方法。将从索引0开始到 readerIndex 长度的字节内容丢弃。它将从 readerIndex 到 writerIndex 的内容移动到 0 索引开始的 buffer 最前端，并且将 readerIndex 设置为0，将 writerIndex 设置为 原来的 writerIndex - 原来的 readerIndex。

```java
/**
 * Similar to {@link ByteBuf#discardReadBytes()} except that this method might discard
 * some, all, or none of read bytes depending on its internal implementation to reduce
 * overall memory bandwidth consumption at the cost of potentially additional memory
 * consumption.
 */
public abstract ByteBuf discardSomeReadBytes();
```
抽象方法。与上面的 discardReadBytes() 类似。区别是，此方法会丢弃一些，或者全部，或者一个已读字节都不丢弃，而这些可能性都取决于其实现类用潜在的额外内存消耗来减少整体内存带宽消耗的具体不同的内部实现。也就是说不同的 ByteBuf 实类其 discardSomeReadBytes() 的具体 discard 字节的策略是不同的，这导致执行丢弃的的内容也是不同的。

```java
/**
 * Makes sure the number of {@linkplain #writableBytes() the writable bytes}
 * is equal to or greater than the specified value.  If there is enough
 * writable bytes in this buffer, this method returns with no side effect.
 * Otherwise, it raises an {@link IllegalArgumentException}.
 *
 * @param minWritableBytes
 *        the expected minimum number of writable bytes
 * @throws IndexOutOfBoundsException
 *         if {@link #writerIndex()} + {@code minWritableBytes} > {@link #maxCapacity()}
 */
public abstract ByteBuf ensureWritable(int minWritableBytes);
```
抽象方法。确保 buffer 的可写字节数大于等于指定的 minWritableBytes。如果 buffer 有足够的可写字节，则方法正常返回且无任何副作用；否则，会抛出非法参数异常。

```java
/**
 * Tries to make sure the number of {@linkplain #writableBytes() the writable bytes}
 * is equal to or greater than the specified value.  Unlike {@link #ensureWritable(int)},
 * this method does not raise an exception but returns a code.
 *
 * @param minWritableBytes
 *        the expected minimum number of writable bytes
 * @param force
 *        When {@link #writerIndex()} + {@code minWritableBytes} > {@link #maxCapacity()}:
 *        <ul>
 *        <li>{@code true} - the capacity of the buffer is expanded to {@link #maxCapacity()}</li>
 *        <li>{@code false} - the capacity of the buffer is unchanged</li>
 *        </ul>
 * @return {@code 0} if the buffer has enough writable bytes, and its capacity is unchanged.
 *         {@code 1} if the buffer does not have enough bytes, and its capacity is unchanged.
 *         {@code 2} if the buffer has enough writable bytes, and its capacity has been increased.
 *         {@code 3} if the buffer does not have enough bytes, but its capacity has been
 *                   increased to its maximum.
 */
public abstract int ensureWritable(int minWritableBytes, boolean force);
```
抽象方法。尝试确保 buffer 的可写字节数大于等于指定的 minWritableBytes。与 ensureWritable(int) 不同，此方法不会抛出异常，相应地而是返回状态码。

### 以下方法为随机读取 SPI：

```java
/**
 * Gets a boolean at the specified absolute (@code index) in this buffer.
 * This method does not modify the {@code readerIndex} or {@code writerIndex}
 * of this buffer.
 *
 * @throws IndexOutOfBoundsException
 *         if the specified {@code index} is less than {@code 0} or
 *         {@code index + 1} is greater than {@code this.capacity}
 */
public abstract boolean getBoolean(int index);
```
抽象方法。返回 buffer 指定的绝对索引的布尔值。此方法不会修改 buffer 的读索引或写索引。
index 小于 0 或者 index+1 大于 this.capacity 时抛出数组越界异常。

```java
/**
 * Gets a byte at the specified absolute {@code index} in this buffer.
 * This method does not modify {@code readerIndex} or {@code writerIndex} of
 * this buffer.
 *
 * @throws IndexOutOfBoundsException
 *         if the specified {@code index} is less than {@code 0} or
 *         {@code index + 1} is greater than {@code this.capacity}
 */
public abstract byte  getByte(int index);
```
抽象方法。返回 buffer 指定的绝对索引的字节。此方法不会修改 buffer 的读索引或写索引。
index 小于 0 或者 index+1 大于 this.capacity 时抛出数组越界异常。

```java
/**
 * Gets an unsigned byte at the specified absolute {@code index} in this
 * buffer.  This method does not modify {@code readerIndex} or
 * {@code writerIndex} of this buffer.
 *
 * @throws IndexOutOfBoundsException
 *         if the specified {@code index} is less than {@code 0} or
 *         {@code index + 1} is greater than {@code this.capacity}
 */
public abstract short getUnsignedByte(int index);
```
抽象方法。与 getByte(int index) 类似，返回无符号字节。

```java
public abstract short getShort(int index);
public abstract int getUnsignedShort(int index);
public abstract int   getMedium(int index);
public abstract int   getUnsignedMedium(int index);
public abstract int   getInt(int index);
public abstract long  getUnsignedInt(int index);
public abstract long  getLong(int index);
public abstract char  getChar(int index);
public abstract float getFloat(int index);
public abstract double getDouble(int index);
public abstract ByteBuf getBytes(int index, ByteBuf dst);
public abstract ByteBuf getBytes(int index, ByteBuf dst, int length);
public abstract ByteBuf getBytes(int index, ByteBuf dst, int dstIndex, int length);
public abstract ByteBuf getBytes(int index, byte[] dst);
public abstract ByteBuf getBytes(int index, byte[] dst, int dstIndex, int length);
public abstract ByteBuf getBytes(int index, ByteBuffer dst);
public abstract ByteBuf getBytes(int index, OutputStream out, int length) throws IOException;
public abstract int getBytes(int index, GatheringByteChannel out, int length) throws IOException;
```
上述方法以此类推，不再赘述。

### 以下方法为随机写 SPI：
```java
public abstract ByteBuf setBoolean(int index, boolean value);
public abstract ByteBuf setByte(int index, int value);
public abstract ByteBuf setShort(int index, int value);
public abstract ByteBuf setMedium(int index, int   value);
public abstract ByteBuf setInt(int index, int   value);
public abstract ByteBuf setLong(int index, long  value);
public abstract ByteBuf setChar(int index, int value);
public abstract ByteBuf setFloat(int index, float value);
public abstract ByteBuf setDouble(int index, double value);
public abstract ByteBuf setBytes(int index, ByteBuf src);
public abstract ByteBuf setBytes(int index, ByteBuf src, int length);
public abstract ByteBuf setBytes(int index, ByteBuf src, int srcIndex, int length);
public abstract ByteBuf setBytes(int index, byte[] src);
public abstract ByteBuf setBytes(int index, byte[] src, int srcIndex, int length);
public abstract ByteBuf setBytes(int index, ByteBuffer src);
public abstract int setBytes(int index, InputStream in, int length) throws IOException;
public abstract int  setBytes(int index, ScatteringByteChannel in, int length) throws IOException;
public abstract ByteBuf setZero(int index, int length);
```
### 以下方法为顺序读 SPI：
```java
public abstract boolean readBoolean();
public abstract byte  readByte();
public abstract short readUnsignedByte();
public abstract short readShort();
public abstract int   readUnsignedShort();
public abstract int   readMedium();
public abstract int   readUnsignedMedium();
public abstract int   readInt();
public abstract long  readUnsignedInt();
public abstract long  readLong();
public abstract char  readChar();
public abstract float readFloat();
public abstract double readDouble();
public abstract ByteBuf readBytes(int length);
public abstract ByteBuf readSlice(int length);
public abstract ByteBuf readBytes(ByteBuf dst);
public abstract ByteBuf readBytes(ByteBuf dst, int length);
public abstract ByteBuf readBytes(ByteBuf dst, int dstIndex, int length);
public abstract ByteBuf readBytes(byte[] dst);
public abstract ByteBuf readBytes(byte[] dst, int dstIndex, int length);
public abstract ByteBuf readBytes(ByteBuffer dst);
public abstract ByteBuf readBytes(OutputStream out, int length) throws IOException;
public abstract int  readBytes(GatheringByteChannel out, int length) throws IOException;
public abstract ByteBuf skipBytes(int length);
```
### 以下方法为顺序写 SPI：

```java
public abstract ByteBuf writeBoolean(boolean value);
public abstract ByteBuf writeByte(int value);
public abstract ByteBuf writeShort(int value);
public abstract ByteBuf writeMedium(int   value);
public abstract ByteBuf writeInt(int   value);
public abstract ByteBuf writeLong(long  value);
public abstract ByteBuf writeChar(int value);
public abstract ByteBuf writeFloat(float value);
public abstract ByteBuf writeDouble(double value);
public abstract ByteBuf writeBytes(ByteBuf src);
public abstract ByteBuf writeBytes(ByteBuf src, int length);
public abstract ByteBuf writeBytes(ByteBuf src, int srcIndex, int length);
public abstract ByteBuf writeBytes(byte[] src);
public abstract ByteBuf writeBytes(byte[] src, int srcIndex, int length);
public abstract ByteBuf writeBytes(ByteBuffer src);
public abstract int  writeBytes(InputStream in, int length) throws IOException;
public abstract int  writeBytes(ScatteringByteChannel in, int length) throws IOException;
public abstract ByteBuf writeZero(int length);
```
### 以下方法定位 ByteBuf 特定索引位置：

```java
/**
 * Locates the first occurrence of the specified {@code value} in this
 * buffer.  The search takes place from the specified {@code fromIndex}
 * (inclusive)  to the specified {@code toIndex} (exclusive).
 * <p>
 * If {@code fromIndex} is greater than {@code toIndex}, the search is
 * performed in a reversed order.
 * <p>
 * This method does not modify {@code readerIndex} or {@code writerIndex} of
 * this buffer.
 *
 * @return the absolute index of the first occurrence if found.
 *         {@code -1} otherwise.
 */
public abstract int indexOf(int fromIndex, int toIndex, byte value);
```
抽象方法。定位 buffer 中第一次出现 value 值的的索引位置。搜索范围[ fromIndex , toIndex )。 

```java
public abstract int bytesBefore(byte value); // 搜索范围[rederIndex, writerIndex)
public abstract int bytesBefore(int length, byte value); // 搜索范围 [rederIndex, readerIndex+length),如果readerIndex+length大于 writerIndex，抛数组越界异常
public abstract int bytesBefore(int index, int length, byte value);// 搜索范围 [index, index+length]
```
### 以下方法遍历 ByteBuf 并将相应字节传递给 ByteBufProcessor 处理：

```java
public abstract int forEachByte(ByteBufProcessor processor);
public abstract int forEachByte(int index, int length, ByteBufProcessor processor);
public abstract int forEachByteDesc(ByteBufProcessor processor); // 倒序
public abstract int forEachByteDesc(int index, int length, ByteBufProcessor processor); // 倒序
```
### 以下方法复制完整独立的 ByteBuf 副本：

```java
/**
 * Returns a copy of this buffer's readable bytes.  Modifying the content
 * of the returned buffer or this buffer does not affect each other at all.
 * This method is identical to {@code buf.copy(buf.readerIndex(), buf.readableBytes())}.
 * This method does not modify {@code readerIndex} or {@code writerIndex} of
 * this buffer.
 */
public abstract ByteBuf copy();
```
抽象方法。返回当前 buffer 的可读字节 的 ByteBuf 副本。

```java
/**
 * Returns a copy of this buffer's sub-region.  Modifying the content of
 * the returned buffer or this buffer does not affect each other at all.
 * This method does not modify {@code readerIndex} or {@code writerIndex} of
 * this buffer.
 */
public abstract ByteBuf copy(int index, int length);
```
抽象方法。返回当前 buffer 的子区域（从index 到 index+length） 的 ByteBuf 副本。

### 以下方法返回 ByteBuf 一份切片：
```java
/**
 * Returns a slice of this buffer's readable bytes. Modifying the content
 * of the returned buffer or this buffer affects each other's content
 * while they maintain separate indexes and marks.  This method is
 * identical to {@code buf.slice(buf.readerIndex(), buf.readableBytes())}.
 * This method does not modify {@code readerIndex} or {@code writerIndex} of
 * this buffer.
 */
public abstract ByteBuf slice();
```
抽象方法。返回当前 buffer 可读字节的切片（类似于视图）。

```java
/**
 * Returns a slice of this buffer's sub-region. Modifying the content of
 * the returned buffer or this buffer affects each other's content while
 * they maintain separate indexes and marks.
 * This method does not modify {@code readerIndex} or {@code writerIndex} of
 * this buffer.
 */
public abstract ByteBuf slice(int index, int length);
```
抽象方法。返回当前 buffer 子区域（从index 到 index+length）的切片（类似于视图）。

```java
/**
 * Returns a buffer which shares the whole region of this buffer.
 * Modifying the content of the returned buffer or this buffer affects
 * each other's content while they maintain separate indexes and marks.
 * This method is identical to {@code buf.slice(0, buf.capacity())}.
 * This method does not modify {@code readerIndex} or {@code writerIndex} of
 * this buffer.
 */
public abstract ByteBuf duplicate();
```
抽象方法。返回当前 buffer 整个返回的副本，与当前 buffer 共享数据区域。

>注意 slice()，duplicate() 方法，返回的 ByteBuf 与源 buffer 共享数据结构，只是单独维护自己的读索引 readIndex 和写索引 writerIndex。而 copy() 方法会创建完全独立的 ByteBuf 实例，与源 buffer 之间不会相互影响。

### 以下方法 ByteBuf 到 NIO ByteBuffer 的转换相关方法：

```java
/**
 * Returns the maximum number of NIO {@link ByteBuffer}s that consist this buffer.  Note that {@link #nioBuffers()}
 * or {@link #nioBuffers(int, int)} might return a less number of {@link ByteBuffer}s.
 *
 * @return {@code -1} if this buffer has no underlying {@link ByteBuffer}.
 *         the number of the underlying {@link ByteBuffer}s if this buffer has at least one underlying
 *         {@link ByteBuffer}.  Note that this method does not return {@code 0} to avoid confusion.
 *
 * @see #nioBuffer()
 * @see #nioBuffer(int, int)
 * @see #nioBuffers()
 * @see #nioBuffers(int, int)
 */
public abstract int nioBufferCount();
```
抽象方法。返回组成此 buffer 的 NIO ByteBuffer 的最大个数。注意 nioBuffers() 和 nioBuffers(int, int) 返回的值可能会比实际 ByteBuffers 的个数小。

```java
/**
 * Exposes this buffer's readable bytes as an NIO {@link ByteBuffer}.  The returned buffer
 * shares the content with this buffer, while changing the position and limit of the returned
 * NIO buffer does not affect the indexes and marks of this buffer.  This method is identical
 * to {@code buf.nioBuffer(buf.readerIndex(), buf.readableBytes())}.  This method does not
 * modify {@code readerIndex} or {@code writerIndex} of this buffer.  Please note that the
 * returned NIO buffer will not see the changes of this buffer if this buffer is a dynamic
 * buffer and it adjusted its capacity.
 *
 * @throws UnsupportedOperationException
 *         if this buffer cannot create a {@link ByteBuffer} that shares the content with itself
 *
 * @see #nioBufferCount()
 * @see #nioBuffers()
 * @see #nioBuffers(int, int)
 */
public abstract ByteBuffer nioBuffer(); // 1
public abstract ByteBuffer nioBuffer(int index, int length); // 2
public abstract ByteBuffer[] nioBuffers(); //3
public abstract ByteBuffer[] nioBuffers(int index, int length); //4
```
抽象方法。将此 buffer 的可读字节以 NIO ByteBuffer 的形式暴露出去。返回的 buffer 与源 buffer 共享数据，不过对返回的 NIO buffer 的 position 和 limit 的修改不会影响源 buffer 的索引和标记位置。注意如果源 buffer 是一个动态 buffer，返回的 NIO buffer 不会看到对源 buffer 的修改。

方法 2 与方法 1 类似，除了指定要返回的字节范围。

方法 3 将此 buffer 的可读字节以 NIO ByteBuffer 数组的形式暴露出去。

方法 4 与方法 3 类似，除了指定要返回的字节范围。

```java
/**
 * Internal use only: Exposes the internal NIO buffer.
 */
public abstract ByteBuffer internalNioBuffer(int index, int length);
```
抽象方法。仅用于内部使用：暴露内部 NIO buffer。

### 以下方法与内部字节数组相关：

```java
/**
 * Returns {@code true} if and only if this buffer has a backing byte array.
 * If this method returns true, you can safely call {@link #array()} and
 * {@link #arrayOffset()}.
 */
public abstract boolean hasArray();
```
抽象方法。当且仅当此 buffer 内部支持字节数据时，返回 true。如果方法返回 true，则可以安全地使用 array() 方法和 arrayOffset() 方法。

```java
/**
 * Returns the backing byte array of this buffer.
 *
 * @throws UnsupportedOperationException
 *         if there no accessible backing byte array
 */
public abstract byte[] array();
```
抽象方法。返回此 buffer 内部的字节数组。

```java
/**
 * Returns the offset of the first byte within the backing byte array of
 * this buffer.
 *
 * @throws UnsupportedOperationException
 *         if there no accessible backing byte array
 */
public abstract int arrayOffset();
```
抽象方法。返回此 buffer 内部字节数组中第一个字节的偏移量（索引位置）。

### 其他方法包括一些不常用的方法，及toString等工具方法，一并列出：

```java
/**
 * Returns {@code true} if and only if this buffer has a reference to the low-level memory address that points
 * to the backing data.
 */
public abstract boolean hasMemoryAddress();

/**
 * Returns the low-level memory address that point to the first byte of ths backing data.
 *
 * @throws UnsupportedOperationException
 *         if this buffer does not support accessing the low-level memory address
 */
public abstract long memoryAddress();

/**
 * Decodes this buffer's readable bytes into a string with the specified
 * character set name.  This method is identical to
 * {@code buf.toString(buf.readerIndex(), buf.readableBytes(), charsetName)}.
 * This method does not modify {@code readerIndex} or {@code writerIndex} of
 * this buffer.
 *
 * @throws UnsupportedCharsetException
 *         if the specified character set name is not supported by the
 *         current VM
 */
public abstract String toString(Charset charset);

/**
 * Decodes this buffer's sub-region into a string with the specified
 * character set.  This method does not modify {@code readerIndex} or
 * {@code writerIndex} of this buffer.
 */
public abstract String toString(int index, int length, Charset charset);

/**
 * Returns a hash code which was calculated from the content of this
 * buffer.  If there's a byte array which is
 * {@linkplain #equals(Object) equal to} this array, both arrays should
 * return the same value.
 */
@Override
public abstract int hashCode();

/**
 * Determines if the content of the specified buffer is identical to the
 * content of this array.  'Identical' here means:
 * <ul>
 * <li>the size of the contents of the two buffers are same and</li>
 * <li>every single byte of the content of the two buffers are same.</li>
 * </ul>
 * Please note that it does not compare {@link #readerIndex()} nor
 * {@link #writerIndex()}.  This method also returns {@code false} for
 * {@code null} and an object which is not an instance of
 * {@link ByteBuf} type.
 */
@Override
public abstract boolean equals(Object obj);

/**
 * Compares the content of the specified buffer to the content of this
 * buffer.  Comparison is performed in the same manner with the string
 * comparison functions of various languages such as {@code strcmp},
 * {@code memcmp} and {@link String#compareTo(String)}.
 */
@Override
public abstract int compareTo(ByteBuf buffer);

/**
 * Returns the string representation of this buffer.  This method does not
 * necessarily return the whole content of the buffer but returns
 * the values of the key properties such as {@link #readerIndex()},
 * {@link #writerIndex()} and {@link #capacity()}.
 */
@Override
public abstract String toString();

@Override
public abstract ByteBuf retain(int increment);

@Override
public abstract ByteBuf retain();
```

## 总结：

本文首先简要说明了一下 netty 中缓存数据的核心数据结构 ByteBuf 接口的层次结构，列出了一些重要的常用的抽象类和实现类，着重说明了直接内存这个概念，及其优缺点以及跟踪 netty 源代码理清了直接内存 buffer 的来龙去脉。

接着对 ByteBuf 接口的大部分方法进行了说明，主要包括对其读写索引，容量及其相关属性的查询和设置修改方法；对其进行随机读写，顺序读写的方法；其与 NIO ByteBuffer 交互的相关方法；遍历 ByteBuf 的相关方法；还有一些与复制相关的方法如 copy()，slice()，duplicate() 等。

可能大家会发现其中并没有与创建 ByteBuf 对象本身相关的方法。那是因为 netty 单独将所有与创建 ByteBuf 对象相关的功能抽象成了一个单独的数据结构层次也就是 ByteBufAllocator 接口。
