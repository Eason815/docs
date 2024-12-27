import { defineConfig } from 'vitepress'
// import { set_sidebar } from "./utils/auto_gen_sidebar.mjs";	// 改成自己的路径

// https://vitepress.dev/reference/site-config
export default defineConfig({
  base: "/docs/",
  head: [["link", { rel: "icon", href: "/docs/logo.jpg" }]],
  title: "Eason815的文档站",
  description: "-",
  themeConfig: {
    outlineTitle: "文章目录",
    outline: [2,6],
    logo:'/logo.jpg',
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },

      {
        text: 'OS',
        items: [
          { text: 'xv6', link: '/os/xv6/' },
          { text: '408', link: '/os/408' },
        ]
      },

      // { text: 'Examples', link: '/examples/' }
    ],

    // sidebar: {
    //   '/examples/': [
    //     {
    //       text: 'Examples',
    //       items: [
    //         { text: 'Markdown Examples', link: '/examples/markdown-examples' },
    //         { text: 'Runtime API Examples', link: '/examples/api-examples' }
    //       ]
    //     }
    //   ]
    // },
    sidebar: { 
      // "/examples/": set_sidebar("/examples"), 
      '/os/xv6/': [
        {
          text: '计算机操作系统', link: '/os/xv6/index'
        },
        {
          text: 'Lab1: Xv6 and Unix utilities',
          link: '/os/xv6/lab1/index',
          collapsed: false,
          items: [
            { text: 'Boot xv6', link: '/os/xv6/lab1/1' },
            { text: 'Sleep', link: '/os/xv6/lab1/2' },
            { text: 'Pingpong', link: '/os/xv6/lab1/3' },
            { text: 'Primes', link: '/os/xv6/lab1/4' },
            { text: 'Find', link: '/os/xv6/lab1/5' },
            { text: 'Xargs', link: '/os/xv6/lab1/6' },
          ]
        },
        {
          text: 'Lab2: system calls',
          link: '/os/xv6/lab2/index',
          collapsed: false,
          items: [
            { text: 'System call tracing', link: '/os/xv6/lab2/1' },
            { text: 'Sysinfo', link: '/os/xv6/lab2/2' },
          ]
        },
        {
          text: 'Lab3: page tables',
          link: '/os/xv6/lab3/index',
          collapsed: false,
          items: [
            { text: 'Print a page table', link: '/os/xv6/lab3/1' },
            { text: 'A kernel page table per process', link: '/os/xv6/lab3/2' },
            { text: 'Simplify copyin/copyinstr', link: '/os/xv6/lab3/3' },
          ]
        },
        {
          text: 'Lab4: traps',
          link: '/os/xv6/lab4/index',
          collapsed: false,
          items: [
            { text: 'RISC-V assembly', link: '/os/xv6/lab4/1' },
            { text: 'Backtrace', link: '/os/xv6/lab4/2' },
            { text: 'Alarm', link: '/os/xv6/lab4/3' },
          ]
        },
        {
          text: 'Lab5: xv6 lazy page allocation',
          link: '/os/xv6/lab5/index',
          collapsed: false,
          items: [
            { text: 'Eliminate allocation from sbrk()', link: '/os/xv6/lab5/1' },
            { text: 'Lazy allocation', link: '/os/xv6/lab5/2' },
            { text: 'Lazytests and Usertests', link: '/os/xv6/lab5/3' },
          ]
        },
        {
          text: 'Lab6: Copy-on-Write Fork for xv6',
          link: '/os/xv6/lab6/index',
          collapsed: false,
          items: [
            { text: 'Implement copy-on write', link: '/os/xv6/lab6/1' },
          ]
        },
        {
          text: 'Lab7: Multithreading',
          link: '/os/xv6/lab7/index',
          collapsed: false,
          items: [
            { text: 'Uthread: switching between threads', link: '/os/xv6/lab7/1' },
            { text: 'Using threads', link: '/os/xv6/lab7/2' },
            { text: 'Barrier', link: '/os/xv6/lab7/3' },
          ]
        },
        {
          text: 'Lab8: locks',
          link: '/os/xv6/lab8/index',
          collapsed: false,
          items: [
            { text: 'Memory allocator', link: '/os/xv6/lab8/1' },
            { text: 'Buffer cache', link: '/os/xv6/lab8/2' },
          ]
        },
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/Eason815' }
    ],

    footer: {
      copyright:"Copyright © 2024 By Eason815"
    },

    // 设置搜索框的样式
    search: {
      provider: "local",
      options: {
        translations: {
          button: {
            buttonText: "搜索文档",
            buttonAriaLabel: "搜索文档",
          },
          modal: {
            noResultsText: "无法找到相关结果",
            resetButtonTitle: "清除查询条件",
            footer: {
              selectText: "选择",
              navigateText: "切换",
            },
          },
        },
      },
    },
  },
})
