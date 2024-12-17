# lab3: pgtbl

## 

这章开始难度加大

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

## 参考

1. https://blog.csdn.net/LostUnravel/article/details/121340933


# Print a page table (easy)

为了帮助您了解RISC-V页表，也许为了帮助将来的调试，您的第一个任务是编写一个打印页表内容的函数。




## 将vmprint的原型定义在kernel/defs.h中，


```
diff --git a/kernel/defs.h b/kernel/defs.h
index 4b9bbc0..52ef0d5 100644
--- a/kernel/defs.h
+++ b/kernel/defs.h
@@ -171,6 +171,7 @@ uint64          walkaddr(pagetable_t, uint64);
 int             copyout(pagetable_t, uint64, char *, uint64);
 int             copyin(pagetable_t, char *, uint64, uint64);
 int             copyinstr(pagetable_t, char *, uint64, uint64);
+ void            vmprint(pagetable_t);
```

## 然后在exec.c中调用它

```
diff --git a/kernel/exec.c b/kernel/exec.c
index 0e8762f..fc832f7 100644
--- a/kernel/exec.c
+++ b/kernel/exec.c
@@ -116,6 +116,9 @@ exec(char *path, char **argv)
   p->trapframe->sp = sp; // initial stack pointer
   proc_freepagetable(oldpagetable, oldsz);
 
+   if(p->pid==1) {
+     vmprint(p->pagetable);
+   }
   return argc; // this ends up in a0, the first argument to main(argc, argv)
 
  bad:
```

## 参考函数freewalk

```c
// Recursively free page-table pages.
// All leaf mappings must already have been removed.
void
freewalk(pagetable_t pagetable)
{
  // there are 2^9 = 512 PTEs in a page table.
  for(int i = 0; i < 512; i++){
    pte_t pte = pagetable[i];
    if((pte & PTE_V) && (pte & (PTE_R|PTE_W|PTE_X)) == 0){
      // this PTE points to a lower-level page table.
      uint64 child = PTE2PA(pte);
      freewalk((pagetable_t)child);
      pagetable[i] = 0;
    } else if(pte & PTE_V){
      panic("freewalk: leaf");
    }
  }
  kfree((void*)pagetable);
}
```
freewalk 函数的实现，用于释放页表及其下级页表的内存。

`if((pte & PTE_V) && (pte & (PTE_R|PTE_W|PTE_X)) == 0)`：

检查当前页表项是否有效（PTE_V 表示有效），并且该页表项不具有读、写或执行权限（即它指向一个下级页表）。

`else if(pte & PTE_V)`：

如果当前页表项有效但具有读、写或执行权限，则调用 panic 函数，输出错误信息 "freewalk: leaf"，表示该页表项是一个叶子节点，不应被释放

## 将vmprint()放在kernel/vm.c中

在printf调用中使用%p来打印像上面示例中的完成的64比特的十六进制PTE和地址

### 修改初版

写个雏形，体现思路，也就是从freewalk启发的改动
```
diff --git a/kernel/vm.c b/kernel/vm.c
index bccb405..ed8d315 100644
--- a/kernel/vm.c
+++ b/kernel/vm.c
@@ -440,3 +440,46 @@ copyinstr(pagetable_t pagetable, char *dst, uint64 srcva, uint64 max)
     return -1;
   }
 }
+
+void
+vmprint_sub(pagetable_t pagetable, int deep){
+  // there are 2^9 = 512 PTEs in a page table.
+
+  for(int i = 0; i < 512; i++){
+    pte_t pte = pagetable[i];
        
+    if((pte & PTE_V) && (pte & (PTE_R|PTE_W|PTE_X)) == 0){
+      // this PTE points to a lower-level page table.
+      uint64 child = PTE2PA(pte);
+
+      for(int j = 0; j <= deep; j++){
+        if(j)
          printf(" ");            
        printf("..");    
+      }
+      printf("%d: pte %p pa %p \n",i,pte,child);
+
+      vmprint_sub((pagetable_t)child, deep + 1);
      pagetable[i] = 0;    
+    } else if(pte & PTE_V){
+      // this PTE points to a lower-level page table.
+      uint64 child = PTE2PA(pte);
+
+      for(int j = 0; j <= deep; j++){
+        if(j)
          printf(" ");    
+        printf("..");
+      }
+      printf("%d: pte %p pa %p \n",i,pte,child);
+
+      continue;
+    }
+  }
+  // kfree((void*)pagetable);
+}
+
+void
+vmprint(pagetable_t pagetable){
+  printf("page table %p \n", pagetable);
+  vmprint_sub(pagetable, 0);
+}
\ No newline at end of file
```


