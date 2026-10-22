/**
 * 跨天刷新的重试节奏（《功能/日期时间面板》§七「跨天」）。
 *
 * 客户端发现「日期键变了」就去 `router.refresh()` 让服务端重算，但**浏览器钟可能比服务器快几秒**：
 * 第一次请求可能正好落在服务端午夜之前，拿回来的还是昨天的日期。所以第一次立刻试，
 * 没对上就按 5s / 20s / 60s 再试，最多四次——两端日期一旦对上就停止重试。
 *
 * 为什么不在第一次之后死等：客户端和服务器的钟差可能有一两分钟，单次请求大概率踩空；
 * 为什么要有上限：设备钟坏掉（差一天）时不能变成每秒一次请求。
 */
const RETRY_DELAYS_MS = [0, 5_000, 20_000, 60_000] as const;

/**
 * 第 `attempt` 次重试前要等多久（毫秒）；返回 `null` 表示次数用尽、这一天不再重试。
 * `attempt` 从 0 开始。
 */
export function retryDelayForAttempt(attempt: number): number | null {
  return RETRY_DELAYS_MS[attempt] ?? null;
}
