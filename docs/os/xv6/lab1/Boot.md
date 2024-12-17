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