### 优化整理代码

简化分支结构

```
diff --git a/kernel/vm.c b/kernel/vm.c
index bccb405..8137b05 100644
--- a/kernel/vm.c
+++ b/kernel/vm.c
@@ -440,3 +440,40 @@ copyinstr(pagetable_t pagetable, char *dst, uint64 srcva, uint64 max)
     return -1;
   }
 }
+
+  // there are 2^9 = 512 PTEs in a page table.
+
+  for(int i = 0; i < 512; i++){
+    pte_t pte = pagetable[i];
+
+    if(pte & PTE_V){
+      // this PTE points to a lower-level page table.
+      uint64 child = PTE2PA(pte);
+
+      for(int j = 0; j <= deep; j++){
+        if(j)
+          printf(" ");
+        printf("..");
+      }
+      printf("%d: pte %p pa %p\n",i,pte,child);
+
+      if((pte & (PTE_R|PTE_W|PTE_X)) == 0){
+        // this PTE points to a lower-level page table.
+        uint64 child = PTE2PA(pte);
+
+        vmprint_sub((pagetable_t)child, deep + 1);
+        // pagetable[i] = 0;
+      }
+    }
+
+  }
+  // kfree((void*)pagetable);
+}
+
+void
+vmprint(pagetable_t pagetable){
+  printf("page table %p\n", pagetable);
+  vmprint_sub(pagetable, 0);
+}
\ No newline at end of file
```

# A kernel page table per process (hard)

根据提示一步一步走

## 在struct proc中为进程的内核页表增加一个字段

```
diff --git a/kernel/proc.h b/kernel/proc.h
index 9c16ea7..481118f 100644
--- a/kernel/proc.h
+++ b/kernel/proc.h
@@ -98,6 +98,7 @@ struct proc {
   uint64 kstack;               // Virtual address of kernel stack
   uint64 sz;                   // Size of process memory (bytes)
   pagetable_t pagetable;       // User page table
+  pagetable_t prockpt;         // 进程的内核页表
   struct trapframe *trapframe; // data page for trampoline.S
   struct context context;      // swtch() here to run process
   struct file *ofile[NOFILE];  // Open files
```


## 实现一个修改版的kvminit，你将会考虑在allocproc中调用这个函数

原先的内核映射kvmmap写成的是固定参数, 只为kernel_pagetable作映射

添加一个功能一样的uvmmap函数，能传入不同的页表作为参数，不再是固定

```
diff --git a/kernel/vm.c b/kernel/vm.c
index 8137b05..0984442 100644
--- a/kernel/vm.c
+++ b/kernel/vm.c

@@ -121,6 +161,13 @@ kvmmap(uint64 va, uint64 pa, uint64 sz, int perm)
     panic("kvmmap");
 }
 
+void
+uvmmap(pagetable_t pagetable, uint64 va, uint64 pa, uint64 sz, int perm)
+{
+  if(mappages(pagetable, va, sz, pa, perm) != 0)
+    panic("uvmmap");
+}
+
 // translate a kernel virtual address to
 // a physical address. only needed for
 // addresses on the stack.

@@ -47,6 +49,37 @@ kvminit()
   kvmmap(TRAMPOLINE, (uint64)trampoline, PGSIZE, PTE_R | PTE_X);
 }
 
+pagetable_t
+prockptinit()
+{
+  pagetable_t prockpt = uvmcreate();
+  if(prockpt == 0) return 0;    //空指针
+
+  // uart registers
+  uvmmap(prockpt, UART0, UART0, PGSIZE, PTE_R | PTE_W);
+
+  // virtio mmio disk interface
+  uvmmap(prockpt, VIRTIO0, VIRTIO0, PGSIZE, PTE_R | PTE_W);
+
+  // CLINT
+  uvmmap(prockpt, CLINT, CLINT, 0x10000, PTE_R | PTE_W);
+
+  // PLIC
+  uvmmap(prockpt, PLIC, PLIC, 0x400000, PTE_R | PTE_W);
+
+  // map kernel text executable and read-only.
+  uvmmap(prockpt, KERNBASE, KERNBASE, (uint64)etext-KERNBASE, PTE_R | PTE_X);
+
+  // map kernel data and the physical RAM we'll make use of.
+  uvmmap(prockpt, (uint64)etext, (uint64)etext, PHYSTOP-(uint64)etext, PTE_R | PTE_W);
+
+  // map the trampoline for trap entry/exit to
+  // the highest virtual address in the kernel.
+  uvmmap(prockpt, TRAMPOLINE, (uint64)trampoline, PGSIZE, PTE_R | PTE_X);
+
+  return prockpt;
+}
+
 // Switch h/w page table register to the kernel's page table,
 // and enable paging.
 void

```

