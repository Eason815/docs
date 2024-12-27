# Eliminate allocation from sbrk() (easy)

## 删除对growproc()的调用



```
diff --git a/kernel/sysproc.c b/kernel/sysproc.c
index e8bcda9..a410cd5 100644
--- a/kernel/sysproc.c
+++ b/kernel/sysproc.c
@@ -47,8 +47,9 @@ sys_sbrk(void)
   if(argint(0, &n) < 0)
     return -1;
   addr = myproc()->sz;
-  if(growproc(n) < 0)
-    return -1;
+  myproc()->sz += n;
+  // if(growproc(n) < 0)
+  //   return -1;
   return addr;
 }
```

## 测试

```bash
init: starting sh
$ echo hi
usertrap(): unexpected scause 0x000000000000000f pid=3
            sepc=0x0000000000001272 stval=0x0000000000004008
panic: uvmunmap: not mapped
```

scause 寄存器的值为 0x000000000000000f, 即15

在RISC-V privileged instructions中图所示

![pic](/xv6/lab5/1.png)

15 对应 Store/AMO page fault

sepc 的值在 user/sh.asm 文件第2632行中可以找到对应汇编代码

```
    1272:	01652423          	sw	s6,8(a0)
```

可以看到是一个 sw 指令, 用于向内存中写入 1 个字

上述修改使得没有实际分配物理内存, 引发 page fault



# Lazy allocation (moderate)

## 在生成“usertrap(): …”消息的printf调用之前添加代码

在usertrap()中查看r_scause()的返回值是否为13或15来判断该错误是否为页面错误

通过r_stval()读取stval寄存器中保存的造成页面错误的虚拟地址

参考vm.c中的uvmalloc()中的代码

这是一个sbrk()通过growproc()调用的函数。

对kalloc()和mappages()进行调用

使用PGROUNDDOWN(va)将出错的虚拟地址向下舍入到页面边界

```
diff --git a/kernel/trap.c b/kernel/trap.c
index a63249e..dfecb97 100644
--- a/kernel/trap.c
+++ b/kernel/trap.c
@@ -65,6 +65,20 @@ usertrap(void)
     intr_on();
 
     syscall();
+  } else if(r_scause() == 13 || r_scause() == 15){
+    char *pa;
+    if((pa = kalloc()) != 0) {
+      uint64 va = PGROUNDDOWN(r_stval());
+      memset(pa, 0, PGSIZE);
+      if(mappages(p->pagetable, va, PGSIZE, (uint64)pa, PTE_W|PTE_R|PTE_U) != 0) {
+        kfree(pa);
+        printf("usertrap(): mappages() failed\n");
+        p->killed = 1;
+      }
+    } else {
+      printf("usertrap(): kalloc() failed\n");
+      p->killed = 1;
+    }
   } else if((which_dev = devintr()) != 0){
     // ok
   } else {
```

## uvmunmap()会导致系统panic崩溃

修改当前uvmunmap()保证正常运行

```
diff --git a/kernel/vm.c b/kernel/vm.c
index bccb405..9263460 100644
--- a/kernel/vm.c
+++ b/kernel/vm.c
@@ -183,7 +183,8 @@ uvmunmap(pagetable_t pagetable, uint64 va, uint64 npages, int do_free)
     if((pte = walk(pagetable, a, 0)) == 0)
       panic("uvmunmap: walk");
     if((*pte & PTE_V) == 0)
-      panic("uvmunmap: not mapped");
+      // panic("uvmunmap: not mapped");
+      continue;
     if(PTE_FLAGS(*pte) == PTE_V)
       panic("uvmunmap: not a leaf");
     if(do_free){
```

## 测试

```bash
init: starting sh
$ echo hi
hi
```

# Lazytests and Usertests (moderate)

## 处理sbrk()参数为负的情况

可以直接参考原本调用的 growproc() 函数

因为在 Lazy allocation 的情况下减少内存同样是将多余的内存进行释放

此处调用了 uvmdealloc() 函数

