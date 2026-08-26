// 订阅源的进程内定时器：让 Next.js 服务器自己「长出」一个闹钟。
//
// 为什么选进程内 cron 而不是系统 crontab：
// - 系统级定时（crontab/launchd）要额外配置操作系统，部署到别处就失效；
// - 进程内方案代码即配置，dev 和 start 都能跑，个人单机场景完全够用。
// 取舍：多实例部署会重复抓（个人应用单实例，无此问题）；服务器没开就不抓
// （对个人知识库来说，机器关了本来也看不到新文章）。

import cron from "node-cron";
import { getDb } from "@/lib/db";
import { refreshAllFeeds } from "./store";

/** 每小时整点跑一轮（cron 五段表达式：分 时 日 月 周） */
const CRON_EXPR = "0 * * * *";

/**
 * 启动订阅源定时刷新。幂等——重复调用不会注册多个闹钟。
 *
 * 为什么需要 globalThis 守卫：Next.js dev 模式下模块可能被重新加载，
 * 直接用模块级变量存状态会随热重载丢失，导致同一进程里挂多个定时器，
 * 每小时抓 N 遍。globalThis 是真正的全局对象，跨模块重载存活。
 */
export function startFeedScheduler(): void {
  const g = globalThis as unknown as {
    __nexusFeedSchedulerStarted?: boolean;
  };
  if (g.__nexusFeedSchedulerStarted) return;
  g.__nexusFeedSchedulerStarted = true;

  cron.schedule(CRON_EXPR, async () => {
    try {
      const r = await refreshAllFeeds(getDb());
      if (r.added > 0 || r.failed > 0) {
        console.log(
          `[feeds] 定时刷新完成: 成功${r.ok} 失败${r.failed} 新增${r.added}篇 跳过${r.skipped}篇`,
        );
      }
    } catch (err) {
      // 定时任务绝不能把进程搞崩：所有异常就地消化
      console.warn("[feeds] 定时刷新异常:", err);
    }
  });

  console.log(`[feeds] 定时刷新已启动 (${CRON_EXPR})`);
}
