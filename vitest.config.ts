import { defineConfig } from "vitest/config";
import path from "node:path";

// Vitest 配置：复用 tsconfig 的 @/ 路径别名，让测试里能直接 import "@/lib/db"。
// 测试文件与源码同目录、以 .test.ts(x) 结尾，便于就近维护。
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