初始化一个进程的内核页表

确保每一个进程的内核页表都关于该进程的内核栈有一个映射。

在未修改的XV6中，所有的内核栈都在procinit中设置。

把这个功能部分或全部的迁移到allocproc中

```
diff --git a/kernel/proc.c b/kernel/proc.c
index dab1e1d..ad394df 100644
--- a/kernel/proc.c
+++ b/kernel/proc.c

@@ -34,14 +34,14 @@ procinit(void)
       // Allocate a page for the process's kernel stack.
       // Map it high in memory, followed by an invalid
       // guard page.
-      char *pa = kalloc();
-      if(pa == 0)
-        panic("kalloc");
-      uint64 va = KSTACK((int) (p - proc));
-      kvmmap(va, (uint64)pa, PGSIZE, PTE_R | PTE_W);
-      p->kstack = va;
+      // char *pa = kalloc();
+      // if(pa == 0)
+      //   panic("kalloc");
+      // uint64 va = KSTACK((int) (p - proc));
+      // kvmmap(va, (uint64)pa, PGSIZE, PTE_R | PTE_W);
+      // p->kstack = va;
   }
-  kvminithart();
+  // kvminithart();
 }
 
 // Must be called with interrupts disabled,

@@ -121,6 +121,21 @@ found:
     return 0;
   }
 
+  // 初始化一个进程的内核页表
+  p->prockpt = prockptinit();
+  if(p->prockpt == 0){
+    freeproc(p);
+    release(&p->lock);
+    return 0;
+  }  
+  
+  char *pa = kalloc();
+  if(pa == 0)
+    panic("kalloc");
+  uint64 va = KSTACK((int) (p - proc));
+  uvmmap(p->prockpt, va, (uint64)pa, PGSIZE, PTE_R | PTE_W);
+  p->kstack = va;
+
   // Set up new context to start executing at forkret,
   // which returns to user space.
   memset(&p->context, 0, sizeof(p->context));
```

## 修改scheduler()来加载进程的内核页表到核心的satp寄存器(参阅kvminithart来获取启发)

改写一个新函数uvminithart，同样是之前的问题，修改以能传入页表参数

```
diff --git a/kernel/vm.c b/kernel/vm.c
index 8137b05..0984442 100644
--- a/kernel/vm.c
+++ b/kernel/vm.c

@@ -56,6 +89,13 @@ kvminithart()
   sfence_vma();
 }
 
+void
+uvminithart(pagetable_t pagetable)
+{
+  w_satp(MAKE_SATP(pagetable));
+  sfence_vma();
+}
+
 // Return the address of the PTE in page table pagetable
 // that corresponds to virtual address va.  If alloc!=0,
 // create any required page-table pages.
```

## 没有进程运行时scheduler()应当使用kernel_pagetable

