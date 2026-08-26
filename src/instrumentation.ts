// Next.js 服务端启动钩子：进程起来时顺带启动订阅源定时器。
//
// instrumentation.ts 是 Next.js 官方约定的文件名，register() 在
// 服务器启动时执行一次（dev 与 start 都生效），是挂进程级初始化的正规入口。
// NEXT_RUNTIME 判断：这段代码可能在 Edge 运行时被加载，
// node-cron / better-sqlite3 只能活在 Node.js 里，必须按运行时分流。

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startFeedScheduler } = await import("@/lib/feeds/scheduler");
    startFeedScheduler();
  }
}
