import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 产出「自包含」的构建结果：.next/standalone 里带有运行所需的最小 node_modules，
  // 服务器端无需安装依赖，只要有 Node 就能把服务跑起来。
  // 针对目标服务器内存较小（2 GiB）的部署形态：构建在 CI 上做，服务器只跑产物。
  output: "standalone",

  // 原生模块必须排除在打包之外：better-sqlite3 带 C++ 内核（包内是 .node 二进制），
  // 打包器会把它们转坏，运行时报「找不到模块」。列进白名单后按原样从 node_modules 加载。
  //
  // `@ffmpeg-installer/ffmpeg` 同理但原因不同：它不是一个普通的 JS 库，而是**一个定位二进制路径
  // 的壳**——运行时用 `require` 去找 `node_modules/@ffmpeg-installer/<平台>/ffmpeg`。
  // 一旦被内联进 chunk，那个相对路径就指到产物内部，spawn 直接 ENOENT。
  serverExternalPackages: ["better-sqlite3", "@ffmpeg-installer/ffmpeg"],

  // 二进制文件不会因为「有 import」就被打进 standalone 产物（追踪器只跟 JS/JSON），
  // 而线上机器**没有系统 ffmpeg 可兜底**（Alibaba Cloud Linux 3 的源里没有这个包）。
  // 所以显式把平台二进制包含进这条路由的产物里——《功能/音频提取》§七 第 6 条。
  outputFileTracingIncludes: {
    "/api/tools/audio-extract": ["./node_modules/@ffmpeg-installer/**"],
  },
};

export default nextConfig;
