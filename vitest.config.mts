import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Vitest 配置（《技术栈说明》§3.6）。
 * - 跑在 node 环境：被测代码都是纯逻辑与数据库，不需要 DOM
 * - 用例与被测文件同目录：`src/**\/*.test.ts`
 * - 复用 tsconfig 的 `@/*` 别名，测试里的 import 与源码一致
 * - 数据库测试一律用内存库（`:memory:`），不碰磁盘上的真实数据文件
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
