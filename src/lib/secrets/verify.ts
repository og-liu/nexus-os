/**
 * 密钥验活：保存的那一刻就问上游「这个 Key 能用吗」。
 *
 * 为什么非做不可：只校验「填了没有」是不够的——填一串乱码同样能通过，
 * 而抖音下载的解析缓存是全站共享的，于是「乱码 Key + 命中别人的缓存」
 * 照样能下载成功。用户会以为校验形同虚设，真正该报错的时候（解析新视频）
 * 却已经过了很久（2026-11-02 踩过两次：先是没配 Key 能用，再是错的 Key 能用）。
 *
 * 关键设计：**三态**，不是「对/错」两态。
 * - `ok`      上游明确接受
 * - `invalid` 上游明确拒绝（401/403）→ 不存
 * - `unknown` 验不了（网络、超时、上游 5xx）→ **照存**
 *
 * 为什么 unknown 要放行：不能因为 TikHub 挂了、或者用户网络抖了一下，
 * 就让人存不了 Key。那属于「我们没法判断」，不是「这个 Key 是坏的」。
 */

import { BROWSER_UA } from "@/lib/http";

/** 用户正盯着保存按钮，不能让它转太久。上游正常 200–800ms 就回。 */
const TIMEOUT_MS = 8_000;

export type VerifyResult =
  | { status: "ok" }
  | { status: "invalid"; message: string }
  | { status: "unknown" };

/**
 * 每个 provider 用哪个端点验活。
 *
 * 选端点的原则：**免费**、**轻**、**能直接反映 Key 有效性**。
 * - DeepSeek `/models` 是列模型清单，不消耗 token；
 * - TikHub `/tikhub/user/get_user_info` 是读账户信息，不计入接口调用费用。
 * 没有登记的类型直接放行（`unknown`）——宁可不验，也别因为没登记就挡住用户。
 */
const VERIFIERS: Record<string, string> = {
  deepseek: "https://api.deepseek.com/models",
  tikhub: "https://api.tikhub.io/api/v1/tikhub/user/get_user_info",
};

export async function verifySecret(providerId: string, value: string): Promise<VerifyResult> {
  const url = VERIFIERS[providerId];
  if (!url) return { status: "unknown" };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${value}`,
        // TikHub 前面是 Cloudflare：不带真实 UA 会被判成机器人，
        // 而且它返回的还是一句「token 无效」——完全误导（详见 lib/http.ts）
        "User-Agent": BROWSER_UA,
        Accept: "application/json",
      },
      signal: ctrl.signal,
    });

    if (res.ok) return { status: "ok" };

    if (res.status === 401 || res.status === 403) {
      return {
        status: "invalid",
        message: "这个 Key 无效或已过期，检查一下有没有复制全",
      };
    }

    // 429 / 5xx / 其它：不是 Key 的问题，按「验不了」处理
    return { status: "unknown" };
  } catch {
    // 超时、DNS、断网——同样不是 Key 的问题
    return { status: "unknown" };
  } finally {
    clearTimeout(timer);
  }
}
