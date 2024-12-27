# Lab6: Copy-on-Write Fork for xv6

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

切换到cow分支
```
$ git fetch
$ git checkout cow
$ make clean
```

## 关于

写时拷贝（Copy-on-write，简称COW）是一种优化策略。

核心思想是，如果有多个调用者同时请求相同资源（如内存或磁盘上的数据存储），他们会共同获取相同的指针指向相同的资源

直到某个调用者试图修改资源的内容时，系统才会真正复制一份专用副本（private copy）给该调用者，而其他调用者所见到的最初的资源仍然保持不变。

## 参考

1. https://blog.csdn.net/LostUnravel/article/details/121418548





