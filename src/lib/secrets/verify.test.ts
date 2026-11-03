import { afterEach, describe, expect, it, vi } from "vitest";
import { verifySecret } from "./verify";

/** 把 fetch 固定成某个状态码；也可以直接抛错，模拟断网/超时 */
function stubFetch(result: number | Error) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (result instanceof Error) throw result;
      return new Response("{}", { status: result });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifySecret", () => {
  it("上游 200 → ok", async () => {
    stubFetch(200);
    expect(await verifySecret("tikhub", "real-key")).toEqual({ status: "ok" });
  });

  it("上游 401 → invalid（Key 无效，不该存）", async () => {
    stubFetch(401);
    const result = await verifySecret("tikhub", "bad-key");
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") expect(result.message).toContain("无效");
  });

  it("上游 403 → invalid", async () => {
    stubFetch(403);
    expect((await verifySecret("deepseek", "bad-key")).status).toBe("invalid");
  });

  it("上游 500 → unknown（上游故障不等于 Key 坏了，要放行）", async () => {
    stubFetch(500);
    expect(await verifySecret("tikhub", "maybe-good")).toEqual({ status: "unknown" });
  });

  it("429 限流 → unknown，别把用户挡在门外", async () => {
    stubFetch(429);
    expect(await verifySecret("deepseek", "maybe-good")).toEqual({ status: "unknown" });
  });

  it("断网 / 超时 → unknown", async () => {
    stubFetch(new Error("fetch failed"));
    expect(await verifySecret("tikhub", "maybe-good")).toEqual({ status: "unknown" });
  });

  it("没登记验活端点的类型 → unknown（宁可不验，也别挡住）", async () => {
    stubFetch(200);
    expect(await verifySecret("some-future-provider", "x")).toEqual({ status: "unknown" });
  });

  it("请求带上了 Authorization 和真实 UA（TikHub 的 Cloudflare 会拒默认指纹）", async () => {
    stubFetch(200);
    await verifySecret("tikhub", "abc123");

    const call = vi.mocked(fetch).mock.calls[0];
    const init = call[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer abc123");
    expect(headers["User-Agent"]).toContain("Chrome");
  });
});
