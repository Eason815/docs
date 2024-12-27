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