# Boot xv6 (Easy)

## 实验任务

安装VMware + Ubuntu + Qemu + xv6

- VMware 16.2.5
- Ubuntu 24.04.1
- Qemu 5.1.0
- xv6-LABS-2020

## 1.安装VMware + Ubuntu
...

## 2.配置静态网络

```bash
sudo apt install net-tools
sudo apt install vim
sudo vim /etc/netplan/01-netcfg.yaml
```

增加内容(对应VMware进行配置)
```yaml
network:
  version: 2
  ethernets:
    ens33:  # 替换为你的网络接口名称
      dhcp4: no
      addresses:
        - 192.168.10.129/24  # 静态 IP 地址
      gateway4: 192.168.10.2  # NAT 网关地址
      nameservers:
        addresses:
          - 8.8.8.8  # Google DNS
          - 8.8.4.4
```


应用配置
```bash
sudo netplan apply
```

验证连通性
```bash
ping 192.168.10.2
ping www.baidu.com
```

界面设置 Wire -> ipv4->Manual

安装git
```bash
sudo apt install git
```
## 3.安装Qemu5.1

选择在work文件夹下操作(可任意)
```bash
mkdir work
cd work
```


下载解压
```bash
wget http://sources.buildroot.net/qemu/qemu-5.1.0.tar.xz
tar xf qemu-5.1.0.tar.xz
cd qemu-5.1.0
```


安装依赖
```bash
sudo apt-get install git build-essential gdb-multiarch qemu-system-misc gcc-riscv64-linux-gnu binutils-riscv64-linux-gnu 
```
```bash
sudo apt-get install libglib2.0-dev
sudo apt-get install libpixman-1-dev
```


编译安装
```bash
./configure --disable-kvm --disable-werror --prefix=/usr/local --target-list="riscv64-softmmu"
```
```bash
make
sudo make install
```


## 4.安装xv6

```bash
cd ..
git clone git://g.csail.mit.edu/xv6-labs-2020
cd xv6-labs-2020
git checkout util
```

编译启动

```bash
make qemu
```


若出现runcmd报错:

可在57行插入

```
diff --git a/user/sh.c b/user/sh.c
index 83dd513..c96dab0 100644
--- a/user/sh.c
+++ b/user/sh.c
@@ -54,6 +54,7 @@ void panic(char*);
 struct cmd *parsecmd(char*);
 
 // Execute cmd.  Never returns.
 __attribute__((noreturn))
 void
 runcmd(struct cmd *cmd)
 {
```

重新编译启动


## 5.配置git 绑定远程仓库(可选)
```bash
git config --global user.name "Your Name"
git config --global user.email "your_email@example.com"
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"
cat ~/.ssh/id_rsa.pub (拷贝至github)
```
后续见 http://xv6.dgs.zone/labs/use_git/git1.html


## 6.配置vscode ssh(推荐)
```bash
sudo apt install openssh-server
sudo systemctl start ssh
sudo systemctl enable ssh
sudo ufw allow ssh
```

vscode桌面端:

安装Remote SSH插件

+(ssh eason@192.168.10.129)

# Sleep (Easy)

每次将程序添加到Makefile中的UPROGS中

完成之后，make qemu将编译程序，可以从xv6的shell运行

Easy

```c
#include "kernel/types.h"
#include "kernel/stat.h"
#include "user/user.h"

int main(int argc, char *argv[]){
    if(argc != 2){
        fprintf(2,"Usage: sleep <ticks>\n");
        exit(1);
    }

    int ticks = atoi(argv[1]);
    if(ticks <= 0){
        fprintf(2,"Invalid number of ticks.\n");
        exit(1);
    }

    sleep(ticks);
    exit(0);
}
```

# Pingpong (Easy)

## pipe() System call

picture from https://www.geeksforgeeks.org/pipe-system-call/

![pic](/xv6/lab1/Process.jpg)

## Wait System Call in C

见 https://www.geeksforgeeks.org/wait-system-call-c/

