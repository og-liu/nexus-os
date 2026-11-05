/**
 * TikHub 适配器（features/douyin-download/README.md §四、§五）。
 *
 * **全站唯一一处碰 TikHub HTTP 的地方。** 业务代码只调 `resolveVideo()` /
 * `resolveVideoById()`，将来换供应商就只改这个文件。
 *
 * 四条实测结论写死在这里，别改回去（都是 2026-11-02 用真 token 跑出来的）：
 *
 * 1. **必须带一个正常的浏览器 UA**。TikHub 前面挡着 Cloudflare，Node 默认的
 *    `undici` 指纹会被 `Error 1010 browser_signature_banned` 拒掉，响应体看着像
 *    「token 无效」，其实是客户端被拦。带上 Chrome UA 就 200。
 * 2. **图文作品的 play_addr 是配乐 mp3**。`aweme_type = 68` 的作品，`video.play_addr`
 *    指向 `ies-music/xxx.mp3`，照下会得到一个 1 MB 的音频。只有 `aweme_type === 0`
 *    才是视频。
 * 3. **响应是数组不是对象**。这个端点给的是 `data.aweme_details`（复数，数组）；
 *    作品被平台过滤时数组为空、另有 `filter_list: [{ aweme_id, reason }]`。
 * 4. **`has_watermark` 字段不可信**：实测返回 `true` 的视频，下回来的流画面是干净的。
 *    它描述的是原片状态，不是我们拿到的这条地址——别拿它做判断或给用户提示。
 */

/** TikHub 的 API 根地址。文档要求走 `api.tikhub.io`（不要用 `api.tikhub.dev`）。 */
const TIKHUB_BASE = "https://api.tikhub.io/api/v1";

/**
 * 抖音网页版在用的 Chrome UA。
 * 已提升到 `@/lib/http`（TikHub 验活也要用同一份）——这里 import 是给本文件用，
 * export 是让老引用（下载路由）继续能从这里拿。
 */
import { BROWSER_UA } from "@/lib/http";

export { BROWSER_UA };

/** 上游一般 2–7 秒返回；15 秒还没动静就当失败，别让 Route Handler 一直挂着。 */
const TIMEOUT_MS = 15_000;

/** 解析出来的视频（已经扁平化成这个工具要用的形状）。 */
export interface DouyinVideo {
  awemeId: string;
  title: string;
  author: string;
  coverUrl: string;
  durationMs: number;
  /** 抖音 CDN 直链。会过期，下载失败时由调用方决定要不要重新解析。 */
  playUrl: string;
}

/** 失败原因。每个码对应界面上一句人话，见 `message`。 */
export type DouyinErrorCode = "no-key" | "not-found" | "not-a-video" | "timeout" | "upstream";

export class DouyinError extends Error {
  constructor(
    readonly code: DouyinErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DouyinError";
  }
}

/** 上游响应里我们关心的那几个字段。全部可选——结构变了要能降级失败而不是崩。 */
interface AwemeDetail {
  aweme_id?: string;
  aweme_type?: number;
  desc?: string;
  duration?: number;
  images?: unknown[] | null;
  author?: { nickname?: string };
  video?: {
    play_addr?: { url_list?: string[] };
    cover?: { url_list?: string[] };
  };
}

interface ApiPayload {
  code?: number;
  data?: {
    aweme_detail?: AwemeDetail | null;
    aweme_details?: AwemeDetail[] | null;
  } | null;
}

/**
 * 把上游 HTTP 状态翻成人话。
 *
 * 402 是「余额/免费额度不够」——TikHub 按次扣费，额度用尽就是这个码；
 * 401/403 一起归到 `no-key`，因为界面上要做的动作相同（去检查 Key）。
 */
function errorFromStatus(status: number): DouyinError {
  if (status === 401 || status === 403) {
    // 文案别再说「检查 TIKHUB_API_KEY」——Key 早已改成每个用户自己在设置页填，
    // 那个环境变量不存在了（BYOK 改造后的残留，2026-11-03 修正）。
    // 前端认 `no-key` 这个码，会自己带一个「去设置」的入口。
    return new DouyinError("no-key", "TikHub 说这个 Key 无效或已过期");
  }
  if (status === 402) {
    return new DouyinError("upstream", "TikHub 余额不足了，充一点再试");
  }
  if (status === 404) {
    return new DouyinError("not-found", "这条视频找不到了");
  }
  return new DouyinError("upstream", "解析服务暂时不可用，稍后再试");
}

