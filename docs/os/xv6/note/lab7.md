# Uthread: switching between threads (moderate)

在给定的代码基础上实现用户级线程切换

## 修改结构体

定义存储上下文的结构体tcontext

修改thread结构体，添加context字段

```
diff --git a/user/uthread.c b/user/uthread.c
index 8e46826..ed044a6 100644
--- a/user/uthread.c
+++ b/user/uthread.c
@@ -10,11 +10,30 @@
 #define STACK_SIZE  8192
 #define MAX_THREAD  4
 
+// 用户线程的上下文结构体
+struct tcontext {
+  uint64 ra;
+  uint64 sp;
+
+  // callee-saved
+  uint64 s0;
+  uint64 s1;
+  uint64 s2;
+  uint64 s3;
+  uint64 s4;
+  uint64 s5;
+  uint64 s6;
+  uint64 s7;
+  uint64 s8;
+  uint64 s9;
+  uint64 s10;
+  uint64 s11;
+};
 
 struct thread {
   char       stack[STACK_SIZE]; /* the thread's stack */
   int        state;             /* FREE, RUNNING, RUNNABLE */
-
+  struct tcontext context;            /* 用户进程上下文 */
 };
 struct thread all_thread[MAX_THREAD];
 struct thread *current_thread;
```


## 添加 thread_switch 的代码

此处 struct ctx 与内核的 struct context 结构体的成员是相同的

因此该函数可以直接复用 kernel/swtch.S 中的 swtch 代码

```
diff --git a/user/uthread_switch.S b/user/uthread_switch.S
index 5defb12..a6ac075 100644
--- a/user/uthread_switch.S
+++ b/user/uthread_switch.S
@@ -8,4 +8,33 @@
        .globl thread_switch
 thread_switch:
        /* YOUR CODE HERE */
+       sd ra, 0(a0)
+    sd sp, 8(a0)
+    sd s0, 16(a0)
+    sd s1, 24(a0)
+    sd s2, 32(a0)
+    sd s3, 40(a0)
+    sd s4, 48(a0)
+    sd s5, 56(a0)
+    sd s6, 64(a0)
+    sd s7, 72(a0)
+    sd s8, 80(a0)
+    sd s9, 88(a0)
+    sd s10, 96(a0)
+    sd s11, 104(a0)
+
+    ld ra, 0(a1)
+    ld sp, 8(a1)
+    ld s0, 16(a1)
+    ld s1, 24(a1)
+    ld s2, 32(a1)
+    ld s3, 40(a1)
+    ld s4, 48(a1)
+    ld s5, 56(a1)
+    ld s6, 64(a1)
+    ld s7, 72(a1)
+    ld s8, 80(a1)
+    ld s9, 88(a1)
+    ld s10, 96(a1)
+    ld s11, 104(a1)
        ret    /* return to ra */
```

## 添加线程切换语句

添加代码到 thread_schedule() 函数

thread_schedule() 函数负责进行用户多线程间的调度

```
diff --git a/user/uthread.c b/user/uthread.c
index 8e46826..ed044a6 100644
--- a/user/uthread.c
+++ b/user/uthread.c
@@ -63,6 +82,7 @@ thread_schedule(void)
      * Invoke thread_switch to switch from t to next_thread:
      * thread_switch(??, ??);
      */
+    thread_switch((uint64)&t->context, (uint64)&current_thread->context);
   } else
     next_thread = 0;
 }
```

## 添加代码到 thread_create() 函数

thread_create() 函数主要进行线程的初始化操作: 

其先在线程数组中找到一个状态为 FREE 即未初始化的线程, 然后设置其状态为 RUNNABLE 等进行初始化

```
diff --git a/user/uthread.c b/user/uthread.c
index 8e46826..ed044a6 100644
--- a/user/uthread.c
+++ b/user/uthread.c
@@ -77,6 +97,8 @@ thread_create(void (*func)())
   }
   t->state = RUNNABLE;
   // YOUR CODE HERE
+  t->context.ra = (uint64)func;                   // 设定函数返回地址
+  t->context.sp = (uint64)t->stack + STACK_SIZE;  // 设定栈指针
 }
 
 void 
```

## 测试

```bash
init: starting sh
$ uthread
thread_a started
thread_b started
thread_c started
thread_c 0
...
thread_b 99
thread_c: exit after 100
thread_a: exit after 100
thread_b: exit after 100
thread_schedule: no runnable threads
```

# Using threads (moderate)

## 预处理

1. 构建 ph 程序

文件notxv6/ph.c包含一个简单的哈希表

如果单个线程使用，该哈希表是正确的，但是多个线程使用时，该哈希表是不正确的

```bash
eason@eason-VMware-Virtual-Platform:~/work/xv6-labs-2020$ make ph
gcc -o ph -g -O2 notxv6/ph.c -pthread
```

