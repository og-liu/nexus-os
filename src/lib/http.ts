/**
 * 对外 HTTP 请求共用的常量（目前只有一个 UA）。
 *
 * 为什么非带不可：TikHub 前面挂着 Cloudflare，Node 的 undici 默认指纹会撞上
 * `Error 1010 browser_signature_banned`——更坑的是它把响应体伪装成「token 无效」，
 * 让你以为是自己 Key 写错了（2026-11-02 踩过）。带一个真实 Chrome UA 就正常。
 * 抖音 CDN 对没有 UA 的请求也更挑剔，所以两处共用同一份。
 *
 * 换掉它之前先确认这两家还放行。
 */
export const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
