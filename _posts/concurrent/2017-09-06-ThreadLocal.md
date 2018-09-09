---
layout: post
title:  "ThreadLocal 简要总结"
date:   2017-09-06 14:56:17 +0800
categories: [javalang]
---

>ThreadLocal 简要总结

> 经过上一篇[reference 类型](https://www.numenor.cn/javalang/2017/09/04/reference.html)，初步理解了reference的概念，本篇文章分析jdk1.8 中的 ThreadLocal 类型。

# 引言

在java中我们知道万物皆为对象，在定义类的时候，会涉及到对变量的定义，如果加了static关键字，那么此变量就成为了类变量（静态变量），在整个应用中任何此类的对象都会共享这个变量，也就是说static变量的作用域就是这个类限制的；而如果是普通没有static关键字的变量就是实例变量，变量的作用域就是这个对象范围内。

# 问题

接下来看一个例子，在一个应用中需要为每个给定的 userId 保存 用户的具体用户 context 上下文信息：
```java
public class Context {
    private String userName;

    public Context(String userName) {
        this.userName = userName;
    }
}
```
接着我们想要为每个 userId 分配一个线程。所以创建了一个实现了 Runnable 接口名为 SharedMapWithUserContext 的类。这个实现的 run() 方法通过某个 UserRepository 查询数据库获取用户名，然后借此用户名以给定的 userId 为key，以用户名为参数新建的 Context 对象为 value ，放入 userContextPerUserId 这个 map 。
```java
public class SharedMapWithUserContext implements Runnable {

    public static Map<Integer, Context> userContextPerUserId
      = new ConcurrentHashMap<>();
    private Integer userId;
    private UserRepository userRepository = new UserRepository();

    @Override
    public void run() {
        String userName = userRepository.getUserNameForUserId(userId);
        userContextPerUserId.put(userId, new Context(userName));
    }

    // standard constructor
}
```
对此可以轻松通过创建两个不同 userId 的线程来断言 map 中会存在两个不同的 entry：
```java
SharedMapWithUserContext firstUser = new SharedMapWithUserContext(1);
SharedMapWithUserContext secondUser = new SharedMapWithUserContext(2);
new Thread(firstUser).start();
new Thread(secondUser).start();

assertEquals(SharedMapWithUserContext.userContextPerUserId.size(), 2);
```

 以上代码可以正确运行，但我们发现其中有一个问题。所有线程都将自己的信息存入 SharedMapWithUserContext 的类变量 userContextPerUserId 中，这是一个多线程对同一个资源的问题，涉及到资源同步问题，所以例子用使用了 ConcurrentHashMap 支持并发的 HashMap，但仔细一想，在我们遇到的多线程问题中，都是不同线程要对相同数据进行修改，所以需要加锁同步，而本例中，所有 userId 都是与其现成一一对应且互不相同的，所以对于 userContextPerUserId 即使要对其进行增删改查也是自己修改自己 userId 对应的 entry ，逻辑上根本不会有数据的不一致问题，所以用支持并发的容器其实并不完美，因为根本就不需要，但又不得不用并发类，因为从 java 语义上一旦涉及到多线程就必须保证资源的同步问题。

 思考一下，类变量是以类为作用域是类相关的，实例变量仅仅与当前对象有关，那么例子中需要保存的信息与其线程一一对应，仅与其线程有关，那么 java 中有没有一种以线程为作用域仅与线程相关的类呢？答案就是 ThreadLocal。

可以总结一下：ThreadLocal 的主要作用是为线程提供贯穿整个线程周期的局部变量，减少在同一线程内需要多次操作才能传递某些公共变量的复杂度。

# ThreadLocal 变量

ThreadLocal 类允许你在类中定义只能在统一线程范围内读取和写入的对象。即使几个不同的线程在执行同一段包含有 ThreadLocal 变量的代码时，这些线程的 ThreadLocal 变量也只对自我线程可见，对其他线程都不可见。也就是做到了数据的隔离，线程之间互相不影响。因此我们也可以推出 ThreadLocal 变量是线程安全的。

# ThreadLocal API

假如现在需要利用 ThreadLocal 创建一个与本线程绑定的 Integer 变量：
```java
ThreadLocal<Integer> threadLocalInteger = new ThreadLocal<>();
```
接着，在代码中我们可以通过调用 get() 和 set() 方法来使用这个变量。我们暂时可以将其想象成 ThreadLocal 变量存储在以当前线程为 key 变量值为 value 的 map 中。当我们在某个线程中对 threadLocalInteger 调用 get() 方法时，我们会得到对应线程中之前 set 的值。
```java
threadLocalValue.set(1);
Integer result = threadLocalValue.get();
```
在创建 ThreadLocal 变量时，可以用 static withInitial() 方法传入一个 Supplier 来初始化；
```java
ThreadLocal<Integer> threadLocal = ThreadLocal.withInitial(new Supplier<Integer>() {
  @Override
  public Integer get() {
    return 1;
  }
});
// 采用lambda表达式如下：
ThreadLocal<Integer> threadLocal = ThreadLocal.withInitial(() -> 1);
```
要删除 ThreadLocal 中存储的变量可以通过调用 remove() 方法：
```java
threadLocal.remove();
```
## 采用 ThreadLocal 重写存储上下文信息
在最开始的例子中在没有接触 ThreadLocal 类型之前不得不用 ConcurrentHashMap 并发容器提供多线程支持。在介绍过 ThreadLocal 我们可以重写这个例子。

run() 方法会获取用户上下文 context 然后用 set() 方法存入 ThreadLocal 变量：
```java
public class ThreadLocalWithUserContext implements Runnable {

    private static ThreadLocal<Context> userContext
      = new ThreadLocal<>();
    private Integer userId;
    private UserRepository userRepository = new UserRepository();

    @Override
    public void run() {
        String userName = userRepository.getUserNameForUserId(userId);
        userContext.set(new Context(userName));
        System.out.println("thread context for given userId: "
          + userId + " is: " + userContext.get());
    }

    // standard constructor
    ThreadLocalWithUserContext(){
      this.userId = UUID.randomUUID()
    }
}
```
测试通过启动两个不同线程并利用给定的不同 userId 调用相关方法：
```java
ThreadLocalWithUserContext firstUser
  = new ThreadLocalWithUserContext(1);
ThreadLocalWithUserContext secondUser
  = new ThreadLocalWithUserContext(2);
new Thread(firstUser).start();
new Thread(secondUser).start();
```
代码运行的结果如下，发现 ThreadLocal 确实是对应不同线程存入不同的变量，且变量之间未相互影响。
```java
thread context for given userId: 1 is: Context{userNameSecret='18a78f8e-24d2-4abf-91d6-79eaa198123f'}
thread context for given userId: 2 is: Context{userNameSecret='e19f6a0a-253e-423e-8b2b-bca1f471ae5c'}
```
## ThreadLocal 源码解析

### 存储结构 ThreadLocalMap

既然 ThreadLocal 是用来存储数据的，就先看下其存储的方法 set()，发现似乎 value 值是存储在 ThreadLocalMap 类型的对象中的，而 ThreadLocalMap 是 ThreadLocal 的内部静态类，那么看起来 ThreadLocalMap 应该是类似 HashMap 结构的容器：
```java
public void set(T value) {
    Thread t = Thread.currentThread();
    ThreadLocalMap map = getMap(t);
    if (map != null)
        map.set(this, value);
    else
        createMap(t, value);
}
```
#### 类结构

观察 ThreadLocalMap 类结构发现其中有 Entry 类，以及以 Entry 为元素的数组 table 。
在看源码之前有一点要注意， ThreadLocalMap 作为成员变量出现在 Thread 类中，说明每个线程都拥有一个独立的 ThreadLocalMap 实例，这符合 ThreadLocal 存储的数据线程隔离的特点下面可以一步一步开始解析源码。

![threadlocalmap结构](http://meneltarma-pictures.nos-eastchina1.126.net/javalang/ThreadLocal/threadlocalmap-hierarchy.png)
<center>图1 threadlocalmap结构图</center>

看到 Entry 很容易让人想到 java.util.Map 的各种实现类中的 Entry，不过这里的 ThreadLocalMap 与 HashMap 等实现方式不同，ThreadLocalMap 并没有借助 java.util.Map 接口来实现，而是自己实现了一套 map 操作的逻辑。Entry 类中将 ThreadLocal 作为 key，value 为实际要存储的值，不过查看代码可以发现 Entry 继承了 WeakReference ，且在构造方法中对 key 调用了 super(k) ，所以其实 key 并不是 ThreadLocal 对象本身，而是 ThreadLocal 的 WeakReference ，至于为什么我们暂且按下不表，下文接着讨论。
```java
static class Entry extends WeakReference<java.lang.ThreadLocal<?>> {
    // 往ThreadLocal里实际塞入的值
    Object value;

    Entry(java.lang.ThreadLocal<?> k, Object v) {
        super(k);
        value = v;
    }
}
```
#### 成员变量与方法
```java
/**
 * 初始化容量，必须是2的幂
 */
private static final int INITIAL_CAPACITY = 16;

/**
 * 存放 Entry 的表，必要的时候可伸缩
 * table 的长度也必须是2的幂
 */
private Entry[] table;

/**
 * table 表的元素的个数
 */
private int size = 0;

/**
 * 需要重新设置 table 大小的阈值，默认为0
 */
private int threshold;
```
以上定义了一些与存储具体 Entry 的 table 相关的变量，Entry 以数组形式存放于 table 表中，table 表的长度必须是2的幂，table 扩容的阈值 threshold。有个问题为什么 table 的长度必须是2的幂？？？ 接着看：
```java
/**
 * 设置扩容需要维持的负载因子不能超过原来表长度的2/3
 */
private void setThreshold(int len) {
    threshold = len * 2 / 3;
}

/**
 * 长度为len的table中，i之后的下一个索引，正常情况下为i+1
 * 如果i的索引时数组的最后一个有效索引，那么其下一个索引为0
 * 意思就是将 table 当成环形数组
 */
private static int nextIndex(int i, int len) {
    return ((i + 1 < len) ? i + 1 : 0);
}

/**
 * i的上一个索引
 */
private static int prevIndex(int i, int len) {
    return ((i - 1 >= 0) ? i - 1 : len - 1);
}
```
这里说明为什么索引的遍历将 table 当成环形数组。因为在 HashMap 中采用数组加链表的二维形式存储数据，所以遇到hash冲突可以直接添加节点，而在此，遇到hash冲突的时候，只有一个一维 table 表，所以势必要移动到某一个合适的空位存储，所以为了避免数组越界，必须将其作为环形数组处理。实际上这种方式

根据以上分析大致可以得知 ThreadLocalMap 存储结构如下如所示：

![threadlocalmap-model](http://meneltarma-pictures.nos-eastchina1.126.net/javalang/ThreadLocal/threadlocalmap-model.png)

实线表示的 StrongReference ，虚线表示的是 WeakReference。ThreadLocalMap 包含一个 Entry 环形数组 table ，数组中元素 Entry 的逻辑上的 key为某个 ThreadLocal 对象（实际上是指向该 ThreadLocal 对象的 WeakReference），value 为代码中该线程往该 ThreadLoacl 变量实际 set 的值。

#### 为什么在 Entry 中使用 WeakReference

到此我们已经有足够的知识积累，用来解释为什么使用 WeakReference ，写这篇文章之前我在网上看了多几篇讲 ThreadLocal 的文章，有些作者认为 WeakReference 这是整个 ThreadLocal 中的精髓，我也赞同这个看法，乍一看可能觉得多此一举，直接用 ThreadLocal 作为 key 保存数据好像也没什么问题，其实大有不同。幸亏我之前稍微熟悉了一下 [java中的Reference类型](https://www.numenor.cn/javalang/2017/09/04/reference.html) 其中总结 WeakReference 一句话：如果一个对象没有 StrongReference 但有存在一个 WeakReference ，那么 gc 将会在下一次运行时对其进行回收，哪怕虚拟机的内存还足够多。什么意思，就是说之所以 Entry 继承 WeakReference 是提醒 jvm 对 ThreadLocal 进行回收。那为什么要这么做？如果 Entry 对作为 key 的 ThreadLocal 进行 StrongReference 会出现什么情况？少废话，看图就能明白：

![ThreadLocal 的数据存储结构](http://meneltarma-pictures.nos-eastchina1.126.net/javalang/ThreadLocal/threadlocal-memory-model.png)

上图表示的某个线程执行过程中虚拟机堆栈与 ThreadLocal 有关的示意图。 thread 指向堆中的 threadObj 实例， threadObj 实例包含 ThreadLocalMap  threadLocals ， threadLocals 中某个 Entry 中 key 为对 threadlocalObj 的 WeakReference ，Value 为存储的值，ThreadLocal<?> ref1 引用指向 threadlocalObj 实例。于是图中 threadlocalObj 实例便有两个引用，一个是来自栈中 ThreadLocal ref1 的 StrongReference ， 另一个是 threadLocals 中某个 Entry 的 key ref2 的 WeakReference。

用java代码表示如下：
```java
ThreadLocal<?> ref1 = new Threadlocal<?>();
WeakReference<ThreadLocal<?>> ref2 = ref1;
```
为了说明使用 WeakReference 的原因，这里假设将图中弱引用的虚线也改为实线，即，线程中的 ThreadLocal ref 引用和 ThreadLocalMap 中 Entry 的 key 的引用都为 StrongReference：
```java
ThreadLocal<?> ref1 = new Threadlocal<?>();
ThreadLocal<?> ref2 = ref1;
```
结构如下图：

![ThreadLocal 的数据存储结构 2 strong ](http://meneltarma-pictures.nos-eastchina1.126.net/javalang/ThreadLocal/threadlocal-memory-model-2strong.png)

现在如果在线程中对于 threadlocalObj 使用完毕，需要对其进行回收，通过以下方式通知jvm进行gc回收：
```java
ThreadLocal<?> ref1 = null;
```
![ThreadLocal 的数据存储结构 1 strong ](http://meneltarma-pictures.nos-eastchina1.126.net/javalang/ThreadLocal/threadlocal-memory-model-1strong.png)

然而，结果并没有如愿，虽然用户将 ref1 置为 null ，可是 threadlocalObj 还存在另一条来自 threadLocals 对应 Entry key ref2 的 StrongReference , 根据jvm回收内存的对象可达性判断，只要对象存在 StrongReference ，对象就不会被回收，所以用户以为此操作后 threadlocalObj 必然被回收，可是事实却事与愿违。这就导致了这个严重的问题，内存溢出，而且长此以往 threadLocals 只增不减，越积越多，问题相当严重啊！！！ 不过突然又有个想法既然如此能不能把另一个 ref2 也置为 null ，这样 threadlocalObj 就变成不可达对象不就可以回收了吗？这话完全正确，可是 ref2 哪里会知道它什么时候该置为 null ，毕竟操作 ref1 = null 的时候并没通知它啊？这问题该怎么解决呢，难道在需要开发一个通知机制在 ThreadLocal 置 null 的时候通知 ThreadLocalMap 删除对应的 Entry ? 其实也不是不可以，只不过jdk已经实现一种不需要额外开发也能达到同样通知效果的机制，那就是采用 WeakReference 。

在 WeakReference 引用情况下，做如下操作：
```java
ThreadLocal<?> ref1 = null;
```
结果如图所示：

![ThreadLocal 的数据存储结构 1 weak ](http://meneltarma-pictures.nos-eastchina1.126.net/javalang/ThreadLocal/threadlocal-memory-model-1weak.png)

此时用户将 ref1 置为 null ， WeakReference 与此前一样只剩下一个来自 threadLocals 对应 Entry key ref2 的引用，只不过这个时候并不是 StrongReference 而是 WeakReference , 回想 WeakReference 特点，WeakReference 引用的对象将在下一次 gc 的时候回收。换句话说，这边程序表示 threadlocalObj 这个对象我不用了，那边虚拟机立马检测到 threadlocalObj 对象只剩下一个 WeakReference 引用，于是自动在下次 gc 的时候回收对象。

所以采用之所以用 WeakReference ，实际上是为了使 threadlocalObj 对象不再使用时，虚拟机能够自动回收此对象而不必通过其他显式操作达到这个目的。实际上这也为配合之后 ThreadLocalMap 自己的垃圾清除机制提供了基础，仅仅依靠 WeakReference 只能将对应 Entry 的 key 回收，value 以及整个 Entry 的回收还需在 ThreadLocalMap 中实现。到这里应该能明白使用 WeakReference 的深层原因了。

#### 构造方法
接着看代码：
```java
/**
 * 构造一个包含初始 Entry (firstKey, firstValue) 的新 map
 * ThreadLocalMaps 才用懒加载方式，只有在第一次需要存储的时候
 * 才进行对象的创建
 */
ThreadLocalMap(ThreadLocal<?> firstKey, Object firstValue) {
    //table 的初始赋值
    table = new Entry[INITIAL_CAPACITY];
    // table 索引的计算，firstKey 的 threadLocalHashCode 进行 table 初始大小的取模运算（用上了环形的特点）
    int i = firstKey.threadLocalHashCode & (INITIAL_CAPACITY - 1);
    // 新建对应 Entry 对象，并放入 table 的第 i 个位置
    table[i] = new Entry(firstKey, firstValue);
    // 设置 table 元素个数为 1
    size = 1;
    // 设置扩容阈值
    setThreshold(INITIAL_CAPACITY);
}
```
#### hashcode

```java
int i = firstKey.threadLocalHashCode & (INITIAL_CAPACITY - 1);
```
这里用到的 threadLocalHashCode 是 ThreadLocal 有关， ThreadLocal 首先是三个成员变量与一个 nextHashCode() 方法。可以看到所有的变量名和方法名都含有“hash”这个关键字，既然 ThreadLocal 是用来存储数据的，很容易想到这三个变量与一个方法肯定与存储的位置生成的hashcode有关。
```java
private final int threadLocalHashCode = nextHashCode();

private static AtomicInteger nextHashCode =  new AtomicInteger();

private static final int HASH_INCREMENT = 0x61c88647;

private static int nextHashCode() {
    return nextHashCode.getAndAdd(HASH_INCREMENT);
}
```
可以看到 ThreadLocal 中的 threadLocalHashCode 是 final 类型的，ThreadLocal 对象在创建的时候就会自动生成，由 nextHashCode 当前值加上 HASH_INCREMENT 得到。这里又有一个疑问，为什么 HASH_INCREMENT 不是别的什么数，偏偏是 0x61c88647 呢？参考文献[5]中有有具体说明其观点，里面讲了一大堆与黄金分割和斐波那契 hash 有关的东西，加上有些人通过做实验，反正最后结果就是对于长度为 2 次幂的 table 采用 0x61c88647 这个数字参与为每个存入 ThreadLocalMap 的对象进行 hash 时得到的结果非常均匀，这有利于减少散列冲突。

对于 & (INITIAL_CAPACITY - 1) 操作，它是对 INITIAL_CAPACITY 取模的位运算算法，由于是位运算比直接 % 取模运算效率高。

基于以上两点事实，所以规定了 table 的长度必须为2的幂。

#### Entry 状态

![threadlocalmap结构2](http://meneltarma-pictures.nos-eastchina1.126.net/javalang/ThreadLocal/threadlocalmap-model2.png)
<center>threadlocalmap结构图</center>

图中名词解释：
1. slot ：table 表中某个索引对应的位置（存放一个 entry）；
2. Full slot = Full entry ：表示 table 中某个索引存放了一个 entry ，并且该 entry 的 WeakReference key 不为null ，且指向某个 threadlocalObj；
3. Stale slot = Stale entry ： 字面意思为陈旧的 entry， 表示 table 中某个索引存放了一个陈旧的 entry ， 并且该 entry 的 WeakReference key 为 null。既然是“陈旧”的 entry ， 自然就是无效的需要清理的 entry；
4. null slot ：表示 table 中某个索引位置为 null 不指向任何 entry ， 可用于设置新的 entry；
5. run ： table 中两个连续两个 null slot 之间的序列

####  get

首先看一下 getEntry, 此方法会被 ThreadLocal 对象 key 的 get() 方法调用，用于获取 map 中 key 对应存放的值。
```java
/**
 * 获取与此 key 对应的 entry。这个方法本身值处理快速路径：
 * 也就是假设 key 对应在 table 中的 entry 有效且直接获取返回
 * 否则交由另一个方法 getEntryAfterMiss 去处理其他情况。
 * 这个设计将直接命中 entry 的效率最大化。
 */
private Entry getEntry(ThreadLocal<?> key) {
    int i = key.threadLocalHashCode & (table.length - 1);
    Entry e = table[i];
    if (e != null && e.get() == key)
        return e;
    else
        return getEntryAfterMiss(key, i, e);
}

/**
 * key 没有直接命中 hash slot 时的 getEntry 方法
 */
private Entry getEntryAfterMiss(ThreadLocal<?> key, int i, Entry e) {
    Entry[] tab = table;
    int len = tab.length;
    // e 不为 null 的时候不断检测下一个可能的索引，否则返回 null
    while (e != null) {
        ThreadLocal<?> k = e.get();
        // 成功找到 key 对应的 k
        if (k == key)
            return e;
        // 如果 k 已经为 null，说明此 entry 为 staleEntry 需要被清理
        if (k == null)
            // 清理过期的 entry，这里先略过，在看完 set 之后再解析
            expungeStaleEntry(i);
        else
            // 寻找下一个可能的索引
            // 由于 nextIndex 步长为 1 ，所以这里消除 hash 冲突 采用的是线性探测法
            i = nextIndex(i, len);
        e = tab[i];
    }
    return null;
}
```
get 过程首先使用快速类似乐观锁的方法尝试命中 entry 以提高效率，如果没有命中，则以线性探测的方式寻找，找到同一个 key 则返回对应 entry ， 未找到则返回 null ，并且在寻找的同时，顺便调用 expungeStaleEntry 方法清理过期的 stale entry。

#### set
```java
/**
 * 很简单，即保存一个 key-value 对
 *
 * @param key threadlocal 对象
 * @param value 需要保存的值
 */
private void set(ThreadLocal<?> key, Object value) {

    // We don't use a fast path as with get() because it is at
    // least as common to use set() to create new entries as
    // it is to replace existing ones, in which case, a fast
    // path would fail more often than not.

    // set() 中并没有像 get() 一样一上来就尝试直接命中 Entry 的快速路径
    // 因为在 set() 中直接替代原有的老 Entry 与直接 new 新的 Entry
    // 出现的频率至少是一样多的，在这种情况下，采用快速路径反而失败比成功
    // 更频繁，并没有什么优势
    Entry[] tab = table;
    int len = tab.length;
    // 计算需要 set 的 key 的 hashcode 作为索引
    int i = key.threadLocalHashCode & (len-1);

    // 线性探测不为 null 的 entry，步长为 1
    for (Entry e = tab[i];
         e != null;
         e = tab[i = nextIndex(i, len)]) {
        // 获取 entry 的 key
        ThreadLocal<?> k = e.get();
        // 如果探测到同一个 key，这是一个 full entry
        if (k == key) {
            // 则将新的 value 赋值给 entry
            e.value = value;
            return;
        }
        // 如果 key 为 null ，说明这是一个 stale entry 需要被清理或者被代替
        if (k == null) {
            // 用新的值替换原来的 stale entry
            replaceStaleEntry(key, value, i);
            return;
        }
    }
    // 如果线性首先探测到 null slot，则直接新建一个 entry，放入这个 slot 中
    tab[i] = new Entry(key, value);
    // 表中元素个数增加
    int sz = ++size;
    //元素如果增加需要检测是否需要 rehash() 可能需要扩容
    // cleanSomeSlots 返回是否有节点被清楚，所以 rehash() 成立的需要同时满足两个条件：
    // 1. table 中有没节点删除；2. 元素个数超过阈值
    if (!cleanSomeSlots(i, sz) && sz >= threshold)
        rehash();
}
```
set() 中 replaceStaleEntry 和 cleanSomeSlots 方法最终调用了 expungeStaleEntry 方法，可以说 expungeStaleEntry 是 map 清理的核心算法：
```java
/**
 * 首先清理 staleSlot 位置的过期 entry，然后开始扫描从 staleSlot 一直到下一个
 * null slot 之间所有位置，因为有位置空出来，这里多做了一步操作就是 rehash 这些位置中的有效 entry
 * 使他们尽量连续排雷并靠近他们的 hashcode 所在位置，而将所有 null slot 也往后排在一起。
 *
 * @param staleSlot index of slot known to have null key
 * @return the index of the next null slot after staleSlot
 * (all between staleSlot and this slot will have been checked
 * for expunging).
 */
private int expungeStaleEntry(int staleSlot) {
    Entry[] tab = table;
    int len = tab.length;

    // expunge entry at staleSlot
    // 首先清理 staleslot 位置的 entry，处理之后 staleslot 变为 null slot
    // 将 entry 的 value 置为 null ， 帮助 gc 回收
    tab[staleSlot].value = null;
    // 将 entry 置为 null ，帮助 gc 回收
    tab[staleSlot] = null;
    // table 元数减少
    size--;

    // Rehash until we encounter null
    // 从 staleslot 的下一个位置开始遍历直到遇到 null slot
    Entry e;
    int i;
    for (i = nextIndex(staleSlot, len);
         (e = tab[i]) != null;
         i = nextIndex(i, len)) {
        // entry 不为 null
        ThreadLocal<?> k = e.get();
        // entry 为 stale entry ，则清除 entry 使之成为 null slot
        if (k == null) {
            e.value = null;
            tab[i] = null;
            size--;
        // entry 为有效的 full entry，则 rehash
        } else
            // 计算 hashcode
            int h = k.threadLocalHashCode & (len - 1);
            // 如果 entry 原本就在其对应 hashcode 所在的位置，则不做操作，完美！
            // 如果 entry 所在的位置与其对应 h 不一致，则说明此 entry 在 set 的时候
            // 就遇到了 hash 冲突，而通过线性探测放到了其他位置，而这个时候因为清除
            // 过期 entry 可能有 null slot 空出来，所以重新安排其位置
            if (h != i) {
                // 将指向当前 entry 的 tab[i] 置为 null
                tab[i] = null;

                // Unlike Knuth 6.4 Algorithm R, we must scan until
                // null because multiple entries could have been stale.
                // 与 Knuth 《计算机程序设计艺术》6.4 的 R 算法不同，R 算法是关于在散列表中删除一个
                // 元素算法，简要过程如下：在一个一维开放散列表中，假如 i 索引的元素为 null ，则从 i
                // 开始反向寻找第一个不为 null 的元素如果还要判断其 hashcode 是否满足相关条件在决定
                // 是否将其与 i 索引位置的 null 元素交换。原则就是尽量将所有不为 null 元素从散列表头
                // 开始连续排列，将 null 元素在散列表尾连续排列。对 R 算法有兴趣，可以自行搜索相关文献。

                // 本算法由于散列表中过期需要置为 null 元素可能不止一个，所以如果完全按 R 算法执行会
                // 出现相同 hashcode 的 entry 之间出现 null slot 这是不允许的，因为 ThreadLoacl 中
                // 所有线性探测都是步长为 1 的，也就是稳定状态的 threadlocalmap 只有具有不同的 hashcode
                // 的 entry 之间才有可能出现 null slot ，其他临时状态只要相同的 hashcode 的 entry 之
                // 间出现  stale entry 马上就会被清理，然后被其他 rehash 之后的 entry 填满

                // 从原始 h 索引开始寻找下一个可以放置当前 entry 的索引
                while (tab[h] != null)
                    h = nextIndex(h, len);
                // 找到之后将 e 赋值给 tab[h]
                // 个人觉得 if 代码块可以换一种写法，因为这里寻找合适的 null slot 是从
                // h 开始，如果原始 h 和 i 之间没有 stale entry 都是有效的，那么其实结果
                // 就是将 entry 又放回原处，所以我觉得可以这么写：
                //   while (tab[h] != null)
                //       h = nextIndex(h, len);
                //   if(h != i){
                //       tab[i] = null;
                //       tab[h] = e;
                //   }
                // 这样当过期的 entry 很少的时候每次 h == i 的时候回减少两次引用赋值，不过效果还得看实践
                // -------------------------------------------------------------
                // 半小时后，我发现我的这种想法是错误的，原因如下：
                // 1.假设原本具有相同 h 的元素个数 n >=2 ，则 staleslot 清空之后，另外 n-1 个元素必然要各
                //   自向前移动一位，所以不存在 h == i 的情况
                // 2.假设原本具有相同 h 的元素个数 n =1 ，则 staleslot 清空之后，没有其他元素需要 handle
                // -----------------------------------------------------------
                // 再仔细一思考，发现这个想法并没有错误，举例说明
                //
                // h = staleSlot = hash(A1)=hash(A2)=hash(A3)=hash(A4)
                // h+5 = hash(B1)=hash(B2)=hash(B3)=hash(B4)=hash(B5)
                //
                // CASE 1 : 两组不同 hashcode 不连续，之间有 null slot 间隔
                //
                // staleSlot
                //     h     h+1   h+2   h+3    h+4    h+5   h+6   h+7   h+8   h+9
                //    [A1]  [A2]  [A3]  [A4]   [null]  [B1]  [B2]  [B3]  [B4]  [B5]
                //                                  |                                  步骤1：清理
                //  [null]  [A2]  [A3]  [A4]   [null]  [B1]  [B2]  [B3]  [B4]  [B5]
                //         /     /     /            |                                  步骤2：Rehash
                //    [A2]  [A3]  [A4]  [null] [null]  [B1]  [B2]  [B3]  [B4]  [B5]
                //
                //  CASE 1 中，清理从 h 开始到 h+3 结束，对其中元素而言 h 永远不等于 i ，所以清理 A1 之后，
                // 只有的每个元素都需要移动。B1-B5 元素没有被扫描到。

                //  CASE 2 : 两组不同 hashcode 连续，之间没有 null slot 间隔
                //
                //  staleSlot
                //     h     h+1   h+2   h+3   h+4    h+5   h+6   h+7   h+8   h+9
                //    [A1]  [A2]  [A3]  [A4]  [A5]    [B1]  [B2]  [B3]  [B4]  [B5]
                //                                                                     步骤1：清理
                //  [null]  [A2]  [A3]  [A4]  [A5]    [B1]  [B2]  [B3]  [B4]  [B5]
                //         /     /     /    /          |     |     |     |     |       步骤2：Rehash
                //    [A2]  [A3]  [A4]  [A5]  [null]  [B1]  [B2]  [B3]  [B4]  [B5]
                //
                //  CASE 2 中，清理从 h 一直到 h+9 结束，除了 A2-A5 需要移动，B1-B5 虽然被处理了，但本质上
                //  没有改变位置，所以的确是由两次无效的引用操作！
                // --------------------------------
                //
                tab[h] = e;
            }
        }
    }
    // 返回staleSlot之后第一个 null slot 索引
    return i;
}
```
expungeStaleEntry 方法有人称之为“连续段清理”，比较贴切，它从 staleSlot 索引开始遍历直到出现一个 null slot ，这的确是一个没有 null slot 的连续段， 将这一段索引中所有 stale entry 清空，并将所有 full entry rehash 重新从它的 hashcode 进行线性探测 set 到新位置（当然如果参与 rehash 的当前 entry 对应的所有元素都是 full entry ，则这些 entry 还是会放回原来的位置）。

下面接着看 cleanSomeSlots：
```java
/**
 * 采用探索方式寻找 stale entry。当有新元素加入或者 stale entry 被清理时
 * 被调用。会进行 log(n) 次扫描，之所以选择扫描这么多次是因为，如果不进行
 * 扫描（虽然速度很快，但是处理得不干净，很可能有垃圾遗留），如果扫描固定比
 * 例的元素会清理所有垃圾，但是会有一些插入操作，最坏情况时间复杂度会达到 O(n)。
 * 参数 n 可根据实际情况进行调节，目前这个版本效果很不错，既简单又快速。
 * @param i a position known NOT to hold a stale entry. The
 * scan starts at the element after i.
 *
 * @param n scan control: {@code log2(n)} cells are scanned,
 * unless a stale entry is found, in which case
 * {@code log2(table.length)-1} additional cells are scanned.
 * When called from insertions, this parameter is the number
 * of elements, but when from replaceStaleEntry, it is the
 * table length. (Note: all this could be changed to be either
 * more or less aggressive by weighting n instead of just
 * using straight log n. But this version is simple, fast, and
 * seems to work well.)
 *
 * @return true if any stale entries have been removed.
 */
private boolean cleanSomeSlots(int i, int n) {
    boolean removed = false;
    Entry[] tab = table;
    int len = tab.length;
    // 从索引 i 开始，循环 log(n) 次线性探测，每次遇到 stale entry 就
    // 调用 expungeStaleEntry 方法进行清理
    do {
        // 获取下一个索引
        i = nextIndex(i, len);
        Entry e = tab[i];
        // 如果是 stale entry
        if (e != null && e.get() == null) {
            // 多扫描 log2(table.length)-1 次
            n = len;
            // 只要有 entry 被清除，removed 便为 true
            removed = true;
            // 调用 expungeStaleEntry ，从 i 开始进行连续段清除
            i = expungeStaleEntry(i);
        }
    } while ( (n >>>= 1) != 0);
    // 返回是否有 entry 被清除
    return removed;
}
```
cleanSomeSlots 方法比较简单，采用探索式的思想，人为选择从某索引开始 log2(n) 扫描次数进行全局清理，如果过程中真遇到需要清理的过期 stale entry，扫描次数会额外增加 log2(table.length)-1 次。

然后再看一下最后一个与 set 有关的方法 replaceStaleEntry：
```java
/**
 * 在 set 操作的过程中对给定的 key 将原来的 stale entry 替换为新的 full entry 。
 * 不管入参中的 key 对应的 entry 原本是否存在，都会将新的 value 存入新的 full entry 中。
 *
 * 这个方法的副作用是，它会将这个 “run” 中所有的过期 stale entry 都清除。（run 表示两个连
 * 续 null slot 之间的所有元素包括 full entry 和 stale entry）
 *
 * @param  key the key
 * @param  value the value to be associated with key
 * @param  staleSlot index of the first stale entry encountered while
 *         searching for key.
 */
private void replaceStaleEntry(ThreadLocal<?> key, Object value,
                               int staleSlot) {
    Entry[] tab = table;
    int len = tab.length;
    Entry e;

    // Back up to check for prior stale entry in current run.
    // We clean out whole runs at a time to avoid continual
    // incremental rehashing due to garbage collector freeing
    // up refs in bunches (i.e., whenever the collector runs).
    // 索引反向遍历来检查当前 run 中在 staleSlot 之前的 stale entry。
    // 这里会一次性清理整个 run ， 这么做是为了避免由于垃圾回收释放成群
    // 的 key 可能导致增量 rehash 的频繁发生
    // 当前清理其实位置 slotToExpunge = staleSlot
    int slotToExpunge = staleSlot;
    // 从 staleSlot 反向探测
    for (int i = prevIndex(staleSlot, len);
         (e = tab[i]) != null;
         i = prevIndex(i, len))
        // 如果 e 为 stale entry （也就是 key 为 null ）
        if (e.get() == null)
            // 则更新清理开始的位置为 i
            slotToExpunge = i;

    // Find either the key or trailing null slot of run, whichever
    // occurs first
    // 正向遍历，直到找到 key 或者这个 run 尾部的 null slot
    for (int i = nextIndex(staleSlot, len);
         (e = tab[i]) != null;
         i = nextIndex(i, len)) {
        // 获取当前位置 entry 的 k
        ThreadLocal<?> k = e.get();

        // If we find key, then we need to swap it
        // with the stale entry to maintain hash table order.
        // The newly stale slot, or any other stale slot
        // encountered above it, can then be sent to expungeStaleEntry
        // to remove or rehash all of the other entries in run.
        // 如果找到 key ，则首先更新 entry 的 value 然后将当前 entry 与
        // stale entry 交换来保持 table 排序。实质就是将过期的 entry 都
        // 往后排，方便清理
        // 之后从这个 run 中清理位置 slotToExpunge 开始进行一次连续段清理
        // 和探索式清理
        if (k == key) {
            // 如果找到 key ，首先更新 entry 的新值 value
            e.value = value;

            // 交换当前 entry 和 stale entry
            // 将 stale entry set 到 tab[i]
            tab[i] = tab[staleSlot];
            // 将当前 entry e set 到 staleSlot 位置
            tab[staleSlot] = e;

            // Start expunge at preceding stale entry if it exists
            // 如果 slotToExpunge == staleSlot，也就是说这个 run 中
            // 从第一个非 null slot 开始一直到 i 都没有 stale slot
            if (slotToExpunge == staleSlot)
                // 则从索引 i 开始清理（因为当前 entry 与 stale entry 交换过
                // ，所以 i 位置的 stale entry 是这个 run 中第一个需要清理的位置）
                slotToExpunge = i;
            // 确定 run 清理开始我位置之后，调用一次连续段清理和探索式清理
            cleanSomeSlots(expungeStaleEntry(slotToExpunge), len);
            return;
        }

        // If we didn't find stale entry on backward scan, the
        // first stale entry seen while scanning for key is the
        // first still present in the run.
        // 如果反向搜索没有找的需要清理的 stale entry(也就是 slotToExpunge 没有改变
        // 还是等于 staleSlot)，则在正向探测过程中遇到的第一个 stale entry 就是这个
        // run 中的第一个 stale entry，也是清理开始的索引: 当前 i
        if (k == null && slotToExpunge == staleSlot)
            slotToExpunge = i;
    }

    // If key not found, put new entry in stale slot
    // 如果在正向探测过程中没有找到 key，就新建一个 entry 放入 stale slot
    // 首先将 stale entry 的 value 置为 null，帮助 gc 回收
    tab[staleSlot].value = null;
    // 创建一个新的 entry 放入 stale slot
    tab[staleSlot] = new Entry(key, value);

    // If there are any other stale entries in run, expunge them
    // 如果方法中两个方向的探测至少一个 stale entry ，则 slotToExpunge 一定会更新为
    // run 中第一个  stale entry 的位置，那么就调用一次连续段清理和探索式清理；
    if (slotToExpunge != staleSlot)
        cleanSomeSlots(expungeStaleEntry(slotToExpunge), len);
    // 如果整个过程中没有任何 stale entry ，也就是 slotToExpunge == staleSlot ，而
    // 此时 staleSlot 位置已经被赋予新的 full entry ，所以整个 run 中没有  stale entry
    // 不需要清理
}
```
replaceStaleEntry 方法做了两件事情：
1.从 staleSlot 开始线性探测如果 tab 的其他位置原本就存在 key 对应的 entry ， 则首先更新 entry ，再将这个 entry 与需要替换的 staleSlot 位置的 stle entry 交换位置；如果探测直到出现第一个 null slot 都没有找到对应的 key ，那么就直接创建一个新的 entry set 到 staleSlot 位置。这一步真正完成了 replace 操作。
2.与此同时顺便进行一波 stale entry 的清除：以 staleSlot 位置为参照点，进行两个方向的线性探测，确定 staleSlot 所处的 run 中的第一个 stale entry 所在的位置（staleSlot 位置除外，因为无论如何它被 replace 之后都是有效的 full slot），假如 run 中没有其他 stale entry 则算法结束，否则先进行一次连续段清除，再进行一次探索式（Heuristical）清除。

由于 set 操作之后可能涉及到 tab 元素的增加，如果元素个数超过阈值需要调用  rehash ：
```java
/**
 * Re-pack and/or re-size the table. First scan the entire
 * table removing stale entries. If this doesn't sufficiently
 * shrink the size of the table, double the table size.
 *
 * table 表所有元素重新执行散列过程。首先扫描全表，调用 expungeStaleEntries()
 * 删除表中所有 stale entry，如果此操作之后没有将 tab 表元素个数缩减到一定范围
 * 内，则调用 resize() 进行扩容.
 */
private void rehash() {
    expungeStaleEntries();

    // Use lower threshold for doubling to avoid hysteresis
    // 使用更低的扩容阈值 3/4 threshold = 1/2 length，目的是避免滞后（不是很理解什么意思？？）
    if (size >= threshold - threshold / 4)
        resize();
}

/**
 * Expunge all stale entries in the table.
 * 遍历整个 tab ，清理 tab 中所有 stale entry
 */
private void expungeStaleEntries() {
    Entry[] tab = table;
    int len = tab.length;
    for (int j = 0; j < len; j++) {
        Entry e = tab[j];
        if (e != null && e.get() == null)
            expungeStaleEntry(j);
    }
}

/**
 * Double the capacity of the table.
 * 将 tab 表的长度加倍（注意原来 table 长度是 2 次幂，double 之后还是 2 次幂）
 */
private void resize() {
    Entry[] oldTab = table;
    // 原来的长度
    int oldLen = oldTab.length;
    // 新的长度
    int newLen = oldLen * 2;
    // 创建新的 tab 表
    Entry[] newTab = new Entry[newLen];
    int count = 0;

    // 遍历老表
    for (int j = 0; j < oldLen; ++j) {
        Entry e = oldTab[j];
        // 如果不是 null slot
        if (e != null) {
            ThreadLocal<?> k = e.get();
            // 且是 stale slot
            if (k == null) {
                // 将 entry 的 value 也置为 null ，
                // 帮助 gc 回收
                e.value = null; // Help the GC
            } else {
            // 如果是 full slot ，就在新表中进行线性探测将 entry 转移到新表
                int h = k.threadLocalHashCode & (newLen - 1);
                while (newTab[h] != null)
                    h = nextIndex(h, newLen);
                newTab[h] = e;
                // 新表中 full entry 的数量
                count++;
            }
        }
    }
    // 设置新表的阈值
    setThreshold(newLen);
    // 设置新表的元素数量
    size = count;
    // 新表替换旧表
    table = newTab;
}
```
至此，set 涉及到的所有操作都已经捋了一遍，描述一下：
1. 首先计算 key 对应的 hashcode h ，从 h 开始线性探测，如果在第一次遇到 stale slot 或 null slot 之前找到 key 对应的 full entry ，则直接 set value；
2. 如果 h 开始的线性探测过程中，在第一次遇到 null slot 之前发现 stale entry，则调用 replaceStaleEntry：
   -  从 stale slot 开始线性探测，如果在第一次遇到 null slot 之前找到 key 对应的 full entry ，那么先更新 full entry 的 value ，然后将 stale entry 与 full entry 交换；
   -  从 stale slot 开始线性探测，如果在第一次遇到 null slot 之前未找到 key ，则在 stale slot 位置直接创建一个 key 对应的新的 full entry ；
   步骤2结束钱都会对 stale slot 所在 run 做一次连续段清理和探索式清理。
3. 如果 h 开始的线性探测过程中，在第一次遇到 null slot 之前没有探测到 stale entry ，且没有探测到 key 对应的 full entry ， 则在这些连续 full entry 之后紧跟的 null slot 位置直接创建一个 key 对应的新的 full entry。
4. set entry 的操作完成以后，如果发现 tab 的元素没有减少即没有 stale entry 被清理，且 tab 元素个数 size 超过阈值即 tab 的长度 length 的2/3，则调用一次 rehash() ，rehash() 会针对 tab 的每个索引做一次连续段清理，清理之后如果 tab 的元素个数 size 超过 3/4 阈值即 tab 长度的一半，则 tab 扩容为原来的两倍。

最后还剩下 remove 方法：
```java
/**
 * Remove the entry for key.
 * 删除 tab 中 key 对应的 entry
 */
private void remove(ThreadLocal<?> key) {
    Entry[] tab = table;
    int len = tab.length;
    int i = key.threadLocalHashCode & (len-1);
    for (Entry e = tab[i];
         e != null;
         e = tab[i = nextIndex(i, len)]) {
        if (e.get() == key) {
            // ThreadLocalMap.Entry 的 clear 方法继承自 Reference ，clear 之后
            // entry.key 对 threadlocalObj 的 WeakReference 会断开，使得 entry
            // 成为 stale entry ， 所以需要调用 expungeStaleEntry 进行清理
            e.clear();
            expungeStaleEntry(i);
            return;
        }
    }
}
```
按常理如前文解释过的， threadlocalObj 在置为 null 的时候，会自动通知虚拟机它仅剩一个从 entry 指向它的引用，需要在下次 gc 被回收。但在实际应用中还是会出现在某些特殊情况下，程序中 threadlocalObj 没有被置为 null ，导致 entry 没有被回收（所谓的内存泄漏），为了防止这种情况的发生，所以提供了 remove 方法，显式将 WeakReference 断开，帮助 gc 回收，可以说 remove 方法是一个清理 threadlocalmap 的显式保险机制。那么究竟哪些情况会出现这里所说的 threadlocalObj 未被置为 null 呢？接着看！

### 内存泄漏问题
关于 Threadlocal 是否会有内存泄漏的风险，有各种不同的说法，不过既然说到内存泄漏，首先就要定义好什么叫“内存泄漏”，摘录一段wiki中的定义：在计算机科学中，当一个计算机程序由于不正确的内存分配导致的资源泄漏叫内存泄漏。当存储在内存中的对象不能被运行的代码访问时就发生了内存泄漏。内存泄漏与其他一系列问题的症状类似，一般情况下只能由程序员通过进入源代码查看才能诊断。

现在来看几种情况：
1. Threadlocal 对象被会收时，map 中的 key 由于是 WeakReference 也会在下次 gc 被回收，但 entry 的 value 此时并不会被回收，如果 map 不再做任何操作，则导致内存泄漏，因为此时程序已经获取不到这个 value ，大家的分歧就在这里，认为 Threadlocal 会导致内存泄漏的人的观点是 value 此时获取不到，所以内存泄漏。而认为不会有内存泄漏的人观点是，针对这种情况 ThreadLocal 的设计者们的解决办法是，在 set ，get ， remove 的时候调用 expungeStaleEntry 连续段清理对这些 stale entry 进行清理以避免内存泄漏。但这其中有个问题，连续段清理不代表全表清理，全表清理的触发不是百分之百的，需要达到一定的阈值条件；倘若某个大对象 threadlocal 置为 null 之后，线程长期存在，且未再调用任何 set ，get ， remove 方法，则此对象作为 value 就一直不会被释放。了。ThreadLocalMap 的类注释中也写到，只有在 table 的空间快用完时，他才保证一定清理 stale entry ，这个保证是通过 rehash 完成的。所以我个人的结论是，只要不是百分之百的保证，就应该说它是有泄漏内存的风险，无论他最终是否由于调用 set，get，remove 而清除了 stale entry 或者更进一步，触发了全表清除。
2. 在第一种情况下，假如出现了内存泄漏，只要没有使用线程池，线程不会被复用，运行完成后销毁，那么由于 ThreadLocalMap 是 Thread 类的成员，线程销毁 map 自然也会销毁，所以最终不会出现内存溢出。不过假如我们采用了线程池，某些核心线程的生命周期与整个应用绑定在一起，那么很有可能只有在整个应用 shutdown 的情况下，才能消除这种内存泄漏。

所以在使用 ThreadLocal 的时候，强烈建议，在线程利用完当前任务 ThreadLocal 对象完成本次任务之前，调用 remove 方法显式删除 entry ， 这样就能百分之百避免内存泄漏的发生。如果没有显式调用 remove 方法，只能说大概率能保证不会出现内存泄漏，在即便这个概率达到 99.99999....% 也只能说大概率，而不是百分之百。

到这里 ThreadLocalMap 的解读就基本结束了。

# 总结

本文主要对 ThreadLocal 类以源码顺序为逻辑进行了解析，首先通过引入一个线程需要保存自己的变量的问题提出 ThreadLocal 类的必要性，阅读源码过程中发现实际上 ThreadLocalMap 才是 ThreadLocal 核心类，接着对 ThreadLocalMap 的存储结构，谁家思想结合代码进行了层层分析。过程中学习到了两位作者各种精妙的算法设计和高效的代码逻辑，包括对 WeakReference 的使用，为什么 tab 表的长度是 2 次幂，探索式算法，线性探测，数组的环形处理等等，本人阅读之后除了对 ThreadLocal 的源代码融汇贯通之外对于平时自己的工作过程中应该如何思考问题设计算法也受益良多。


# 参考文献

在学习过程中，查阅了大量网络上的各位的文章和文献，其中有些文章地址一时找不到了，在此将能找到的参考文献列出，供参考：

1. [An Introduction to ThreadLocal in Java](https://www.baeldung.com/java-threadlocal)
2. [Java ThreadLocal](http://tutorials.jenkov.com/java-concurrency/threadlocal.html)
3. [A Painless Introduction to Java's ThreadLocal Storage](https://dzone.com/articles/painless-introduction-javas-threadlocal-storage)
4. [ThreadLocal源码解读](https://www.cnblogs.com/micrari/p/6790229.html)
5. [Why 0x61c88647?](https://www.javaspecialists.eu/archive/Issue164.html)
6. [ThreadLocal类原理简析——线程封闭的常规实现](https://www.jianshu.com/p/4e1fcdfb6d54)
