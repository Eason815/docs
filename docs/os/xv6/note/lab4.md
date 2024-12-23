# RISC-V assembly (easy)

在虚拟机终端运行
```bash
$ make fs.img
```

阅读在`user/call.asm`中生成可读的汇编版本

```asm:line-numbers {1}
0000000000000000 <g>:
#include "kernel/param.h"
#include "kernel/types.h"
#include "kernel/stat.h"
#include "user/user.h"

int g(int x) {
   0:	1141                	addi	sp,sp,-16
   2:	e422                	sd	s0,8(sp)
   4:	0800                	addi	s0,sp,16
  return x+3;
}
   6:	250d                	addiw	a0,a0,3
   8:	6422                	ld	s0,8(sp)
   a:	0141                	addi	sp,sp,16
   c:	8082                	ret

000000000000000e <f>:

int f(int x) {
   e:	1141                	addi	sp,sp,-16
  10:	e422                	sd	s0,8(sp)
  12:	0800                	addi	s0,sp,16
  return g(x);
}
  14:	250d                	addiw	a0,a0,3
  16:	6422                	ld	s0,8(sp)
  18:	0141                	addi	sp,sp,16
  1a:	8082                	ret

000000000000001c <main>:

void main(void) {
  1c:	1141                	addi	sp,sp,-16
  1e:	e406                	sd	ra,8(sp)
  20:	e022                	sd	s0,0(sp)
  22:	0800                	addi	s0,sp,16
  printf("%d %d\n", f(8)+1, 13);
  24:	4635                	li	a2,13
  26:	45b1                	li	a1,12
  28:	00000517          	auipc	a0,0x0
  2c:	7a850513          	addi	a0,a0,1960 # 7d0 <malloc+0x102>
  30:	00000097          	auipc	ra,0x0
  34:	5e6080e7          	jalr	1510(ra) # 616 <printf>
  exit(0);
  38:	4501                	li	a0,0
  3a:	00000097          	auipc	ra,0x0
  3e:	274080e7          	jalr	628(ra) # 2ae <exit>
```

1. 哪些寄存器保存函数的参数？例如，在main对printf的调用中，哪个寄存器保存13？

a0-a7存放函数的参数

由第39行,即如下
```asm
  24:	4635                	li	a2,13
```
可见，寄存器a2存放13

2. main的汇编代码中对函数f的调用在哪里？对g的调用在哪里(提示：编译器可能会将函数内联)

源代码中, main调用函数f, 函数f调用函数g

在生成的汇编中，main函数进行了内联优化处理。

优化为内联(Inline Optimization)是指将函数的调用替换为函数的实际代码，以减少函数调用的开销。

f(8)+1可能直接替换看作为8+3+1来计算

在汇编语言中，内联优化通常是由编译器在生成汇编代码时自动完成的，程序员不需要手动插入汇编代码。

在第40行,即如下
```asm
  26:	45b1                	li	a1,12
```
可见main直接计算出了结果并储存

3. printf函数位于哪个地址？

```asm
  30:	00000097          	auipc	ra,0x0
  34:	5e6080e7          	jalr	1510(ra) # 616 <printf>
```
printf函数的调用在第44行, 

第一行代码 00000097H=00...0 0000 1001 0111B

对比指令格式,可见imm=0,dest=00001,opcode=0010111

对比汇编指令可知,uipc的操作码是0010111,ra寄存器代码是00001

这行代码将0x0左移12位(还是0x0)加到PC(当前为0x30)上并存入ra中,即ra中保存的是0x30

由第44行的跳转可知跳转的位置为

0x30 + 1510 = 0x030 + 0x5e6 = 0x616



4. 在main中printf的jalr之后的寄存器ra中有什么值？

jalr (jump and link register):jalr rd, offset(rs1)跳转并链接寄存器

jalr指令会将当前PC+4保存在rd中,然后跳转到指定的偏移地址offset(rs1)

跳转到printf函数，且将PC + 4 = 0x34 + 4 = 0x38 存到ra中

5. 运行以下代码。

```c
unsigned int i = 0x00646c72;
printf("H%x Wo%s", 57616, &i);
```

程序的输出是什么？这是将字节映射到字符的ASCII码表。

输出取决于RISC-V小端存储的事实。如果RISC-V是大端存储，为了得到相同的输出，你会把i设置成什么？是否需要将57616更改为其他值？

十进制57616 = 十六进制0xE110

小端存储将0x00646c72划分72 6c 64 00

再将各部分十六进制转为十进制对应为114 108 100 0

