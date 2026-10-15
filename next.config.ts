import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 产出「自包含」的构建结果：.next/standalone 里带有运行所需的最小 node_modules，
  // 服务器端无需安装依赖，只要有 Node 就能把服务跑起来。
  // 针对目标服务器内存较小（2 GiB）的部署形态：构建在 CI 上做，服务器只跑产物。
  output: "standalone",
};

export default nextConfig;