```c
#include "kernel/types.h"
#include "kernel/stat.h"
#include "user/user.h"

#define MSG 32

int main(int argc, char *argv[]){

    int p[2];
    char buf[MSG];
    pipe(p);

    int pid = fork();

    if(pid > 0){
        write(p[1],"ping",MSG);
        wait(0);
        read(p[0],buf,MSG); fprintf(1,"%d: received %s\n",getpid(),buf);
    }else if(pid == 0){
        read(p[0],buf,MSG); fprintf(1,"%d: received %s\n",getpid(),buf);
        write(p[1],"pong",MSG);
    }else{
        fprintf(2,"fork error\n");
        exit(1);
    }
    exit(0);
}
```

# Primes (Moderate/Hard)

见 https://swtch.com/~rsc/thread/

![pic](/xv6/lab1/sieve1.gif)

每个矩形即代表一个管道pipe

```
p = get a number from left neighbor
print p
loop:
    n = get a number from left neighbor
    if (p does not divide n)
        send n to right neighbor
```

```c
#include "kernel/types.h"
#include "kernel/stat.h"
#include "user/user.h"

#define MAX 36

int init1(){
    int p[2];
    pipe(p);
    //子线程
    if(fork()==0){
        for(int i=2;i<MAX;i++){
            write(p[1],&i,sizeof(int));
        }
        close(p[1]);
        exit(0);
    }
    //父线程
    close(p[1]);
    return p[0];
}

int prime_filter(int in,int prime){
    int num;
    int p[2];
    pipe(p);
    //子线程
    if(fork()==0){
        while(read(in,&num,sizeof(int))){
            if(num%prime){
                write(p[1],&num,sizeof(int));
            }
        }
        close(in);
        close(p[1]);
        exit(0);
    }
    //父线程
    close(in);
    close(p[1]);
    return p[0];
}

int main(int argc, char *argv[]){
    int in = init1();
    int prime;
    while(read(in,&prime,sizeof(int))){
        fprintf(1,"prime %d\n",prime);
        in = prime_filter(in,prime);
    }

    exit(0);
}
```




# find (Moderate)

根据`ls.c`改编 
理清源代码逻辑即可
找到字符串结束符，(搜索中的目录地址)->字符串，加上除了不要在“.”和“..”目录中递归
一直递归，那就只需在一处(当前目录匹配时)输出

```c
#include "kernel/types.h"
#include "kernel/stat.h"
#include "user/user.h"
#include "kernel/fs.h"

char* fmtname(char *path)
{
    char *p;
    // Find first character after last slash.
    for(p=path+strlen(path); p >= path && *p != '/'; p--)
        ;
    p++;
    return p;
}

void find(char *path, char *tar)
{
    char buf[512], *p;
    int fd;
    struct dirent de;
    struct stat st;

    if((fd = open(path, 0)) < 0){
        fprintf(2, "find: cannot open %s\n", path);
        return;
    }

    if(fstat(fd, &st) < 0){
        fprintf(2, "find: cannot stat %s\n", path);
        close(fd);
        return;
    }


    switch(st.type){
    case T_FILE:
        if(strcmp(fmtname(path),tar)==0){
            printf("%s\n",path);
        }
        close(fd);  // close很重要
        return; 

    case T_DIR:
        if(strcmp(fmtname(path),tar)==0){
            printf("%s\n",path);
        }
        
        if(strlen(path) + 1 + DIRSIZ + 1 > sizeof buf){
            printf("find: path too long\n");
            break;
        }
        strcpy(buf, path);
        p = buf+strlen(buf);
        *p++ = '/'; // 补充路径'/'
        while(read(fd, &de, sizeof(de)) == sizeof(de)){
            if(de.inum == 0)
                continue;
            memmove(p, de.name, DIRSIZ);
            p[DIRSIZ] = 0;// 字符串结束符


            if(strcmp(de.name,".")==0 || strcmp(de.name, "..")==0){
                continue;
            }

            find(buf,tar);
        }
        break;
    }
    close(fd);
}

int main(int argc, char *argv[]){
    if(argc < 3){
        fprintf(2,"Usage: find <path> <filename>\n");
        exit(1);
    }
    find(argv[1],argv[2]);
    exit(0);
}

```

