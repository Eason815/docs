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