```
diff --git a/kernel/sysproc.c b/kernel/sysproc.c
index a410cd5..e9e590c 100644
--- a/kernel/sysproc.c
+++ b/kernel/sysproc.c
@@ -43,11 +43,19 @@ sys_sbrk(void)
 {
   int addr;
   int n;
+  struct proc *p;
 
   if(argint(0, &n) < 0)
     return -1;
-  addr = myproc()->sz;
-  myproc()->sz += n;
+  p = myproc();
+  addr = p->sz;
+  if(n >= 0 && addr + n >= addr){
+    p->sz += n;
+  } else if(n < 0 && addr + n >= PGROUNDUP(p->trapframe->sp)){
+    p->sz = uvmdealloc(p->pagetable, addr, addr + n);
+  } else {
+    return -1;
+  }
   // if(growproc(n) < 0)
   //   return -1;
   return addr;
```


## 处理用户栈下面的无效页面上发生的错误

这两种情况都是 Lazy Allocation 未实际分配内存所产生的情况

在取消映射时都应该跳过而非 panic 终止程序

```
diff --git a/kernel/vm.c b/kernel/vm.c
index 9263460..95e96d2 100644
--- a/kernel/vm.c
+++ b/kernel/vm.c
@@ -181,7 +195,8 @@ uvmunmap(pagetable_t pagetable, uint64 va, uint64 npages, i
nt do_free)
 
   for(a = va; a < va + npages*PGSIZE; a += PGSIZE){
     if((pte = walk(pagetable, a, 0)) == 0)
-      panic("uvmunmap: walk");
+      // panic("uvmunmap: walk");
+      continue;
     if((*pte & PTE_V) == 0)
       // panic("uvmunmap: not mapped");
       continue;
```

## 在fork()中正确处理父到子内存拷贝

fork() 函数中父进程向子进程拷贝时的 Lazy allocation 情况

fork() 是通过 uvmcopy() 来进行父进程页表即用户空间向子进程拷贝的

```
diff --git a/kernel/vm.c b/kernel/vm.c
index 9263460..95e96d2 100644
--- a/kernel/vm.c
+++ b/kernel/vm.c
@@ -316,9 +331,11 @@ uvmcopy(pagetable_t old, pagetable_t new, uint64 sz)
 
   for(i = 0; i < sz; i += PGSIZE){
     if((pte = walk(old, i, 0)) == 0)
-      panic("uvmcopy: pte should exist");
+      // panic("uvmcopy: pte should exist");
+      continue;
     if((*pte & PTE_V) == 0)
-      panic("uvmcopy: page not present");
+      // panic("uvmcopy: page not present");
+      continue;
     pa = PTE2PA(*pte);
     flags = PTE_FLAGS(*pte);
     if((mem = kalloc()) == 0)
```

## page fault 虚拟地址高于 p->sz 或低于用户栈的情况

如果某个进程在高于sbrk()分配的任何虚拟内存地址上出现页错误，则终止该进程

