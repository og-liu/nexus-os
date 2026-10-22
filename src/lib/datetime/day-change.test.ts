import { describe, expect, it } from "vitest";
import { retryDelayForAttempt } from "./day-change";

describe("跨天刷新的重试节奏", () => {
  it("第一次立刻重试（0ms）", () => {
    expect(retryDelayForAttempt(0)).toBe(0);
  });

  it("之后越等越久：5s → 20s → 60s", () => {
    expect(retryDelayForAttempt(1)).toBe(5_000);
    expect(retryDelayForAttempt(2)).toBe(20_000);
    expect(retryDelayForAttempt(3)).toBe(60_000);
  });

  it("四次之后放弃（返回 null），设备钟坏掉时不会每秒请求", () => {
    expect(retryDelayForAttempt(4)).toBeNull();
    expect(retryDelayForAttempt(99)).toBeNull();
  });
});