```
diff --git a/kernel/proc.c b/kernel/proc.c
index dab1e1d..ad394df 100644
--- a/kernel/proc.c
+++ b/kernel/proc.c

@@ -473,8 +513,13 @@ scheduler(void)
         // before jumping back to us.
         p->state = RUNNING;
         c->proc = p;
+
+        uvminithart(p->prockpt);
+
         swtch(&c->context, &p->context);
 
+        kvminithart();
+
         // Process is done running for now.
         // It should have changed its p->state before coming back.
         c->proc = 0;
```

## 你需要一种方法来释放页表，而不必释放叶子物理内存页面, 在freeproc中释放一个进程的内核页表

```
diff --git a/kernel/proc.c b/kernel/proc.c
index dab1e1d..ad394df 100644
--- a/kernel/proc.c
+++ b/kernel/proc.c

@@ -130,6 +145,26 @@ found:
   return p;
 }
 
+void
+freeprockpt(pagetable_t prockpt)
+{
+  // similar to the freewalk method
+  // there are 2^9 = 512 PTEs in a page table.
+  for(int i = 0; i < 512; i++){
+    pte_t pte = prockpt[i];
+    if((pte & PTE_V) && (pte & (PTE_R|PTE_W|PTE_X)) == 0){
+      // this PTE points to a lower-level page table.
+      uint64 child = PTE2PA(pte);
+      freeprockpt((pagetable_t)child);
+      prockpt[i] = 0;
+    } else if(pte & PTE_V){
+      continue;
+    }
+  }
+  kfree((void*)prockpt);
+}
+
+
 // free a proc structure and the data hanging from it,
 // including user pages.
 // p->lock must be held.

@@ -143,6 +178,11 @@ freeproc(struct proc *p)
     proc_freepagetable(p->pagetable, p->sz);
   p->pagetable = 0;
   p->sz = 0;
+  if(p->prockpt){
+    uvmunmap(p->prockpt, p->kstack, 1, 1);
+    freeprockpt(p->prockpt);
+  }
+  p->prockpt = 0;
   p->pid = 0;
   p->parent = 0;
   p->name[0] = 0;

```

## 将需要的函数定义添加到 kernel/defs.h 中

```
diff --git a/kernel/defs.h b/kernel/defs.h
index ebc4cad..2e302d5 100644
--- a/kernel/defs.h
+++ b/kernel/defs.h
@@ -159,9 +159,12 @@ int             uartgetc(void);
 
 // vm.c
 void            kvminit(void);
+pagetable_t     prockptinit(void);
 void            kvminithart(void);
+void            uvminithart(pagetable_t);
 uint64          kvmpa(uint64);
 void            kvmmap(uint64, uint64, uint64, int);
+void            uvmmap(pagetable_t, uint64, uint64, uint64, int);
 int             mappages(pagetable_t, uint64, uint64, uint64, int);
 pagetable_t     uvmcreate(void);
 void            uvminit(pagetable_t, uchar *, uint);
```

## 修改 kvmpa() 函数

kvmpa() 函数用于将内核虚拟地址转换为物理地址, 其中调用 walk() 函数时使用了全局的内核页表. 此时需要换位当前进程的内核页表

若不进行改动会出现 panic: kvmpa 或者 virtio_disk_intr status 的错误

```
diff --git a/kernel/vm.c b/kernel/vm.c
index 8137b05..0984442 100644
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

@@ -132,7 +179,8 @@ kvmpa(uint64 va)
   pte_t *pte;
   uint64 pa;
   
-  pte = walk(kernel_pagetable, va, 0);
+  // pte = walk(kernel_pagetable, va, 0);
+  pte = walk(myproc()->prockpt, va, 0);
   if(pte == 0)
     panic("kvmpa");
   if((*pte & PTE_V) == 0)
   
```


# Simplify copyin/copyinstr（hard）

## 将定义在kernel/vm.c中的copyin的主题内容替换为对copyin_new的调用

（在kernel/vmcopyin.c中定义）

对copyinstr和copyinstr_new执行相同的操作。

