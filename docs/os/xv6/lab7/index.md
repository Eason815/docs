# Lab7: Multithreading

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

切换到thread分支
```
$ git fetch
$ git checkout thread
$ make clean
```

## 关于



## 参考

1. https://blog.csdn.net/LostUnravel/article/details/121430791





