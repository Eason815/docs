# Implement copy-on write (hard)

## 1. 构造 COW 物理页的引用计数结构

使用数组来记录每个物理页的对应的引用数

数组中的不同元素即不同物理页的引用计数之间不存在并发问题

对每一个物理页的引用计数对应一个自旋锁(不断轮询检查以自旋解锁)

引用计数相关的加1和减1的函数

```
diff --git a/kernel/kalloc.c b/kernel/kalloc.c
index fa6a0ac..6d5c626 100644
--- a/kernel/kalloc.c
+++ b/kernel/kalloc.c
@@ -23,6 +23,33 @@ struct {
   struct run *freelist;
 } kmem;
 
+struct {
+  uint8 ref_cnt;
+  struct spinlock lock;
+} cows[(PHYSTOP - KERNBASE) >> 12];
+
+void increfcnt(uint64 pa) {
+  if (pa < KERNBASE) {
+    return;
+  }
+  pa = (pa - KERNBASE) >> 12;
+  acquire(&cows[pa].lock);
+  ++cows[pa].ref_cnt;
+  release(&cows[pa].lock);
+}
+
+uint8 decrefcnt(uint64 pa) {
+  uint8 ret;
+  if (pa < KERNBASE) {
+    return 0;
+  }
+  pa = (pa - KERNBASE) >> 12;
+  acquire(&cows[pa].lock);
+  ret = --cows[pa].ref_cnt;
+  release(&cows[pa].lock);
+  return ret;
+}
+
 void
 kinit()
 {
```

`def.h`中定义


```
diff --git a/kernel/defs.h b/kernel/defs.h
index 4b9bbc0..1017ce2 100644
--- a/kernel/defs.h
+++ b/kernel/defs.h
@@ -63,6 +63,9 @@ void            ramdiskrw(struct buf*);
 void*           kalloc(void);
 void            kfree(void *);
 void            kinit(void);
+void            increfcnt(uint64 pa);
+uint8           decrefcnt(uint64 pa);
+
 
 // log.c
 void            initlog(int, struct superblock*);
```

## 2. 定义 COW 标志位

需要对应的虚拟页的 PTE 的标记位进行区分

用于在引发 page fault 时识别出是 COW 机制, 并进行新物理页的分配

```
diff --git a/kernel/riscv.h b/kernel/riscv.h
index 0aec003..d1daadc 100644
--- a/kernel/riscv.h
+++ b/kernel/riscv.h
@@ -331,6 +331,7 @@ sfence_vma()
 #define PTE_W (1L << 2)
 #define PTE_X (1L << 3)
 #define PTE_U (1L << 4) // 1 -> user can access
+#define PTE_COW (1L << 8)
 
 // shift a physical address to the right place for a PTE.
 #define PA2PTE(pa) ((((uint64)pa) >> 12) << 10)
```

## 3. 修改uvmcopy()函数

uvmcopy() 函数用于在 fork() 时子进程拷贝父进程的用户页表

将原本的kalloc()分配去掉

最后需要调用 increfcnt() 对当前物理页的引用计数加 1
```
diff --git a/kernel/vm.c b/kernel/vm.c
index bccb405..f3ac758 100644
--- a/kernel/vm.c
+++ b/kernel/vm.c
@@ -311,7 +347,7 @@ uvmcopy(pagetable_t old, pagetable_t new, uint64 sz)
   pte_t *pte;
   uint64 pa, i;
   uint flags;
-  char *mem;
+  // char *mem;
 
   for(i = 0; i < sz; i += PGSIZE){
     if((pte = walk(old, i, 0)) == 0)
@@ -319,14 +355,16 @@ uvmcopy(pagetable_t old, pagetable_t new, uint64 sz)
     if((*pte & PTE_V) == 0)
       panic("uvmcopy: page not present");
     pa = PTE2PA(*pte);
-    flags = PTE_FLAGS(*pte);
-    if((mem = kalloc()) == 0)
-      goto err;
-    memmove(mem, (char*)pa, PGSIZE);
-    if(mappages(new, i, PGSIZE, (uint64)mem, flags) != 0){
-      kfree(mem);
+    flags = (PTE_FLAGS(*pte) & (~PTE_W)) | PTE_COW;
+    *pte = PA2PTE(pa) | flags;
+    // if((mem = kalloc()) == 0)
+    //   goto err;
+    // memmove(mem, (char*)pa, PGSIZE);
+    if(mappages(new, i, PGSIZE, (uint64)pa, flags) != 0){
+      // kfree(mem);
       goto err;
     }
+    increfcnt(pa); 
   }
   return 0;
```

## 4. 实现 COW 机制

修改 usertrap() 和 copyout() 两个函数, 来对 COW 的页进行处理

原本是进行的分别实现, 但实际上需要的操作处理是一致的, 因此构造了函数 walkcowaddr() 进行了统一处理