```
diff --git a/kernel/vm.c b/kernel/vm.c
index 0984442..ad8ca06 100644
--- a/kernel/vm.c
+++ b/kernel/vm.c

@@ -427,23 +427,7 @@ copyout(pagetable_t pagetable, uint64 dstva, char *src, uint64 len)
 int
 copyin(pagetable_t pagetable, char *dst, uint64 srcva, uint64 len)
 {
-  uint64 n, va0, pa0;
-
-  while(len > 0){
-    va0 = PGROUNDDOWN(srcva);
-    pa0 = walkaddr(pagetable, va0);
-    if(pa0 == 0)
-      return -1;
-    n = PGSIZE - (srcva - va0);
-    if(n > len)
-      n = len;
-    memmove(dst, (void *)(pa0 + (srcva - va0)), n);
-
-    len -= n;
-    dst += n;
-    srcva = va0 + PGSIZE;
-  }
-  return 0;
+  return copyin_new(pagetable, dst, srcva, len);
 }
 
 // Copy a null-terminated string from user to kernel.
@@ -453,40 +437,7 @@ copyin(pagetable_t pagetable, char *dst, uint64 srcva, uint64 len)
 int
 copyinstr(pagetable_t pagetable, char *dst, uint64 srcva, uint64 max)
 {
-  uint64 n, va0, pa0;
-  int got_null = 0;
-
-  while(got_null == 0 && max > 0){
-    va0 = PGROUNDDOWN(srcva);
-    pa0 = walkaddr(pagetable, va0);
-    if(pa0 == 0)
-      return -1;
-    n = PGSIZE - (srcva - va0);
-    if(n > max)
-      n = max;
-
-    char *p = (char *) (pa0 + (srcva - va0));
-    while(n > 0){
-      if(*p == '\0'){
-        *dst = '\0';
-        got_null = 1;
-        break;
-      } else {
-        *dst = *p;
-      }
-      --n;
-      --max;
-      p++;
-      dst++;
-    }
-
-    srcva = va0 + PGSIZE;
-  }
-  if(got_null){
-    return 0;
-  } else {
-    return -1;
-  }
+  return copyinstr_new(pagetable, dst, srcva, max);
 }
 
 void
```

## 在内核更改进程的用户映射的每一处，都以相同的方式更改进程的内核页表。

包括fork(), exec(), 和sbrk().

既然如此使用相同的方式，先写一个复制函数

### 复制函数

```
diff --git a/kernel/vm.c b/kernel/vm.c
index 0984442..ad8ca06 100644
--- a/kernel/vm.c
+++ b/kernel/vm.c

@@ -524,4 +475,27 @@ void
 vmprint(pagetable_t pagetable){
   printf("page table %p\n", pagetable);
   vmprint_sub(pagetable, 0);
+}
+
+int u2kvmcopy(pagetable_t upagetable, pagetable_t kpagetable, uint64 begin, uint64 end) {
+    pte_t *pte;
+    uint64 pa, i;
+    uint flags;
+    uint64 begin_page = PGROUNDUP(begin);    // 向上取整
+    for(i = begin_page; i < end; i += PGSIZE){
+        if((pte = walk(upagetable, i, 0)) == 0)
+            panic("uvmcopy2kvm: pte should exist");
+        if((*pte & PTE_V) == 0)
+            panic("uvmcopy2kvm: page not present");
+        pa = PTE2PA(*pte);
+        flags = PTE_FLAGS(*pte) & (~PTE_U); // clear PTE_U flag
+        if(mappages(kpagetable, i, PGSIZE, pa, flags) != 0){
+            goto err;
+        }
+    }
+    return 0;
+
+err:
+    uvmunmap(kpagetable, begin_page, (i- begin_page) / PGSIZE, 0);
+    return -1;
 }
\ No newline at end of file
```

### 添加到fork()

```
diff --git a/kernel/proc.c b/kernel/proc.c
index ad394df..9e246cd 100644
--- a/kernel/proc.c
+++ b/kernel/proc.c

@@ -315,6 +326,12 @@ fork(void)
   }
   np->sz = p->sz;
 
+  if(u2kvmcopy(np->pagetable, np->prockpt, 0, np->sz) < 0) {
+    freeproc(np);
+    release(&np->lock);
+    return -1;
+  }
+
   np->parent = p;
 
   // copy saved user registers.
```

### 添加到exec()