由ASCII码表 对应为r l d

所以输出为 HE110 World

若为大端存储,i改为0x726c6400,不需要改变57616

6. 在下面的代码中，“y=”之后将打印什么(注：答案不是一个特定的值）？为什么会发生这种情况？

```c
printf("x=%d y=%d", 3);
```
函数需要两个参数, 而只传入了一个参数, y=后面缺失的参数会使用之前a2中保存的数据


# Backtrace(moderate)

## 在kernel/defs.h中添加backtrace的原型



```
diff --git a/kernel/defs.h b/kernel/defs.h
index 4b9bbc0..137c786 100644
--- a/kernel/defs.h
+++ b/kernel/defs.h
@@ -80,6 +80,7 @@ int             pipewrite(struct pipe*, uint64, int);
 void            printf(char*, ...);
 void            panic(char*) __attribute__((noreturn));
 void            printfinit(void);
+void            backtrace(void);
 
 // proc.c
 int             cpuid(void);
```


那样就能在sys_sleep中引用backtrace


```
diff --git a/kernel/sysproc.c b/kernel/sysproc.c
index e8bcda9..fd19d2a 100644
--- a/kernel/sysproc.c
+++ b/kernel/sysproc.c
@@ -70,6 +70,7 @@ sys_sleep(void)
     sleep(&ticks, &tickslock);
   }
   release(&tickslock);
+  backtrace();
   return 0;
 }
 
```


## 将下面的函数添加到kernel/riscv.h

GCC编译器将当前正在执行的函数的帧指针保存在s0寄存器

```
diff --git a/kernel/riscv.h b/kernel/riscv.h
index 0aec003..7a443e9 100644
--- a/kernel/riscv.h
+++ b/kernel/riscv.h
@@ -311,6 +311,14 @@ r_ra()
   return x;
 }
 
+static inline uint64
+r_fp()
+{
+  uint64 x;
+  asm volatile("mv %0, s0" : "=r" (x) );
+  return x;
+}
+
 // flush the TLB.
 static inline void
 sfence_vma()
```

后续在backtrace中调用此函数来读取当前的帧指针。这个函数使用内联汇编来读取s0

## 打印返回地址和回溯上一个栈帧

![pic](/xv6/lab4/1.png)

返回地址位于栈帧帧指针的固定偏移(-8)位置，并且保存的帧指针位于帧指针的固定偏移(-16)位置

一旦backtrace能够运行，就在kernel/printf.c的panic中调用它，就可以在panic发生时看到内核的backtrace

```
diff --git a/kernel/printf.c b/kernel/printf.c
index e1347de..7d7900c 100644
--- a/kernel/printf.c
+++ b/kernel/printf.c
@@ -121,6 +121,7 @@ panic(char *s)
   printf("panic: ");
   printf(s);
   printf("\n");
+  backtrace();
   panicked = 1; // freeze uart output from other CPUs
   for(;;)
     ;
@@ -132,3 +133,16 @@ printfinit(void)
   initlock(&pr.lock, "pr");
   pr.locking = 1;
 }
+
+void
+backtrace(void)
+{
+  uint64 fp = r_fp();
+  uint64 top = PGROUNDUP(fp);
+  uint64 bottom = PGROUNDDOWN(fp);
+
+  while(fp < top && fp > bottom){
+    printf("%p\n", *((uint64 *) (fp - 8)));
+    fp = *((uint64 *) (fp - 16));
+  }
+}
\ No newline at end of file
```



## 结果

```bash
xv6 kernel is booting

hart 2 starting
hart 1 starting
init: starting sh
$ bttest
0x0000000080002dd6
0x0000000080002c32
0x000000008000291c
$ QEMU: Terminated
eason@eason-VMware-Virtual-Platform:~/work/xv6-labs-2020$ addr2line -e kernel/kernel
0x0000000080002dd6
/home/eason/work/xv6-labs-2020/kernel/sysproc.c:74
0x0000000080002c32
/home/eason/work/xv6-labs-2020/kernel/syscall.c:140 (discriminator 1)
0x000000008000291c
/home/eason/work/xv6-labs-2020/kernel/trap.c:76
```



# Alarm(Hard)


添加一个新的sigalarm(interval, handler)系统调用

## test0: invoke handler(调用处理程序)

### 添加系统调用流程(类似Lab2)

#### 修改Makefile以使alarmtest.c被编译为xv6用户程序

```
diff --git a/Makefile b/Makefile
index 1fa367e..f5da769 100644
--- a/Makefile
+++ b/Makefile
@@ -175,7 +175,7 @@ UPROGS=\
        $U/_grind\
        $U/_wc\
        $U/_zombie\
-
+       $U/_alarmtest\
```

#### 放入user/user.h的正确声明

```
diff --git a/user/user.h b/user/user.h
index b71ecda..57404e0 100644
--- a/user/user.h
+++ b/user/user.h
@@ -23,6 +23,8 @@ int getpid(void);
 char* sbrk(int);
 int sleep(int);
 int uptime(void);
+int sigalarm(int ticks, void (*handler)());
+int sigreturn(void);
 
 // ulib.c
 int stat(const char*, struct stat*);
```

#### 更新user/usys.pl

此文件生成user/usys.S

```
diff --git a/user/usys.pl b/user/usys.pl
index 01e426e..fa548b0 100755
--- a/user/usys.pl
+++ b/user/usys.pl
@@ -36,3 +36,5 @@ entry("getpid");
 entry("sbrk");
 entry("sleep");
 entry("uptime");
+entry("sigalarm");
+entry("sigreturn");
```

#### 更新kernel/syscall.h和kernel/syscall.c

以此允许alarmtest调用sigalarm和sigreturn系统调用

```
diff --git a/kernel/syscall.h b/kernel/syscall.h
index bc5f356..7b88b81 100644
--- a/kernel/syscall.h
+++ b/kernel/syscall.h
@@ -20,3 +20,5 @@
 #define SYS_link   19
 #define SYS_mkdir  20
 #define SYS_close  21
+#define SYS_sigalarm  22
+#define SYS_sigreturn  23
```

```
diff --git a/kernel/syscall.c b/kernel/syscall.c
index c1b3670..8c0a928 100644
--- a/kernel/syscall.c
+++ b/kernel/syscall.c
@@ -104,6 +104,8 @@ extern uint64 sys_unlink(void);
 extern uint64 sys_wait(void);
 extern uint64 sys_write(void);
 extern uint64 sys_uptime(void);
+extern uint64 sys_sigalarm(void);
+extern uint64 sys_sigreturn(void); 
 
 static uint64 (*syscalls[])(void) = {
 [SYS_fork]    sys_fork,
@@ -127,6 +129,8 @@ static uint64 (*syscalls[])(void) = {
 [SYS_link]    sys_link,
 [SYS_mkdir]   sys_mkdir,
 [SYS_close]   sys_close,
+[SYS_sigalarm]   sys_sigalarm,
+[SYS_sigreturn]  sys_sigreturn,
 };
 
 void
```

### sys_sigreturn和sys_sigalarm系统调用

sys_sigreturn系统调用返回应该是零

sys_sigalarm()应该将报警间隔和指向处理程序函数的指针存储在struct proc的新字段中

```
diff --git a/kernel/sysproc.c b/kernel/sysproc.c
index fd19d2a..f3c86d8 100644
--- a/kernel/sysproc.c
+++ b/kernel/sysproc.c
@@ -96,3 +96,26 @@ sys_uptime(void)
   release(&tickslock);
   return xticks;
 }
+
+uint64
+sys_sigalarm(void)
+{
+  int interval;
+  uint64 handler;
+
+  argint(0, &interval);
+  argaddr(1, &handler);
+
+  struct proc *p = myproc();
+  p->interval = interval;
+  p->handler = handler;
+  p->ticks = 0; 
+
+  return 0;
+}
+
+uint64
+sys_sigreturn(void)
+{
+  return 0;
+}
\ No newline at end of file
```

### proc字段

在struct proc新增一个新字段。用于跟踪自上一次调用（或直到下一次调用）到进程的报警处理程序间经历了多少滴答

```
diff --git a/kernel/proc.h b/kernel/proc.h
index 9c16ea7..3e5cd13 100644
--- a/kernel/proc.h
+++ b/kernel/proc.h
@@ -103,4 +103,8 @@ struct proc {
   struct file *ofile[NOFILE];  // Open files
   struct inode *cwd;           // Current directory
   char name[16];               // Process name (debugging)
+
+  int interval;
+  uint64 handler;
+  int ticks;
 };
```

在proc.c的allocproc()中初始化proc字段

```
diff --git a/kernel/proc.c b/kernel/proc.c
index dab1e1d..cae7085 100644
--- a/kernel/proc.c
+++ b/kernel/proc.c
@@ -126,6 +126,9 @@ found:
   memset(&p->context, 0, sizeof(p->context));
   p->context.ra = (uint64)forkret;
   p->context.sp = p->kstack + PGSIZE;
+  p->interval = 0;
+  p->handler = 0;
+  p->ticks = 0;
 
   return p;
 }
```

### 中断在kernel/trap.c中的usertrap()中处理

每一个滴答声，硬件时钟就会强制一个中断

```
diff --git a/kernel/trap.c b/kernel/trap.c
index a63249e..8230374 100644
--- a/kernel/trap.c
+++ b/kernel/trap.c
@@ -78,7 +78,16 @@ usertrap(void)
 
   // give up the CPU if this is a timer interrupt.
   if(which_dev == 2)
+  {
+    if(p->interval != 0){
+      p->ticks++;
+      if(p->ticks > p->interval){
+        p->ticks = 0;
+        p->trapframe->epc = p->handler;
+      }
+    }
     yield();
+  }
 
   usertrapret();
 }
```

什么决定了用户空间代码恢复执行的指令地址？

在proc.h第48行

```
  /*  24 */ uint64 epc;           // saved user program counter
```

用户空间的pc

### 结果

```bash
$ alarmtest
test0 start
................................................alarm!
test0 passed
```

## test1/test2(): resume interrupted code(恢复被中断的代码)


### 修改 proc 结构体

增加 trapframe 的副本字段

```
diff --git a/kernel/proc.h b/kernel/proc.h
index 3e5cd13..c8aa74d 100644
--- a/kernel/proc.h
+++ b/kernel/proc.h
@@ -107,4 +107,5 @@ struct proc {
   int interval;
   uint64 handler;
   int ticks;
+  struct trapframe* trapframecopy;  
 };
```

与test0相同将其在proc中进行初始化

```
diff --git a/kernel/proc.c b/kernel/proc.c
index cae7085..704c016 100644
--- a/kernel/proc.c
+++ b/kernel/proc.c
@@ -129,6 +129,7 @@ found:
   p->interval = 0;
   p->handler = 0;
   p->ticks = 0;
+  p->trapframecopy = 0;
 
   return p;
 }
```

### 保留现场

在 kernel/trap.c 的 usertrap() 中覆盖 p->trapframe->epc 前做 trapframe 的副本

```
diff --git a/kernel/trap.c b/kernel/trap.c
index 8230374..6d0ba1c 100644
--- a/kernel/trap.c
+++ b/kernel/trap.c
@@ -81,8 +81,9 @@ usertrap(void)
   {
     if(p->interval != 0){
       p->ticks++;
-      if(p->ticks > p->interval){
-        p->ticks = 0;
+      if(p->ticks == p->interval){
+        p->trapframecopy = p->trapframe + 512;  
+        memmove(p->trapframecopy,p->trapframe,sizeof(struct trapframe));
         p->trapframe->epc = p->handler;
       }
     }
```

使用memmove函数进行复制整个trapframe

+512是使用trapframe空间后面的内存, trapframe实际内存大小为288B, 可以取其他值


### 恢复现场

在 sys_sigreturn() 中将副本恢复到原 trapframe

```
diff --git a/kernel/sysproc.c b/kernel/sysproc.c
index f3c86d8..242a0d1 100644
--- a/kernel/sysproc.c
+++ b/kernel/sysproc.c
@@ -117,5 +117,13 @@ sys_sigalarm(void)
 uint64
 sys_sigreturn(void)
 {
-  return 0;
+  struct proc *p = myproc();
+  if(p->trapframecopy != p->trapframe + 512) {
+    return -1;
+  }
+  memmove(p->trapframe, p->trapframecopy, sizeof(struct trapframe));
+
+  p->ticks = 0;     
+  p->trapframecopy = 0;    
+  return p->trapframe->a0;
 }
\ No newline at end of file
```

### 防止对handler程序的重复调用

1. 将p->ticks=0从原本的 usertrap() 移至 sys_sigreturn() 中

若在usetrap()中进行重置，ticks后续会自增又会满足handler调用条件

而sys_sigreturn()的结束对应handler()的结束，所以移动到此处

2. 注意当ticks达到 interval 时调用handler()

### 结果

测试test0、test1和test2

```bash
$ alarmtest
test0 start
.............................alarm!
test0 passed
test1 start
....alarm!
...alarm!
....alarm!
....alarm!
....alarm!
.....alarm!
....alarm!
.....alarm!
....alarm!
.....alarm!
test1 passed
test2 start
......................................................alarm!
test2 passed
```

`usertests`确保没有破坏内核的任何其他部分

```bash
ALL TESTS PASSED
$ 
```


