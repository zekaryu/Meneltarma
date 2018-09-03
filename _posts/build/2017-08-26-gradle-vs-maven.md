---
layout: post
title:  "Gradle VS Maven 比较（官方文档翻译）英文水平有限"
date:   2017-08-26 17:46:17 +0800
categories: [build]
---
>以下是对 Gradle 和 Apache Maven 之间主要不同点的总结，
概括为：灵活性，性能，用户体验和依赖管理。文本并不会对此进行长篇大论，你可以查看Gradle 特性列表 和 Gradle与Maven之间的性能比较 获取更多信息。

![compare](http://meneltarma-pictures.nos-eastchina1.126.net/build/%5B1%5DGradle%20VS%20Maven/compare.gif)

## 灵活性

谷歌（Google）选择将 Gradle 作为安卓的官方构建工具；并不是因为构建脚本是代码的缘故，而是因为 Gradle  采用了一种最基本的可扩展方式进行建模。Gradle 的模型还允许它可以用 C/C++ 进行本地开发，叶可以扩展到覆盖任何生态系统。比如，Gradle 使用其 Tooling API 来实现一些嵌入功能。

Gradle 和 Maven 都支持约定优于配置。不过，Maven 提供的模型非常僵化，以至于一些自定义操作冗长重复到令人讨厌，有时候甚至根本不可能完成。虽然这让我们更容易理解任何给定的 Maven 构建，只要你没有特殊需求，这也使得它不适合许多自动化问题。而 Gradle 则是由一个掌握由更多权限，负更多责任的用户来构建的。

## 性能

![performance](http://meneltarma-pictures.nos-eastchina1.126.net/build/%5B1%5DGradle%20VS%20Maven/performance.png)

缩短构建时间是加速打包最直接的方式之一。Gradle 和 Maven 都是使用了某种并行项目构建和并行依赖解析。最大的区别在于 Gradle 的工作避免和增量构建机制。以下三个最重要的特征使得 Gradle 比 Maven 快得多：

增量构建 — Gradle 通过跟踪任务的输入输出来避免不必要的工作，且只在需要的时候运行，当可能的时候只处理那些就改过了的文件。
构建缓存 — 重用其他任意 Gradle 构建的结果，只要输入相同就可以重用，包括不同的机器之间。
守护进程 — 一个长期驻留的后台守护进程，在内存中维护“热”的构建信息数据。
在这个性能比较中，以上以及其他 提升性能的特性 使得 Gradle 几乎在每个场景都比 Maven 快至少一倍（在使用构建缓存进行大型构建时快100倍）。

## 用户体验
![UE](http://meneltarma-pictures.nos-eastchina1.126.net/build/%5B1%5DGradle%20VS%20Maven/User%20Experience.png)

Maven 在历史上使用时间更长，这意味着对于许多用户，它的对IDE的支持更好。Gradle 对IDE的支持在持续不断快速进步。不过，目前 Gradle 提供了一个基于 Kotlin 的领域特征语言（DSL），对于IDE有更好的体验。Gradle 团队正在更IDE开发商合作来使得编辑支持更加好 — 尽请期待 更新。

虽然IDE很重要，不过仍然有非常多的用户更愿意通过命令行界面执行构建操作。Grdle 提供了一个更加现代的CLI，具有像 “gradle task”这样的自动发现特性，也有改进之后的日志功能和命令行补全（command-line completion）功能。

最后，Gradle 为调试和优化构建提供了一个基于web的可交互UI：构建扫描。在允许某个组织收集构建历史信息，做趋势分析，为调试比较构建的差异，以及优化构建时间的前提下，这些都可以被托管。

## 依赖管理

![dependency management](http://meneltarma-pictures.nos-eastchina1.126.net/build/%5B1%5DGradle%20VS%20Maven/dependency%20management.png)

这两个构建系统都提供了内置的基于可配置的仓库的依赖解析能力。也都支持本地依赖缓存和依赖并行下载。

Maven 允许仓库的消费者覆盖依赖，但只能通过写入不同的版本（version）来实现。Gradle 提供自定义的依赖选择和候补规则，只需一次声明，就能在项目范围内处理所有不想要的依赖。这个候补规则使得Gradle可以通过多个源代码工程一起构建来创建复合构建。

Maven 的内置依赖作用域很少，而且对于一些常见的比如测试工具或者代码生成场景，强迫用户使用笨拙的模块结构。比如，它根本就不区分单元测试和集成测试。Gradle 允许自定义依赖作用域，提供更好的模型和更快的构建。

Gradle 允许仓库的生产者声明依赖的API和实现来防止不想要的库泄露到消费者的类路径中。Maven 则允许发布者通过可选依赖提供元数据。
