import { beforeEach, describe, expect, it } from "vitest";
import {
  FAILURE_WINDOW_MS,
  LOCK_DURATION_MS,
  MAX_FAILURES,
  checkLock,
  clearFailures,
  describeWait,
  recordFailure,
  resetAllAttempts,
} from "./rate-limit";

const KEY = "user:alice";

describe("登录失败限流", () => {
  beforeEach(() => {
    resetAllAttempts();
  });

  it("一开始没有被锁", () => {
    expect(checkLock(KEY, 0)).toEqual({ locked: false, retryAfterMs: 0 });
  });

  it("失败次数没到阈值时不锁", () => {
    const now = 1_000_000;
    for (let i = 0; i < MAX_FAILURES - 1; i += 1) {
      recordFailure(KEY, now);
    }
    expect(checkLock(KEY, now).locked).toBe(false);
  });

  it("达到阈值即锁定，并在锁定期内一直锁定", () => {
    const now = 1_000_000;
    for (let i = 0; i < MAX_FAILURES; i += 1) {
      recordFailure(KEY, now);
    }

    const status = checkLock(KEY, now);
    expect(status.locked).toBe(true);
    expect(status.retryAfterMs).toBe(LOCK_DURATION_MS);
    expect(checkLock(KEY, now + LOCK_DURATION_MS - 1).locked).toBe(true);
  });

  it("锁定期结束后自动解锁", () => {
    const now = 1_000_000;
    for (let i = 0; i < MAX_FAILURES; i += 1) recordFailure(KEY, now);
    expect(checkLock(KEY, now + LOCK_DURATION_MS + 1).locked).toBe(false);
  });

  it("统计窗口过后失败次数重新计算（偶尔手误不会累加一辈子）", () => {
    const now = 1_000_000;
    recordFailure(KEY, now);
    recordFailure(KEY, now + FAILURE_WINDOW_MS + 1);
    recordFailure(KEY, now + FAILURE_WINDOW_MS + 2);
    recordFailure(KEY, now + FAILURE_WINDOW_MS + 3);
    expect(checkLock(KEY, now + FAILURE_WINDOW_MS + 3).locked).toBe(false);
  });

  it("成功登录后清零计数", () => {
    const now = 1_000_000;
    for (let i = 0; i < MAX_FAILURES - 1; i += 1) recordFailure(KEY, now);
    clearFailures(KEY);
    for (let i = 0; i < MAX_FAILURES - 1; i += 1) recordFailure(KEY, now);
    expect(checkLock(KEY, now).locked).toBe(false);
  });

  it("不同 key 互不影响（一个账号被锁不牵连别人）", () => {
    const now = 1_000_000;
    for (let i = 0; i < MAX_FAILURES; i += 1) recordFailure(KEY, now);
    expect(checkLock(KEY, now).locked).toBe(true);
    expect(checkLock("user:bob", now).locked).toBe(false);
  });

  it("剩余时间说成人话：至少 1 分钟", () => {
    expect(describeWait(LOCK_DURATION_MS)).toBe("15 分钟");
    expect(describeWait(1000)).toBe("1 分钟");
  });
});
