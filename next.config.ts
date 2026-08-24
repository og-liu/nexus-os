import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 是带 C++ 内核的原生模块，必须让 Next 用原生 require 加载、
  // 不做打包，否则 Turbopack（Next 16 dev 默认打包器）会在运行时把它转坏，
  // 导致 new Database(...) 崩溃。
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;