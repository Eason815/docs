# Lab2: system calls

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

切换到pgtbl分支
```
$ git fetch
$ git checkout pgtbl
$ make clean
```

疑问1
sysproc.c中的函数是如何与其他源文件中的函数定义关联起来

```
int get_nproc();
int get_freemen();
```

这里只有声明       具体是如何将外部源文件定义的内容调入？ 

在xv6操作系统中，函数的定义通常是在其他的源文件中实现的。要将函数定义与其他源文件中的函数关联起来，需要进行以下步骤：

1. 在sysproc.c文件中，包含相关函数的声明所在的头文件。例如，在sysproc.c文件中，包含了defs.h头文件，其中包含了其他源文件中函数的声明。
2. 在Makefile中，将其他源文件编译为目标文件（.o文件）。在提供的`Makefile`中，可以看到sysproc.c所依赖的其他源文件的目标文件列表，例如$K/proc.o、$K/file.o等。
3. 在链接阶段，将sysproc.o与其他目标文件一起链接，生成最终的可执行文件。在提供的Makefile中，可以看到sysproc.o与其他目标文件一起被链接，生成了最终的可执行文件。

通过这些步骤，sysproc.c中的函数定义与其他源文件中的函数声明和定义关联起来，使得其他源文件可以调用sysproc.c中的函数。


```
实验日期
2024-09-23
2024-10-11
```