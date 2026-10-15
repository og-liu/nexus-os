/**
 * 登录失败限流（进程内计数）。
 *
 * 为什么第一版就要有：登录接口是**在线**猜密码的入口，没有限流，攻击者可以每秒试上千次。
 *
 * 已知的边界（写进文档，不是遗漏）：
 * - 计在内存里，**进程重启即清零**；多实例部署时各算各的。当前是单机单进程，够用。
 * - 按用户名锁定意味着别人可以故意输错来「锁住」某个账号。这是限流的固有代价；
 *   个人工作空间场景下，锁 15 分钟比敞开门让人慢慢试更划算。
 */

/** 窗口内允许的连续失败次数，超过即锁定。 */
export const MAX_FAILURES = 5;
/** 失败计数的统计窗口。 */
export const FAILURE_WINDOW_MS = 15 * 60 * 1000;
/** 触发后的锁定时长。 */
export const LOCK_DURATION_MS = 15 * 60 * 1000;

interface Attempt {
  failures: number;
  windowStartedAt: number;
  lockedUntil: number;
}

const attempts = new Map<string, Attempt>();

export interface LockStatus {
  locked: boolean;
  /** 还需等待多久（毫秒）。未锁定时为 0。 */
  retryAfterMs: number;
}

function isExpired(attempt: Attempt, now: number): boolean {
  return (
    attempt.lockedUntil <= now && now - attempt.windowStartedAt > FAILURE_WINDOW_MS
  );
}

/** 查询某个 key（用户名或 IP）当前是否被锁。 */
export function checkLock(key: string, now = Date.now()): LockStatus {
  const attempt = attempts.get(key);
  if (!attempt) return { locked: false, retryAfterMs: 0 };

  if (attempt.lockedUntil > now) {
    return { locked: true, retryAfterMs: attempt.lockedUntil - now };
  }

  if (isExpired(attempt, now)) attempts.delete(key);
  return { locked: false, retryAfterMs: 0 };
}

/** 记一次失败。达到阈值时开始锁定。 */
export function recordFailure(key: string, now = Date.now()): void {
  const attempt = attempts.get(key);

  if (!attempt || isExpired(attempt, now) || attempt.failures === 0) {
    attempts.set(key, { failures: 1, windowStartedAt: now, lockedUntil: 0 });
    return;
  }

  attempt.failures += 1;
  if (attempt.failures >= MAX_FAILURES) {
    attempt.lockedUntil = now + LOCK_DURATION_MS;
  }
}

/** 成功登录后清零——否则正常用户攒够几次手误也会被锁。 */
export function clearFailures(key: string): void {
  attempts.delete(key);
}

/** 把剩余等待时间说成人话。 */
export function describeWait(retryAfterMs: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60000));
  return `${minutes} 分钟`;
}

/** 仅供测试：清空全部计数。 */
export function resetAllAttempts(): void {
  attempts.clear();
}
