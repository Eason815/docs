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


# System call tracing (moderate)

## 在Makefile的UPROGS中添加$U/_trace

```
diff --git a/Makefile b/Makefile
index f0beb51..f07531b 100644
--- a/Makefile
+++ b/Makefile
@@ -149,7 +149,7 @@ UPROGS=\
        $U/_grind\
        $U/_wc\
        $U/_zombie\
-
+       $U/_trace\
 
 
 ifeq ($(LAB),trap)
```

## 系统调用的用户空间存根还不存在：

### 将系统调用的原型添加到user/user.h
```
diff --git a/user/user.h b/user/user.h
--- a/user/user.h
+++ b/user/user.h
@@ -23,6 +23,7 @@ int getpid(void);
char* sbrk(int);
int sleep(int);
int uptime(void);
+int trace(int);

// ulib.c
int stat(const char*, struct stat*);
```

### 存根添加到user/usys.pl
```
diff --git a/user/usys.pl b/user/usys.pl
--- a/user/usys.pl
+++ b/user/usys.pl
@@ -36,3 +36,4 @@ entry("getpid");
entry("sbrk");
entry("sleep");
entry("uptime");
+entry("trace");
\ No newline at end of file
```

### 将系统调用编号添加到kernel/syscall.h
```
diff --git a/kernel/syscall.h b/kernel/syscall.h
--- a/kernel/syscall.h
+++ b/kernel/syscall.h
@@ -20,3 +20,4 @@
#define SYS_link   19
#define SYS_mkdir  20
#define SYS_close  21
+#define SYS_trace  22
\ No newline at end of file
```

### 此时尝试执行trace 32 grep hello README
```bash
$ trace 32 grep hello README 
3 trace: unknown sys call 22 
trace: trace failed
```


## 在kernel/sysproc.c中添加一个sys_trace()函数uint64
```
diff --git a/kernel/sysproc.c b/kernel/sysproc.c
--- a/kernel/sysproc.c
+++ b/kernel/sysproc.c
@@ -95,3 +95,16 @@ sys_uptime(void)
   release(&tickslock);
   return xticks;
 }
+
+uint64
+sys_trace(void)
+{
+  // 获取掩码参数
+  int mask;
+  if(argint(0, &mask) < 0)
+    return -1;
+
+  struct proc *p = myproc();
+  p->trace_mask=mask;
+  return 0;
+}
```

## 将参数保存到proc结构体（请参见kernel/proc.h）里的一个新变量中来实现新的系统调用

```
diff --git a/kernel/proc.h b/kernel/proc.h
--- a/kernel/proc.h
+++ b/kernel/proc.h
@@ -93,6 +93,7 @@ struct proc {
   int killed;                  // If non-zero, have been killed
   int xstate;                  // Exit status to be returned to parent's wait
   int pid;                     // Process ID
+  int trace_mask;
 
   // these are private to the process, so p->lock need not be held.
   uint64 kstack;               // Virtual address of kernel stack
```

## 修改fork()（请参阅kernel/proc.c）将跟踪掩码从父进程复制到子进程

```
diff --git a/kernel/proc.c b/kernel/proc.c
--- a/kernel/proc.c
+++ b/kernel/proc.c
@@ -291,6 +291,9 @@ fork(void)
 
   safestrcpy(np->name, p->name, sizeof(p->name));
 
+  //将trace_mask拷贝到子进程
+  np->trace_mask = p->trace_mask;
+  
   pid = np->pid;
 
   np->state = RUNNABLE;
```

## 修改kernel/syscall.c中的syscall()函数以打印跟踪输出。您将需要添加一个系统调用名称数组以建立索引


```
diff --git a/kernel/syscall.c b/kernel/syscall.c
--- a/kernel/syscall.c
+++ b/kernel/syscall.c
@@ -104,6 +104,7 @@ extern uint64 sys_unlink(void);
 extern uint64 sys_wait(void);
 extern uint64 sys_write(void);
 extern uint64 sys_uptime(void);
+extern uint64 sys_trace(void);
 
 static uint64 (*syscalls[])(void) = {
 [SYS_fork]    sys_fork,
@@ -127,6 +128,12 @@ static uint64 (*syscalls[])(void) = {
 [SYS_link]    sys_link,
 [SYS_mkdir]   sys_mkdir,
 [SYS_close]   sys_close,
+[SYS_trace]   sys_trace,
+};
+
+static char *syscall_names[] = {
+    "fork", "exit", "wait", "pipe", "read", "kill", "exec", "fstat", "chdir", "dup", "getpid", "sbrk", "sleep", 
+    "uptime", "open", "write", "mknod", "unlink", "link", "mkdir", "close", "trace"
 };
 
 void
@@ -138,6 +145,8 @@ syscall(void)
   num = p->trapframe->a7;
   if(num > 0 && num < NELEM(syscalls) && syscalls[num]) {
     p->trapframe->a0 = syscalls[num]();
+    if((1 << num) & p->trace_mask) 
+      printf("%d: syscall %s -> %d\n",p->pid, syscall_names[num-1], p->trapframe->a0);
   } else {
     printf("%d %s: unknown sys call %d\n",
             p->pid, p->name, num);
```


# Sysinfo (moderate)

系统调用sysinfo，它收集有关正在运行的系统的信息。

## 在Makefile的UPROGS中添加$U/_sysinfotest

```
diff --git a/Makefile b/Makefile
--- a/Makefile
+++ b/Makefile
@@ -150,7 +150,7 @@ UPROGS=\
        $U/_wc\
        $U/_zombie\
        $U/_trace\
-
+       $U/_sysinfotest\
 
 ifeq ($(LAB),trap)
 UPROGS += \
```


