import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 产出「自包含」的构建结果：.next/standalone 里带有运行所需的最小 node_modules，
  // 服务器端无需安装依赖，只要有 Node 就能把服务跑起来。
  // 针对目标服务器内存较小（2 GiB）的部署形态：构建在 CI 上做，服务器只跑产物。
  output: "standalone",

  // 原生模块必须排除在打包之外：better-sqlite3 带 C++ 内核（包内是 .node 二进制），
  // 打包器会把它们转坏，运行时报「找不到模块」。列进白名单后按原样从 node_modules 加载。
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
