import { getCurrentUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/auth/db";
import { DouyinError, resolveVideo, type DouyinVideo } from "@/lib/douyin/client";
import { parseShareText } from "@/lib/douyin/parse-share-url";
import { findAwemeIdByLink, findFreshVideo, saveLink, saveVideo } from "@/lib/douyin/store";
import { MasterKeyMissingError, SecretDecryptError } from "@/lib/secrets/crypto";
import { hasSecret, readSecret } from "@/lib/secrets/store";

/**
 * 抖音解析接口（《功能/抖音下载》§二、§四）。
 *
 * 一条分享链接进来，一条视频信息出去。**先查缓存再调上游**——每次上游调用都是钱，
 * 命中缓存时这个接口一次 HTTP 都不发。
 *
 * 短链（`v.douyin.com/xxx`）本身看不出是哪个作品，所以要靠 `douyin_links`
 * 那张映射表把它记住；不查映射，同一个短链贴第二次就又是一次计费。
 */

// better-sqlite3 要求 Node 运行时（不能用 Edge）
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(code: string, error: string, status: number): Response {
  return Response.json({ code, error }, { status });
}

/** 错误码 → HTTP 状态。界面只认 `error` 那句人话，状态码是给日志和 curl 看的。 */
function statusFor(code: DouyinError["code"]): number {
  switch (code) {
    case "not-found":
      return 404;
    case "not-a-video":
      return 422;
    case "no-key":
      // 用户自己的配置问题，不是服务端故障——400 比 500 诚实
      return 400;
    case "timeout":
      return 504;
    default:
      return 502;
  }
}

function ok(video: DouyinVideo, cached: boolean): Response {
  return Response.json({ code: "ok", cached, video });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return fail("unauthorized", "请先登录", 401);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail("bad-request", "请求格式不对", 400);
  }

  const text = typeof (raw as { text?: unknown })?.text === "string" ? (raw as { text: string }).text : "";
  const link = parseShareText(text);
  if (!link) {
    // 认不出抖音链接就到此为止：**不发起任何外部请求**，也不产生任何费用
    return fail("not-a-link", "这不是抖音链接", 400);
  }

  const db = getDb();

  // 0）门槛：没配自己的 Key 一律不给用。
  //    **必须在查缓存之前**——缓存是全局共享的优化，不是绕过配置的通道；
  //    先查缓存再查 Key 的话，同一个视频别人解析过，没配 Key 的人也能白嫖到结果。
  if (!hasSecret(db, user.id, "tikhub")) {
    return fail("no-key", "你还没配置 TikHub 的 Key，去设置里填一下", 400);
  }

  // 1）长链自带 id，可以直接查缓存
  if (link.awemeId) {
    const cached = findFreshVideo(db, link.awemeId);
    if (cached) return ok(cached, true);
  }

  // 2）短链先翻映射表
  const knownId = findAwemeIdByLink(db, link.url);
  if (knownId) {
    const cached = findFreshVideo(db, knownId);
    if (cached) return ok(cached, true);
  }

  // 3）要花钱了：先看这个用户有没有配自己的 Key。
  //    这一步排在缓存之后——缓存命中就不该因为「没配 Key」而失败，
  //    那个视频是之前（可能用别的号）解析过的。
  let apiKey: string;
  try {
    const stored = readSecret(db, user.id, "tikhub");
    if (!stored) {
      return fail("no-key", "你还没配置 TikHub 的 Key，去设置里填一下", 400);
    }
    apiKey = stored;
  } catch (error) {
    if (error instanceof MasterKeyMissingError || error instanceof SecretDecryptError) {
      return fail("no-key", error.message, 400);
    }
    return fail("upstream", "读取你的 Key 时出错了，稍后再试", 500);
  }

  // 4）真的去调上游
  try {
    const video = await resolveVideo(link.url, apiKey);
    saveVideo(db, video);
    saveLink(db, link.url, video.awemeId);
    return ok(video, false);
  } catch (error) {
    if (error instanceof DouyinError) {
      return fail(error.code, error.message, statusFor(error.code));
    }
    return fail("upstream", "解析失败了，稍后再试", 500);
  }
}
