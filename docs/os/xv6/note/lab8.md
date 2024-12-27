# Memory allocator(moderate)

## 构造内存页 kmems 数组 & 修改 kinit()函数



```
diff --git a/kernel/kalloc.c b/kernel/kalloc.c
index fa6a0ac..a6203b2 100644
--- a/kernel/kalloc.c
+++ b/kernel/kalloc.c
@@ -21,12 +21,17 @@ struct run {
 struct {
   struct spinlock lock;
   struct run *freelist;
-} kmem;
+  char lockname[8]; 
+} kmem[NCPU];
 
 void
 kinit()
 {
-  initlock(&kmem.lock, "kmem");
+  char lockname[8];
+  for(int i = 0;i < NCPU; i++) {
+    snprintf(lockname, sizeof(lockname), "kmem_%d", i);
+    initlock(&kmem[i].lock, lockname);
+  }
   freerange(end, (void*)PHYSTOP);
 }
 
```

## 修改 kfree() 函数

```
diff --git a/kernel/kalloc.c b/kernel/kalloc.c
index fa6a0ac..a6203b2 100644
--- a/kernel/kalloc.c
+++ b/kernel/kalloc.c
@@ -56,10 +61,13 @@ kfree(void *pa)
 
   r = (struct run*)pa;
 
-  acquire(&kmem.lock);
-  r->next = kmem.freelist;
-  kmem.freelist = r;
-  release(&kmem.lock);
+  push_off();  //关中断
+  int id = cpuid();
+  acquire(&kmem[id].lock);
+  r->next = kmem[id].freelist;
+  kmem[id].freelist = r;
+  release(&kmem[id].lock);
+  pop_off();  //开中断
 }
 
 // Allocate one 4096-byte page of physical memory.
```

## 修改kalloc() 函数

```
diff --git a/kernel/kalloc.c b/kernel/kalloc.c
index fa6a0ac..a6203b2 100644
--- a/kernel/kalloc.c
+++ b/kernel/kalloc.c
@@ -70,11 +78,29 @@ kalloc(void)
 {
   struct run *r;
 
-  acquire(&kmem.lock);
-  r = kmem.freelist;
+  push_off();  //关中断
+  int id = cpuid();
+  acquire(&kmem[id].lock);
+  r = kmem[id].freelist;
   if(r)
-    kmem.freelist = r->next;
-  release(&kmem.lock);
+    kmem[id].freelist = r->next;
+  else {
+    int antid;
+    for(antid = 0; antid < NCPU; ++antid) {
+      if(antid == id)
+        continue;
+      acquire(&kmem[antid].lock);
+      r = kmem[antid].freelist;
+      if(r) {
+        kmem[antid].freelist = r->next;
+        release(&kmem[antid].lock);
+        break;
+      }
+      release(&kmem[antid].lock);
+    }
+  }
+  release(&kmem[id].lock);
+  pop_off();  //开中断
 
   if(r)
     memset((char*)r, 5, PGSIZE); // fill with junk
```


## 测试

```bash
init: starting sh
$ kalloctest
start test1
test1 results:
--- lock kmem/bcache stats
lock: bcache: #fetch-and-add 0 #acquire() 1264
--- top 5 contended locks:
lock: proc: #fetch-and-add 52012 #acquire() 230814
lock: proc: #fetch-and-add 8910 #acquire() 230800
lock: proc: #fetch-and-add 6730 #acquire() 230904
lock: proc: #fetch-and-add 6221 #acquire() 230800
lock: uart: #fetch-and-add 5804 #acquire() 99
tot= 0
test1 OK
start test2
total free number of pages: 32495 (out of 32768)
.....
test2 OK
$ usertests sbrkmuch
usertests starting
test sbrkmuch: OK
ALL TESTS PASSED
$ usertests
usertests starting
test manywrites: OK
test execout: OK
...
test forktest: OK
test bigdir: OK
ALL TESTS PASSED
```


# Buffer cache(hard)

将缓冲区的分配与回收并行化以提高效率

删除上一个实验多余的lockname

```
diff --git a/kernel/kalloc.c b/kernel/kalloc.c
index a6203b2..4cd47b5 100644
--- a/kernel/kalloc.c
+++ b/kernel/kalloc.c
@@ -21,7 +21,6 @@ struct run {
 struct {
   struct spinlock lock;
   struct run *freelist;
-  char lockname[8]; 
 } kmem[NCPU];
 
 void
```