## 要在user/user.h中声明sysinfo()的原型

需要预先声明struct sysinfo的存在：

```c
struct sysinfo;
int sysinfo(struct sysinfo *);
```
即

```
diff --git a/user/user.h b/user/user.h
--- a/user/user.h
+++ b/user/user.h
@@ -1,5 +1,6 @@
 struct stat;
 struct rtcdate;
+struct sysinfo;
 
 // system calls
 int fork(void);
@@ -24,6 +25,7 @@ char* sbrk(int);
 int sleep(int);
 int uptime(void);
 int trace(int);
+int sysinfo(struct sysinfo *);
 
 // ulib.c
 int stat(const char*, struct stat*);
```

## 当运行make qemu时，user/sysinfotest.c将会编译失败

遵循和上一个作业一样的步骤添加sysinfo系统调用

```
diff --git a/user/usys.pl b/user/usys.pl
--- a/user/usys.pl
+++ b/user/usys.pl
@@ -36,4 +36,5 @@ entry("getpid");
 entry("sbrk");
 entry("sleep");
 entry("uptime");
-entry("trace");
\ No newline at end of file
+entry("trace");
+entry("sysinfo");
\ No newline at end of file
```

```
diff --git a/kernel/syscall.h b/kernel/syscall.h
--- a/kernel/syscall.h
+++ b/kernel/syscall.h
@@ -20,4 +20,5 @@
 #define SYS_link   19
 #define SYS_mkdir  20
 #define SYS_close  21
-#define SYS_trace  22
\ No newline at end of file
+#define SYS_trace  22
+#define SYS_sysinfo 23
\ No newline at end of file
```

```
diff --git a/kernel/syscall.c b/kernel/syscall.c
--- a/kernel/syscall.c
+++ b/kernel/syscall.c
@@ -105,6 +105,7 @@ extern uint64 sys_wait(void);
 extern uint64 sys_write(void);
 extern uint64 sys_uptime(void);
 extern uint64 sys_trace(void);
+extern uint64 sys_sysinfo(void);
 
 static uint64 (*syscalls[])(void) = {
 [SYS_fork]    sys_fork,
@@ -129,6 +130,7 @@ static uint64 (*syscalls[])(void) = {
 [SYS_mkdir]   sys_mkdir,
 [SYS_close]   sys_close,
 [SYS_trace]   sys_trace,
+[SYS_sysinfo] sys_sysinfo,
 };
 
 static char *syscall_names[] = {
```

一旦修复了编译问题，就运行`sysinfotest`；但由于您还没有在内核中实现系统调用，执行将失败。

## sysinfo需要将一个struct sysinfo复制回用户空间

请参阅sys_fstat()(kernel/sysfile.c)和filestat()(kernel/file.c)以获取如何使用copyout()执行此操作的示例。

```
diff --git a/kernel/sysproc.c b/kernel/sysproc.c
--- a/kernel/sysproc.c
+++ b/kernel/sysproc.c
@@ -6,6 +6,10 @@
 #include "memlayout.h"
 #include "spinlock.h"
 #include "proc.h"
+#include "sysinfo.h"
+
+int get_nproc();
+int get_freemen();
 
 uint64
 sys_exit(void)
@@ -108,3 +112,23 @@ sys_trace(void)
   p->trace_mask=mask;
   return 0;
 }
+
+uint64
+sys_sysinfo(void){
+  struct proc *p = myproc();
+  struct sysinfo st;
+  uint64 addr;
+
+  st.nproc=get_nproc();
+  st.freemem=get_freemen();
+
+  //参阅sys_fstat()(kernel/sysfile.c)
+  if(argaddr(0, &addr) < 0)//获取指向结构体的指针，并存储在 st 变量中
+    return -1;
+
+  //参阅filestat()(kernel/file.c)
+  if(copyout(p->pagetable, addr, (char *)&st, sizeof(st)) < 0)//将 st 结构体的内容从内核空间复制到用户空间的指定地址 addr
+    return -1;
+
+  return 0;
+}
\ No newline at end of file
```

## 要获取空闲内存量，在kernel/kalloc.c中添加一个函数

```
diff --git a/kernel/kalloc.c b/kernel/kalloc.c
--- a/kernel/kalloc.c
+++ b/kernel/kalloc.c
@@ -80,3 +80,18 @@ kalloc(void)
     memset((char*)r, 5, PGSIZE); // fill with junk
   return (void*)r;
 }
+
+int get_freemen(void){
+  int count=0;
+  struct run *r;
+
+  acquire(&kmem.lock);
+  r = kmem.freelist;
+  while(r){
+    r=r->next;
+    count++;
+  }
+  release(&kmem.lock);
+
+  return count * PGSIZE;
+}
\ No newline at end of file
```

## 要获取进程数，在kernel/proc.c中添加一个函数

```
diff --git a/kernel/proc.c b/kernel/proc.c
--- a/kernel/proc.c
+++ b/kernel/proc.c
@@ -696,3 +696,16 @@ procdump(void)
     printf("\n");
   }
 }
+
+int get_nproc(void){
+  int count=0;
+  struct proc *p;
+  for(p = proc; p < &proc[NPROC]; p++) {
+    acquire(&p->lock);
+    if(p->state != UNUSED) {
+      count++;
+    } 
+    release(&p->lock);
+  }
+  return count;
+}
\ No newline at end of file
```

