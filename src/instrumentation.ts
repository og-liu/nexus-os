/**
 * 进程启动钩子（Next 的 instrumentation 约定：`register()` 在新实例启动时调用一次，
 * 而且**必须完成**才开始接请求）。
 *
 * 这里只做一件事：**把数据库连接建起来，顺带跑完建表和迁移**。
 *
 * 为什么非做不可：建表原本是「懒」的——`getDb()` 第一次被调用时才建。而
 * `getCurrentUser()` 在没有 cookie 时直接返回 `null`，根本不碰数据库，于是
 * **一个没人登录的新版本，表根本没建出来**。线上 0.12.0 首次部署就踩到了：
 * 服务起来了、页面能开，但 `sqlite_master` 里找不到 `douyin_videos` / `user_secrets`，
 * 要等第一次真实登录才建（2026-11-03）。
 *
 * 启动即建，代价是启动多几十毫秒，换来的是「表结构不对时服务根本起不来」——
 * 问题在发布那一刻暴露，而不是等用户点进某个页面才炸。
 */
export async function register() {
  // Edge 运行时读不了本地 SQLite（`node:fs` / better-sqlite3 都不在），只在 Node 侧做。
  // 项目的 API 路由都声明的 nodejs runtime，这层判断是防御性的。
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // 动态 import：静态 import 会把 better-sqlite3 拖进 Edge 的依赖图
  const { getDb } = await import("@/lib/auth/db");
  getDb();
}