# xargs (Moderate)

## 分析

例 `echo hello too | xargs echo bye`

在命令中：

`echo hello too`会输出`hello too`到标准输出。

`|`将前一个命令的输出作为后一个命令的输入。

`xargs echo bye`会从标准输入读取这些参数，并将它们与`echo bye`组合在一起。

```c
#include "kernel/types.h"
#include "kernel/stat.h"
#include "user/user.h"
#include "kernel/param.h"  // MAXARG

int main(int argc, char *argv[]){	
    if(argc <= 1){
		fprintf(2, "usage: xargs <command> [argv...]\n");
		exit(1);
	}

	char buf[2048], ch;
	char *p = buf;
	char *v[MAXARG];
	int c;
	int blanks = 0;
	int offset = 0;

	for (c = 1; c < argc; c++) {
		v[c-1] = argv[c];
	}
	--c;

	while (read(0, &ch, 1) > 0) {
		if (ch == ' ' || ch == '\t') {
			blanks++;
			continue;
		}

		if (blanks) {  
			buf[offset++] = 0;
			v[c++] = p;
			p = buf + offset;
			blanks = 0;
		}

		if (ch != '\n') {
			buf[offset++] = ch;
		} else {
			v[c++] = p;
			p = buf + offset;

			if (!fork()) {
				exit(exec(v[0], v));
			}
			wait(0);
			c = argc - 1;
		}
	}
	exit(0);
}
```




## 程序执行流程

1. 命令行参数:
- 当 xargs 被调用时，程序的 argv 数组会如下：
    - argv[0] = "xargs"
    - argv[1] = "echo"
    - argv[2] = "bye"

2. 初始化变量:

- `c`被初始化为参数的数量，即 2（echo 和 bye）。

- `buf`是一个字符缓冲区，用于存储从标准输入读取的字符。

- `p`是一个指针，指向 buf 的开始。

- `offset`用于记录当前在 buf 中写入的位置。

- `blanks` 用于记录空格的数量。

3. 读取标准输入:

- 程序进入`while (read(0, &ch, 1) > 0)`循环，逐字符读取来自管道的输入。这是从`echo hello too`输出传递来的。


4. 处理输入字符:
- 第一个字符 'h' 被读取，is_blank 返回 false，程序将 ch 存入 buf，更新 offset。

- 接下来读取字符 'e', 'l', 'l', 'o'，依次存入 buf。

- 读取到空格字符 ' '，is_blank 返回 true，blanks 计数器增加。

- 然后读取字符 't', 'o', 'o'，依次存入 buf。

5. 处理空格到有效字符的转换:
- 当读取到空格时，程序会记录空格的存在，并在下一次遇到字符时，将buf的当前内容结束（通过插入 '\0'），将 buf 中的内容（如 "hello"）添加到 v 中，指向参数列表中的下一个位置。

6. 读取到换行符:

- 当读取到换行符 '\n' 时，程序会将最后一个参数（"too"）添加到 v 中。
- `v` 此时的内容是：
    - v[0] = "echo"
    - v[1] = "bye"
    - v[2] = buf 指向的地址（"hello"）
    - v[3] = buf + offset（指向 "too"）

7. 创建子进程并执行命令:
- 程序调用 fork() 创建一个子进程。

- 子进程执行 exec(v[0], v)，相当于执行 exec("echo", ["echo", "bye", "hello", "too"])。

- 这样，命令行的最终效果是输出：

```
bye hello too
```

8. 等待子进程完成:
- 父进程通过 wait(0) 等待子进程的完成。
- 之后，程序重置参数计数 c 为 1（只保留命令部分），以便后续可能的输入处理。

## 总结

`xargs`通过读取标准输入参数，将它们与指定的命令结合，产生了一个新的命令行输出。

管道`|`左边运行的结果能顺利进入标准输入(read(0)读取) ，加入到右边命令的参数(main读取)后面