```
diff --git a/kernel/trap.c b/kernel/trap.c
index dfecb97..20b6f94 100644
--- a/kernel/trap.c
+++ b/kernel/trap.c
@@ -67,17 +67,30 @@ usertrap(void)
     syscall();
   } else if(r_scause() == 13 || r_scause() == 15){
     char *pa;
-    if((pa = kalloc()) != 0) {
-      uint64 va = PGROUNDDOWN(r_stval());
-      memset(pa, 0, PGSIZE);
-      if(mappages(p->pagetable, va, PGSIZE, (uint64)pa, PTE_W|PTE_R|PTE_U) != 
0) {
-        kfree(pa);
-        printf("usertrap(): mappages() failed\n");
-        p->killed = 1;
-      }
-    } else {
+    uint64 va = r_stval();
+    if(va >= p->sz){
+      printf("usertrap(): invalid va=%p higher than p->sz=%p\n",
+             va, p->sz);
+      p->killed = 1;
+      goto end;
+    }
+    if(va < PGROUNDUP(p->trapframe->sp)) {
+      printf("usertrap(): invalid va=%p below the user stack sp=%p\n",
+             va, p->trapframe->sp);
+      p->killed = 1;
+      goto end;
+    }
+    if((pa = kalloc()) == 0) {
       printf("usertrap(): kalloc() failed\n");
       p->killed = 1;
+      goto end;
+    }
+    memset(pa, 0, PGSIZE);
+    if(mappages(p->pagetable, PGROUNDDOWN(va), PGSIZE, (uint64)pa, PTE_W|PTE_R
|PTE_U) != 0) {
+      kfree(pa);
+      printf("usertrap(): mappages() failed\n");
+      p->killed = 1;
+      goto end;
     }
   } else if((which_dev = devintr()) != 0){
     // ok
@@ -86,7 +99,7 @@ usertrap(void)
     printf("            sepc=%p stval=%p\n", r_sepc(), r_stval());
     p->killed = 1;
   }
-
+end:
   if(p->killed)
     exit(-1);
 
```

## 处理这种情形

进程从sbrk()向系统调用（如read或write）传递有效地址，但尚未分配该地址的内存

```
diff --git a/kernel/vm.c b/kernel/vm.c
index 9263460..95e96d2 100644
--- a/kernel/vm.c
+++ b/kernel/vm.c
@@ -5,6 +5,8 @@
 #include "riscv.h"
 #include "defs.h"
 #include "fs.h"
+#include "spinlock.h"
+#include "proc.h"
 
 /*
  * the kernel's page table.
@@ -96,15 +98,27 @@ walkaddr(pagetable_t pagetable, uint64 va)
 {
   pte_t *pte;
   uint64 pa;
+  struct proc *p = myproc();
 
   if(va >= MAXVA)
     return 0;
 
   pte = walk(pagetable, va, 0);
-  if(pte == 0)
-    return 0;
-  if((*pte & PTE_V) == 0)
-    return 0;
+  if(pte == 0 || (*pte & PTE_V) == 0){
+    if(va >= PGROUNDUP(p->trapframe->sp) && va < p->sz){
+        char *pa;
+        if ((pa = kalloc()) == 0) {
+            return 0;
+        }
+        memset(pa, 0, PGSIZE);
+        if (mappages(p->pagetable, PGROUNDDOWN(va), PGSIZE, (uint64) pa, PTE_W
 | PTE_R | PTE_U) != 0) {
+            kfree(pa);
+            return 0;
+        }
+    } else {
+        return 0;
+    }
+  }
   if((*pte & PTE_U) == 0)
     return 0;
   pa = PTE2PA(*pte);
```

## 测试

```bash
init: starting sh
$ lazytests
lazytests starting
running test lazy alloc
test lazy alloc: OK
running test lazy unmap
usertrap(): invalid va=0x0000000000005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000001005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000002005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000003005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000004005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000005005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000006005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000007005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000008005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000009005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x000000000a005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x000000000b005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x000000000c005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x000000000d005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x000000000e005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x000000000f005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000010005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000011005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000012005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000013005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000014005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000015005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000016005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000017005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000018005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000019005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x000000001a005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x000000001b005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x000000001c005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x000000001d005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x000000001e005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x000000001f005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000020005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000021005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000022005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000023005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000024005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000025005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000026005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000027005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000028005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000029005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x000000002a005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x000000002b005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x000000002c005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x000000002d005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x000000002e005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x000000002f005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000030005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000031005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000032005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000033005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000034005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000035005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000036005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000037005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000038005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x0000000039005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x000000003a005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x000000003b005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x000000003c005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x000000003d005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x000000003e005000 higher than p->sz=0x0000000000004000
usertrap(): invalid va=0x000000003f005000 higher than p->sz=0x0000000000004000
test lazy unmap: OK
running test out of memory
usertrap(): invalid va=0xffffffff80004808 higher than p->sz=0x0000000081004810
test out of memory: OK
ALL TESTS PASSED
```