2. 运行 ./ph 1 

使用单线程运行该哈希表

```bash
eason@eason-VMware-Virtual-Platform:~/work/xv6-labs-2020$ ./ph 1
100000 puts, 6.372 seconds, 15695 puts/second
0: 0 keys missing
100000 gets, 6.236 seconds, 16035 gets/second
```

3. 运行 ./ph 2

使用两个线程运行该哈希表

```bash
eason@eason-VMware-Virtual-Platform:~/work/xv6-labs-2020$ ./ph 2
100000 puts, 2.759 seconds, 36248 puts/second
1: 14873 keys missing
0: 14873 keys missing
200000 gets, 6.531 seconds, 30622 gets/second
```

这是一个优秀的“并行加速”，大约达到了人们希望的2倍

但keys missing的两行表示散列表中本应存在的大量键不存在,出现了一些问题

## 定义互斥锁数组

```
diff --git a/notxv6/ph.c b/notxv6/ph.c
index 6df1500..60f2703 100644
--- a/notxv6/ph.c
+++ b/notxv6/ph.c
@@ -16,6 +16,7 @@ struct entry {
 struct entry *table[NBUCKET];
 int keys[NKEYS];
 int nthread = 1;
+pthread_mutex_t lock[NBUCKET] = { PTHREAD_MUTEX_INITIALIZER }; // 每个散列桶一把锁
 
 double
 now()
```

## 在 put() 中加锁

```
diff --git a/notxv6/ph.c b/notxv6/ph.c
index 6df1500..60f2703 100644
--- a/notxv6/ph.c
+++ b/notxv6/ph.c
@@ -50,8 +51,10 @@ void put(int key, int value)
     // update the existing key.
     e->value = value;
   } else {
+    pthread_mutex_lock(&lock[i]);
     // the new is new.
     insert(key, value, &table[i], table[i]);
+    pthread_mutex_unlock(&lock[i]);
   }
 }
```

## 测试

gcc重新编译运行

```bash
eason@eason-VMware-Virtual-Platform:~/work/xv6-labs-2020$ make ph
gcc -o ph -g -O2 notxv6/ph.c -pthread
eason@eason-VMware-Virtual-Platform:~/work/xv6-labs-2020$ ./ph 2
100000 puts, 2.721 seconds, 36749 puts/second
0: 0 keys missing
1: 0 keys missing
200000 gets, 5.111 seconds, 39134 gets/second
```


# Barrier(moderate)

屏障(Barrier)：应用程序中的一个点，所有参与的线程在此点上必须等待，直到所有其他参与线程也达到该点

用于需要多个线程在某个阶段完成某项工作后再一起进行下一步操作的场景

## 问题抛出

文件notxv6/barrier.c包含一个残缺的屏障实现

```bash
eason@eason-VMware-Virtual-Platform:~/work/xv6-labs-2020$ make barrier
gcc -o barrier -g -O2 notxv6/barrier.c -pthread
eason@eason-VMware-Virtual-Platform:~/work/xv6-labs-2020$ ./barrier 2
barrier: notxv6/barrier.c:45: thread: Assertion `i == t' failed.
barrier: notxv6/barrier.c:45: thread: Assertion `i == t' failed.
Aborted (core dumped)
```


## 实现barrier()函数


```
diff --git a/notxv6/barrier.c b/notxv6/barrier.c
index 12793e8..2bd85dc 100644
--- a/notxv6/barrier.c
+++ b/notxv6/barrier.c
@@ -30,7 +30,17 @@ barrier()
   // Block until all threads have called barrier() and
   // then increment bstate.round.
   //
+  pthread_mutex_lock(&bstate.barrier_mutex);
   
+  bstate.nthread++;
+  if(bstate.nthread == nthread) {
+    bstate.round++;
+    bstate.nthread = 0;
+    pthread_cond_broadcast(&bstate.barrier_cond);
+  } else {
+    pthread_cond_wait(&bstate.barrier_cond, &bstate.barrier_mutex);
+  }
+  pthread_mutex_unlock(&bstate.barrier_mutex);
 }
 
 static void *
```

## 测试

重新编译

使用一个、两个和两个以上的线程测试代码

```bash
eason@eason-VMware-Virtual-Platform:~/work/xv6-labs-2020$ make barrier
gcc -o barrier -g -O2 notxv6/barrier.c -pthread
eason@eason-VMware-Virtual-Platform:~/work/xv6-labs-2020$ ./barrier 1
OK; passed
eason@eason-VMware-Virtual-Platform:~/work/xv6-labs-2020$ ./barrier 2
OK; passed
eason@eason-VMware-Virtual-Platform:~/work/xv6-labs-2020$ ./barrier 4
OK; passed
```