## 定义哈希桶结构 & 修改binit()函数

删除全局缓冲区链表使用的头结点

```
diff --git a/kernel/bio.c b/kernel/bio.c
index 60d91a6..7593040 100644
--- a/kernel/bio.c
+++ b/kernel/bio.c
@@ -23,32 +23,49 @@
 #include "fs.h"
 #include "buf.h"
 
+#define NBUCKET 13
+#define HASH(id) (id % NBUCKET)
+
+struct hashbuf {
+  struct buf head;       // 头节点
+  struct spinlock lock;  // 锁
+};
+
 struct {
-  struct spinlock lock;
+  // struct spinlock lock;
   struct buf buf[NBUF];
+  struct hashbuf buckets[NBUCKET];  // 散列桶
 
   // Linked list of all buffers, through prev/next.
   // Sorted by how recently the buffer was used.
   // head.next is most recent, head.prev is least.
-  struct buf head;
+  // struct buf head;
 } bcache;
 
 void
 binit(void)
 {
   struct buf *b;
+  char lockname[16];
 
-  initlock(&bcache.lock, "bcache");
+  for(int i = 0; i < NBUCKET; ++i) {
+    // 初始化散列桶的自旋锁
+    snprintf(lockname, sizeof(lockname), "bcache_%d", i);
+    initlock(&bcache.buckets[i].lock, lockname);
+
+    // 初始化散列桶的头节点
+    bcache.buckets[i].head.prev = &bcache.buckets[i].head;
+    bcache.buckets[i].head.next = &bcache.buckets[i].head;
+  }
 
   // Create linked list of buffers
-  bcache.head.prev = &bcache.head;
-  bcache.head.next = &bcache.head;
   for(b = bcache.buf; b < bcache.buf+NBUF; b++){
-    b->next = bcache.head.next;
-    b->prev = &bcache.head;
+    // 利用头插法初始化缓冲区列表,全部放到散列桶0上
+    b->next = bcache.buckets[0].head.next;
+    b->prev = &bcache.buckets[0].head;
     initsleeplock(&b->lock, "buffer");
-    bcache.head.next->prev = b;
-    bcache.head.next = b;
+    bcache.buckets[0].head.next->prev = b;
+    bcache.buckets[0].head.next = b;
   }
 }
 
```


## 修改buf.h

提示中建议使用时间戳作为LRU判定的法则

这样就不需要在brelse中进行头插法来更改结点位置

```
diff --git a/kernel/buf.h b/kernel/buf.h
index 4616e9e..d4fbfa8 100644
--- a/kernel/buf.h
+++ b/kernel/buf.h
@@ -8,5 +8,6 @@ struct buf {
   struct buf *prev; // LRU cache list
   struct buf *next;
   uchar data[BSIZE];
+  uint timestamp;
 };
 
```

## 修改brelse()函数 & bpin()函数 & bunpin()函数

由原本的全局锁改为缓存块所在的 bucket 的锁

```
diff --git a/kernel/bio.c b/kernel/bio.c
index 60d91a6..7593040 100644
--- a/kernel/bio.c
+++ b/kernel/bio.c
@@ -119,35 +183,35 @@ brelse(struct buf *b)
   if(!holdingsleep(&b->lock))
     panic("brelse");
 
+  int bid = HASH(b->blockno);
+
   releasesleep(&b->lock);
 
-  acquire(&bcache.lock);
+  acquire(&bcache.buckets[bid].lock);
   b->refcnt--;
-  if (b->refcnt == 0) {
-    // no one is waiting for it.
-    b->next->prev = b->prev;
-    b->prev->next = b->next;
-    b->next = bcache.head.next;
-    b->prev = &bcache.head;
-    bcache.head.next->prev = b;
-    bcache.head.next = b;
-  }
-  
-  release(&bcache.lock);
+
+  // 更新时间戳
+  acquire(&tickslock);
+  b->timestamp = ticks;
+  release(&tickslock);
+
+  release(&bcache.buckets[bid].lock);
 }
 
 void
 bpin(struct buf *b) {
-  acquire(&bcache.lock);
+  int bid = HASH(b->blockno);
+  acquire(&bcache.buckets[bid].lock);
   b->refcnt++;
-  release(&bcache.lock);
+  release(&bcache.buckets[bid].lock);
 }
 
 void
 bunpin(struct buf *b) {
-  acquire(&bcache.lock);
+  int bid = HASH(b->blockno);
+  acquire(&bcache.buckets[bid].lock);
   b->refcnt--;
-  release(&bcache.lock);
+  release(&bcache.buckets[bid].lock);
 }
 
 
```


