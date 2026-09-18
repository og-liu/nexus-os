// 订阅源定时器的冒烟测试（测试补强清单 P0 项：防 K5 漏装 node-cron 事故复发）。
//
// 背景：历史上曾只装了 @types/node-cron（类型包）、漏装 node-cron 本体——
// tsc 有类型所以绿、单测从没 import 过 scheduler 所以也绿，直到 dev server
// 启动加载 instrumentation 才炸 MODULE_NOT_FOUND（docs/changelog.md d3f4d52 的教训：
// 「从未被执行的模块是 tsc 和单测共同的盲区」）。
// 本测试的价值：在 pnpm test 阶段真实 import scheduler 与 instrumentation 入口，
// 把这条链路拉进自动化射程，堵住「依赖漏装 + 入口报错」两类回归。
//
// 断言只到「依赖在位、入口可调、注册行为形状正确」，不追求业务覆盖率。
// cron.schedule 全部被 spy 拦截：不挂真实定时器、不留进程尾巴，
// 定时回调永远不会执行，也就不会碰 DB 与嵌入 API。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import cron from "node-cron";

import { startFeedScheduler } from "./scheduler";
import { register } from "@/instrumentation";

/** 与 scheduler 内 CRON_EXPR 同源：每小时整点跑一轮 */
const HOURLY_CRON = "0 * * * *";

/** globalThis 单例守卫是 scheduler 内部状态，用例之间需手动复位 */
function resetSchedulerGuard(): void {
  const g = globalThis as unknown as { __nexusFeedSchedulerStarted?: boolean };
  delete g.__nexusFeedSchedulerStarted;
}

describe("feeds 定时器冒烟", () => {
  const savedRuntime = process.env.NEXT_RUNTIME;

  beforeEach(() => {
    resetSchedulerGuard();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetSchedulerGuard();
    // 还原环境变量，避免用例间互相污染
    if (savedRuntime === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = savedRuntime;
  });

  it("node-cron 运行时依赖在位且导出形状完整", () => {
    // 真实 node-cron 可被 import = 漏装事故未复发（只有类型包是过不了这行的）
    expect(cron).toBeDefined();
    expect(typeof cron.schedule).toBe("function");
    expect(typeof cron.validate).toBe("function");
    // 生产用的表达式必须合法，防止改动 cron 表达式引入笔误
    expect(cron.validate(HOURLY_CRON)).toBe(true);
  });

  it("startFeedScheduler 可导入，且通过 cron.schedule 注册整点任务", () => {
    expect(typeof startFeedScheduler).toBe("function");

    const spy = vi
      .spyOn(cron, "schedule")
      .mockReturnValue(undefined as never); // 拦截真实挂载，不给测试进程留定时器

    startFeedScheduler();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(HOURLY_CRON, expect.any(Function));
  });

  it("globalThis 守卫保证幂等：重复调用不会注册多个定时器", () => {
    const spy = vi.spyOn(cron, "schedule").mockReturnValue(undefined as never);

    startFeedScheduler();
    startFeedScheduler();
    startFeedScheduler();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("instrumentation.register 入口可调；非 nodejs 运行时静默跳过不挂定时器", async () => {
    const spy = vi.spyOn(cron, "schedule").mockReturnValue(undefined as never);
    delete process.env.NEXT_RUNTIME; // vitest 环境无 NEXT_RUNTIME，等价于 Edge 分支

    await register();

    expect(spy).not.toHaveBeenCalled();
  });

  it("NEXT_RUNTIME=nodejs 全链路：register → startFeedScheduler → cron.schedule", async () => {
    const spy = vi.spyOn(cron, "schedule").mockReturnValue(undefined as never);
    process.env.NEXT_RUNTIME = "nodejs";

    await register();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(HOURLY_CRON, expect.any(Function));
  });
});