/**
 * 发一次带签权的 GET，把非 200 和超时都翻成 `DouyinError`。
 *
 * `apiKey` 由调用方按**当前登录用户**从数据库解出来传进来（《功能/用户密钥》）——
 * 这个文件不再读任何环境变量，也就不存在「拿站点的 Key 替所有人付钱」这回事。
 */
async function request(path: string, apiKey: string): Promise<ApiPayload> {
  if (!apiKey.trim()) {
    throw new DouyinError("no-key", "还没配置 TikHub 的 Key");
  }

  let response: Response;
  try {
    response = await fetch(`${TIKHUB_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        // 不带这个头会被 Cloudflare 以 Error 1010 拦掉（见文件头第 1 条）
        "User-Agent": BROWSER_UA,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new DouyinError("timeout", "解析超时了，再试一次");
    }
    throw new DouyinError("upstream", "连不上解析服务，检查一下网络");
  }

  if (!response.ok) {
    throw errorFromStatus(response.status);
  }

  try {
    const payload = (await response.json()) as ApiPayload;
    if (typeof payload.code === "number" && payload.code !== 200) {
      throw errorFromStatus(payload.code);
    }
    return payload;
  } catch (error) {
    if (error instanceof DouyinError) throw error;
    throw new DouyinError("upstream", "解析服务返回了看不懂的内容，稍后再试");
  }
}

/** 从两种响应形态里取第一条作品：单对象优先，其次数组第一条。 */
function pickDetail(payload: ApiPayload): AwemeDetail | null {
  const data = payload.data;
  if (!data) return null;
  if (data.aweme_detail) return data.aweme_detail;
  const list = data.aweme_details;
  return Array.isArray(list) && list.length > 0 ? list[0] : null;
}

/**
 * 把上游的作品压成本工具要的形状。
 *
 * 空数组不带原因回来（filter_list 的 reason 是平台内部码，翻不成人话），
 * 所以「没数据」一律按「找不到」处理，界面上只说一句可能的原因。
 */
function toVideo(detail: AwemeDetail): DouyinVideo {
  const images = detail.images;
  if (detail.aweme_type !== 0 || (Array.isArray(images) && images.length > 0)) {
    throw new DouyinError("not-a-video", "这是图文作品，现在只支持视频");
  }

  const awemeId = detail.aweme_id;
  const playUrl = detail.video?.play_addr?.url_list?.[0];
  if (!awemeId || !playUrl) {
    throw new DouyinError("upstream", "这条视频没有可用的播放地址，稍后再试");
  }

  return {
    awemeId,
    title: (detail.desc ?? "").trim(),
    author: (detail.author?.nickname ?? "").trim(),
    coverUrl: detail.video?.cover?.url_list?.[0] ?? "",
    durationMs: Math.max(0, Math.round(detail.duration ?? 0)),
    playUrl,
  };
}

/** 按分享链接解析一条视频。`apiKey` 来自当前登录用户自己的配置。 */
export async function resolveVideo(link: string, apiKey: string): Promise<DouyinVideo> {
  const payload = await request(
    `/douyin/app/v3/fetch_one_video_by_share_url?share_url=${encodeURIComponent(link)}`,
    apiKey,
  );
  const detail = pickDetail(payload);
  if (!detail) {
    throw new DouyinError("not-found", "这条视频找不到了，可能已经删除或设为私密");
  }
  return toVideo(detail);
}

/**
 * 直接用作品 id 取一条视频。
 *
 * 下载时直链过期（403）要重解析一次，那时手上只有 `aweme_id`、没有原始分享链接，
 * 所以需要这条路径。
 */
export async function resolveVideoById(awemeId: string, apiKey: string): Promise<DouyinVideo> {
  const payload = await request(
    `/douyin/app/v3/fetch_one_video?aweme_id=${encodeURIComponent(awemeId)}`,
    apiKey,
  );
  const detail = pickDetail(payload);
  if (!detail) {
    throw new DouyinError("not-found", "这条视频找不到了，可能已经删除或设为私密");
  }
  return toVideo(detail);
}