```
diff --git a/kernel/vm.c b/kernel/vm.c
index bccb405..f3ac758 100644
--- a/kernel/vm.c
+++ b/kernel/vm.c
@@ -111,6 +111,42 @@ walkaddr(pagetable_t pagetable, uint64 va)
   return pa;
 }
 
+uint64 walkcowaddr(pagetable_t pagetable, uint64 va) {
+  pte_t *pte;
+  uint64 pa;
+  char* mem;
+  uint flags;
+
+  if (va >= MAXVA)
+    return 0;
+
+  pte = walk(pagetable, va, 0);
+  if (pte == 0)
+      return 0;
+  if ((*pte & PTE_V) == 0)
+      return 0;
+  if ((*pte & PTE_U) == 0)
+    return 0;
+  pa = PTE2PA(*pte);
+  if ((*pte & PTE_W) == 0) {
+    if ((*pte & PTE_COW) == 0) {
+        return 0;
+    }
+    if ((mem = kalloc()) == 0) {
+      return 0;
+    }
+    memmove(mem, (void*)pa, PGSIZE);
+    flags = (PTE_FLAGS(*pte) & (~PTE_COW)) | PTE_W;
+    uvmunmap(pagetable, PGROUNDDOWN(va), 1, 1);
+    if (mappages(pagetable, PGROUNDDOWN(va), PGSIZE, (uint64)mem, flags) != 0) {
+      kfree(mem);
+      return 0;
+    }
+    return (uint64)mem;
+  }
+  return pa;
+}
+
 // add a mapping to the kernel page table.
 // only used when booting.
 // does not flush TLB or enable paging.
```

`def.h`中定义
```
diff --git a/kernel/defs.h b/kernel/defs.h
index 4b9bbc0..1017ce2 100644
--- a/kernel/defs.h
+++ b/kernel/defs.h
@@ -171,6 +174,7 @@ uint64          walkaddr(pagetable_t, uint64);
 int             copyout(pagetable_t, uint64, char *, uint64);
 int             copyin(pagetable_t, char *, uint64, uint64);
 int             copyinstr(pagetable_t, char *, uint64, uint64);
+uint64          walkcowaddr(pagetable_t, uint64);
 
 // plic.c
 void            plicinit(void);
```

写好 walkcowaddr() 函数后, 在 usertrap() 和 copyout() 中调用

只考虑 r_scause()==15 的条件, 因为只有在 store 指令写操作时触发 page fault 才考虑 COW 机制

```
diff --git a/kernel/trap.c b/kernel/trap.c
index a63249e..9308a90 100644
--- a/kernel/trap.c
+++ b/kernel/trap.c
@@ -67,6 +67,12 @@ usertrap(void)
     syscall();
   } else if((which_dev = devintr()) != 0){
     // ok
+  } else if(r_scause() == 15){
+    if (walkcowaddr(p->pagetable, r_stval()) == 0) {
+      printf("usertrap(): unexpected scause %p pid=%d\n", r_scause(), p->pid);
+      printf("            sepc=%p stval=%p\n", r_sepc(), r_stval());
+      p->killed = 1;
+    }
   } else {
     printf("usertrap(): unexpected scause %p pid=%d\n", r_scause(), p->pid);
     printf("            sepc=%p stval=%p\n", r_sepc(), r_stval());
```

copyout() 函数只需将 walkaddr() 改为 walkcowaddr()

```
diff --git a/kernel/vm.c b/kernel/vm.c
index bccb405..f3ac758 100644
--- a/kernel/vm.c
+++ b/kernel/vm.c
@@ -358,7 +396,7 @@ copyout(pagetable_t pagetable, uint64 dstva, char *src, uint64 len)
 
   while(len > 0){
     va0 = PGROUNDDOWN(dstva);
-    pa0 = walkaddr(pagetable, va0);
+    pa0 = walkcowaddr(pagetable, va0);
     if(pa0 == 0)
       return -1;
     n = PGSIZE - (dstva - va0);
```

## 5. 引用计数相关函数

1. freerange() 函数

该函数被 kinit() 函数调用，其主要作用是将物理内存空间中未使用的部分以物理页划分，并调用 kfree() 将其添加至 kmem.freelist 中。

2. kfree() 函数

用于物理页的释放.

在真正将物理页回收到 kmem.freelist 前, 需要对物理页的引用计数减 1, 并判断是否为 0

若不为0直接返回不回收, 为0进行回收

3. kalloc() 函数

调用该函数时, 表明需要将一个物理页分配给一个进程, 并对应一虚拟页

故需要调用 increfcnt() 函数对引用计数加 1, 即从原本的 0 加至 1

```
diff --git a/kernel/kalloc.c b/kernel/kalloc.c
index fa6a0ac..6d5c626 100644
--- a/kernel/kalloc.c
+++ b/kernel/kalloc.c
@@ -35,8 +62,10 @@ freerange(void *pa_start, void *pa_end)
 {
   char *p;
   p = (char*)PGROUNDUP((uint64)pa_start);
-  for(; p + PGSIZE <= (char*)pa_end; p += PGSIZE)
+  for(; p + PGSIZE <= (char*)pa_end; p += PGSIZE){
+    increfcnt((uint64)p); 
     kfree(p);
+  }
 }
 
 // Free the page of physical memory pointed at by v,
@@ -51,6 +80,9 @@ kfree(void *pa)
   if(((uint64)pa % PGSIZE) != 0 || (char*)pa < end || (uint64)pa >= PHYSTOP)
     panic("kfree");
 
+  if (decrefcnt((uint64) pa)) {
+    return;
+  }
   // Fill with junk to catch dangling refs.
   memset(pa, 1, PGSIZE);
 
@@ -75,6 +107,8 @@ kalloc(void)
   if(r)
     kmem.freelist = r->next;
   release(&kmem.lock);
+  
+  increfcnt((uint64)r);
 
   if(r)
     memset((char*)r, 5, PGSIZE); // fill with junk
```

## 测试

cowtest测试

```bash
init: starting sh
$ cowtest
simple: ok
simple: ok
three: ok
three: ok
three: ok
file: ok
ALL COW TESTS PASSED
```

usertests测试

```bash
$ usertests
usertests starting
...
test bigfile: OK
test dirfile: OK
test iref: OK
test forktest: OK
test bigdir: OK
ALL TESTS PASSED
```