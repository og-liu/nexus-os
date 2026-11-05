import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 产出「自包含」的构建结果：.next/standalone 里带有运行所需的最小 node_modules，
  // 服务器端无需安装依赖，只要有 Node 就能把服务跑起来。
  // 针对目标服务器内存较小（2 GiB）的部署形态：构建在 CI 上做，服务器只跑产物。
  output: "standalone",

  // 关掉 Next 的开发指示器。它是一颗「深灰圆 + 白色 N」，跟音乐悬浮球几乎一模一样：
  // 留着它，页面上就有两颗长得一样的球，用户分不清哪颗能点。
  //
  // 本来想用 `devIndicators: { position: 'top-right' }` 摆开，**实测在 Next 16.3.1 上不生效**
  // （配置合法、重启过、硬刷新过，球始终在左下角）——而左下角正好压住侧边栏底部的
  // 用户菜单。所以干脆关掉：这个指示器只是「编译状态 / 路由信息」，生产环境本来就不渲染，
  // 而悬浮球的样式是照它复刻的（features/music-player/README.md §2.4），视觉上没有损失。
  // 想把它开回来：删掉这一行即可（会回到左下角那颗）。
  devIndicators: false,

  // 原生模块必须排除在打包之外：better-sqlite3 带 C++ 内核（包内是 .node 二进制），
  // 打包器会把它们转坏，运行时报「找不到模块」。列进白名单后按原样从 node_modules 加载。
  //
  // `@ffmpeg-installer/ffmpeg` 同理但原因不同：它不是一个普通的 JS 库，而是**一个定位二进制路径
  // 的壳**——运行时用 `require` 去找 `node_modules/@ffmpeg-installer/<平台>/ffmpeg`。
  // 一旦被内联进 chunk，那个相对路径就指到产物内部，spawn 直接 ENOENT。
  serverExternalPackages: ["better-sqlite3", "@ffmpeg-installer/ffmpeg"],

  // 二进制文件不会因为「有 import」就被打进 standalone 产物（追踪器只跟 JS/JSON），
  // 而线上机器**没有系统 ffmpeg 可兜底**（Alibaba Cloud Linux 3 的源里没有这个包）。
  // 所以显式把平台二进制包含进这些路由的产物里——features/audio-extract/README.md §七 第 6 条、
  // features/music-player/README.md §七（上传时要用 ffmpeg 探编码与时长，同一个坑）。
  //
  // **新增一个 spawn ffmpeg 的路由，就要在这里加一行**；漏了的表现是「本地正常、
  // 线上传歌必失败」，因为开发机的 node_modules 里二进制一直都在。
  outputFileTracingIncludes: {
    "/api/tools/audio-extract": ["./node_modules/@ffmpeg-installer/**"],
    "/api/tools/music-player/tracks": ["./node_modules/@ffmpeg-installer/**"],
  },
};

export default nextConfig;
