# Lab5: xv6 lazy page allocation

## 准备工作

同样在每次开启新的一章所要做的事情

若出现runcmd报错(Ubuntu24版本会出错,Ubuntu22版本可忽略):

可在57行插入

```
diff --git a/user/sh.c b/user/sh.c
index 83dd513..c96dab0 100644
--- a/user/sh.c                                                                   // [!code --]
+++ b/user/sh.c                                                                   // [!code ++]
@@ -54,6 +54,7 @@ void panic(char*);
 struct cmd *parsecmd(char*);
 
 // Execute cmd.  Never returns.
 __attribute__((noreturn))                                                        // [!code ++]
 void
 runcmd(struct cmd *cmd)
 {
```

切换到lazy分支
```
$ git fetch
$ git checkout lazy
$ make clean
```

## 关于

内存页懒分配是在程序实际访问到某部分内存时才进行相应物理内存的分配与映射

与传统的操作系统中常见的内存预分配策略不同(sbrk()函数分配内存)

在预分配策略中，操作系统会在程序启动时就将整个虚拟地址空间映射到物理内存中，即使该部分虚拟地址空间尚未被程序使用

内存页懒分配策略的优点：减少不必要的内存占用、提高效率

## 参考

1. https://blog.csdn.net/LostUnravel/article/details/121418421





