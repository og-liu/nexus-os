import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Vitest 配置（《技术栈说明》§3.6）。
 * - 跑在 node 环境：被测代码都是纯逻辑与数据库，不需要 DOM
 * - 用例与被测文件同目录：`src/**\/*.test.ts`
 * - 复用 tsconfig 的 `@/*` 别名，测试里的 import 与源码一致
 * - 数据库测试一律用内存库（`:memory:`），不碰磁盘上的真实数据文件
 *
 * `server-only` 的别名为什么必须有：这个包靠 `exports` 的 `react-server` 条件区分两幅面孔——
 * 打包器认这个条件时给的是空文件，Node 默认条件拿到的是**一 import 就抛错**的 index.js。
 * 数据访问文件加上 `import "server-only"` 之后，它们的同目录单测跑在 Node 里就会当场炸。
 * 测试不是「客户端组件」，指到包自带的空实现即可（Next 构建时拿到的也正是这个文件）。
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
});
