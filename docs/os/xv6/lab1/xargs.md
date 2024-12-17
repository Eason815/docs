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