## 修改bget()函数

```
diff --git a/kernel/bio.c b/kernel/bio.c
index 60d91a6..7593040 100644
--- a/kernel/bio.c
+++ b/kernel/bio.c
@@ -60,31 +77,78 @@ bget(uint dev, uint blockno)
 {
   struct buf *b;
 
-  acquire(&bcache.lock);
+  int bid = HASH(blockno);
+  acquire(&bcache.buckets[bid].lock);
 
   // Is the block already cached?
-  for(b = bcache.head.next; b != &bcache.head; b = b->next){
-    if(b->dev == dev && b->blockno == blockno){
+  for(b = bcache.buckets[bid].head.next; b != &bcache.buckets[bid].head; b = b->next) {
+    if(b->dev == dev && b->blockno == blockno) {
       b->refcnt++;
-      release(&bcache.lock);
+
+      // 记录使用时间戳
+      acquire(&tickslock);
+      b->timestamp = ticks;
+      release(&tickslock);
+
+      release(&bcache.buckets[bid].lock);
       acquiresleep(&b->lock);
       return b;
     }
   }
 
   // Not cached.
+  b = 0;
+  struct buf* tmp;
+
   // Recycle the least recently used (LRU) unused buffer.
-  for(b = bcache.head.prev; b != &bcache.head; b = b->prev){
-    if(b->refcnt == 0) {
+  // 从当前散列桶开始查找
+  for(int i = bid, cycle = 0; cycle != NBUCKET; i = (i + 1) % NBUCKET) {
+    ++cycle;
+    // 如果遍历到当前散列桶，则不重新获取锁
+    if(i != bid) {
+      if(!holding(&bcache.buckets[i].lock))
+        acquire(&bcache.buckets[i].lock);
+      else
+        continue;
+    }
+
+    for(tmp = bcache.buckets[i].head.next; tmp != &bcache.buckets[i].head; tmp = tmp->next)
+      // 使用时间戳进行LRU算法，而不是根据结点在链表中的位置
+      if(tmp->refcnt == 0 && (b == 0 || tmp->timestamp < b->timestamp))
+        b = tmp;
+
+    if(b) {
+      // 如果是从其他散列桶窃取的，则将其以头插法插入到当前桶
+      if(i != bid) {
+        b->next->prev = b->prev;
+        b->prev->next = b->next;
+        release(&bcache.buckets[i].lock);
+
+        b->next = bcache.buckets[bid].head.next;
+        b->prev = &bcache.buckets[bid].head;
+        bcache.buckets[bid].head.next->prev = b;
+        bcache.buckets[bid].head.next = b;
+      }
+
       b->dev = dev;
       b->blockno = blockno;
       b->valid = 0;
       b->refcnt = 1;
-      release(&bcache.lock);
+
+      acquire(&tickslock);
+      b->timestamp = ticks;
+      release(&tickslock);
+
+      release(&bcache.buckets[bid].lock);
       acquiresleep(&b->lock);
       return b;
+    } else {
+      // 在当前散列桶中未找到，则直接释放锁
+      if(i != bid)
+        release(&bcache.buckets[i].lock);
     }
   }
+
   panic("bget: no buffers");
 }
 
```



## 测试

```bash
init: starting sh
$ bcachetest
start test0
test0 results:
--- lock kmem/bcache stats
--- top 5 contended locks:
lock: virtio_disk: #fetch-and-add 249724 #acquire() 1247
lock: proc: #fetch-and-add 132711 #acquire() 83123
lock: proc: #fetch-and-add 126557 #acquire() 83121
lock: proc: #fetch-and-add 100718 #acquire() 83123
lock: proc: #fetch-and-add 96184 #acquire() 83502
tot= 0
test0: OK
start test1
test1 OK
```