```
diff --git a/kernel/exec.c b/kernel/exec.c
index fc832f7..f97826b 100644
--- a/kernel/exec.c
+++ b/kernel/exec.c

@@ -116,6 +116,11 @@ exec(char *path, char **argv)
   p->trapframe->sp = sp; // initial stack pointer
   proc_freepagetable(oldpagetable, oldsz);
 
+  uvmunmap(p->prockpt, 0, PGROUNDUP(oldsz)/PGSIZE, 0);
+  if(u2kvmcopy(p->pagetable, p->prockpt, 0, p->sz) < 0){
+      goto bad;
+  }
+
   if(p->pid==1) {
     vmprint(p->pagetable);
   }
```

### 修改 growproc()

sbrk() 函数即系统调用 sys_brk() 函数, 最终会调用 kernel/proc.c 中的 growproc() 函数, 用来增长或减少虚拟内存空间

```
diff --git a/kernel/proc.c b/kernel/proc.c
index ad394df..9e246cd 100644
--- a/kernel/proc.c
+++ b/kernel/proc.c

@@ -283,11 +285,20 @@ growproc(int n)
 
   sz = p->sz;
   if(n > 0){
+    if ((sz + n) > PLIC){
+      return -1;
+    }
     if((sz = uvmalloc(p->pagetable, sz, sz + n)) == 0) {
       return -1;
     }
+    if(u2kvmcopy(p->pagetable, p->prockpt, p->sz, sz) < 0){
+      return -1;
+    }
   } else if(n < 0){
     sz = uvmdealloc(p->pagetable, sz, sz + n);
+    if (PGROUNDUP(sz) < PGROUNDUP(p->sz)) {
+      uvmunmap(p->prockpt, PGROUNDUP(sz), (PGROUNDUP(p->sz) - PGROUNDUP(sz)) / PGSIZE, 0);
+    }
   }
   p->sz = sz;
   return 0;
```

### 修改userinit()

userinit() 的作用是初始化 xv6 启动的第一个用户进程, 进程的加载是独立的, 需要将其用户页表拷贝到内核页表.

```
diff --git a/kernel/proc.c b/kernel/proc.c
index ad394df..9e246cd 100644
--- a/kernel/proc.c
+++ b/kernel/proc.c
@@ -261,6 +261,8 @@ userinit(void)
   uvminit(p->pagetable, initcode, sizeof(initcode));
   p->sz = PGSIZE;
 
+  u2kvmcopy(p->pagetable, p->prockpt, 0, p->sz);
+  
   // prepare for the very first "return" from kernel to user.
   p->trapframe->epc = 0;      // user program counter
   p->trapframe->sp = PGSIZE;  // user stack pointer
```

## 将需要的函数定义添加到 kernel/defs.h 中

```
diff --git a/kernel/defs.h b/kernel/defs.h
index 2e302d5..33f1ff5 100644
--- a/kernel/defs.h
+++ b/kernel/defs.h
@@ -182,6 +182,11 @@ int             copyout(pagetable_t, uint64, char *, uint64);
 int             copyin(pagetable_t, char *, uint64, uint64);
 int             copyinstr(pagetable_t, char *, uint64, uint64);
 void            vmprint(pagetable_t);
+int             u2kvmcopy(pagetable_t, pagetable_t, uint64, uint64);
+
+// vmcopyin.c
+int             copyin_new(pagetable_t, char *, uint64, uint64);
+int             copyinstr_new(pagetable_t, char *, uint64, uint64);
 
 // plic.c
 void            plicinit(void);
```

## 

```
diff --git a/kernel/vm.c b/kernel/vm.c
index 0984442..ad8ca06 100644
--- a/kernel/vm.c
+++ b/kernel/vm.c
@@ -62,7 +62,7 @@ prockptinit()
   uvmmap(prockpt, VIRTIO0, VIRTIO0, PGSIZE, PTE_R | PTE_W);
 
   // CLINT
-  uvmmap(prockpt, CLINT, CLINT, 0x10000, PTE_R | PTE_W);
+  // uvmmap(prockpt, CLINT, CLINT, 0x10000, PTE_R | PTE_W);
 
   // PLIC
   uvmmap(prockpt, PLIC, PLIC, 0x400000, PTE_R | PTE_W);
```