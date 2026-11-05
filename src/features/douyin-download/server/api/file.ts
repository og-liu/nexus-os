import { contentDisposition } from "@/lib/content-disposition";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/auth/db";
import { BROWSER_UA, DouyinError, resolveVideoById } from "../client";
import { toVideoFilename } from "../../shared/filename";
import { findVideo, saveVideo } from "../store";
import { MasterKeyMissingError, SecretDecryptError } from "@/lib/secrets/crypto";
import { hasSecret, readSecret } from "@/lib/secrets/store";

/**
 * 抖音视频下载（features/douyin-download/README.md §四「下载怎么走」、§七第 1 / 7 条）。
 *
 * **必须由服务端代理，不能让浏览器直接跳到抖音 CDN**：那条直链带防盗链、有时效，
 * 直接跳过去大概率 403，而且文件名会变成一串乱码。这里由服务器带 `Referer` 去拉，
 * 边拉边吐给浏览器，同时把标题命名的 `Content-Disposition` 一起设好。
 *
 * 客户端只传作品 id，**不传 URL**——否则这个接口就成了任何人都能拿来打任意地址的
 * SSRF 入口。
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 抖音作品 id：15 位以上纯数字。 */
const AWEME_ID = /^\d{15,}$/;

/**
 * 失败响应。
 *
 * **必须带 `Content-Disposition`**：这个地址是由 `<a download>` 触发的，浏览器会把
 * 任何响应都存成文件。不给文件名，它就拿 URL 末段 `file` 当名字、再按内容补个 `.txt`，
 * 用户下载面板里出现一个莫名其妙还失败的 `file.txt`——看不到原因。
 * 给成「下载失败.txt」，用户打开至少能读到中文原因。
 */
function fail(code: string, error: string, status: number): Response {
  return new Response(`${error}\n`, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="download-failed.txt"; filename*=UTF-8''${encodeURIComponent("下载失败.txt")}`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * 去抖音 CDN 拉一次媒体流；返回 `null` 表示这次没拉成（403 过期、网络错误都算）。
 *
 * `Referer` 是必须的：不带它抖音 CDN 会按防盗链拒掉。
 */
async function openMedia(playUrl: string): Promise<Response | null> {
  try {
    const response = await fetch(playUrl, {
      headers: { "User-Agent": BROWSER_UA, Referer: "https://www.douyin.com/" },
      cache: "no-store",
    });
    return response.ok && response.body ? response : null;
  } catch {
    return null;
  }
}

/**
 * 把上游流转给浏览器。
 *
 * **不设 `Content-Length`**：上游的长度可能不准（分片、压缩），照抄会让浏览器
 * 下到一半就断。让浏览器按实际收到的字节数收尾。
 */
function streamOut(upstream: Response, title: string, awemeId: string): Response {
  const fileName = toVideoFilename(title, awemeId);
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "video/mp4",
      "Content-Disposition": contentDisposition(fileName),
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return fail("unauthorized", "请先登录", 401);
  }

  const awemeId = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!AWEME_ID.test(awemeId)) {
    return fail("bad-request", "缺少作品 id", 400);
  }

  const db = getDb();

  // 门槛：没配自己的 Key 一律不给下。
  // 下载本身不一定调上游（直链还有效时只是转发字节），但「有没有配 Key」是权限，
  // 和「这次要不要花钱」是两件事——不配上就不该能用这个工具（《功能/用户密钥》）。
  if (!hasSecret(db, user.id, "tikhub")) {
    return fail("no-key", "你还没配置 TikHub 的 Key，去设置里填一下", 400);
  }

  const cached = findVideo(db, awemeId);
  if (!cached) {
    return fail("not-found", "先解析一次再来下载", 404);
  }

  const first = await openMedia(cached.playUrl);
  if (first) {
    return streamOut(first, cached.title, awemeId);
  }

  // 直链过期（403）是常态，不是异常：重新解析一次，把新地址写回缓存再下。
  // 重解析要花用户自己的钱，所以 Key 是这一支才需要的——单纯下载命中缓存不用 Key。
  let apiKey: string;
  try {
    const stored = readSecret(db, user.id, "tikhub");
    if (!stored) {
      return fail("no-key", "视频地址失效了，重解析需要 TikHub 的 Key——你还没配，去设置里填一下", 400);
    }
    apiKey = stored;
  } catch (error) {
    if (error instanceof MasterKeyMissingError || error instanceof SecretDecryptError) {
      return fail("no-key", error.message, 400);
    }
    return fail("upstream", "读取你的 Key 时出错了，稍后再试", 500);
  }

  let refreshed;
  try {
    refreshed = await resolveVideoById(awemeId, apiKey);
  } catch (error) {
    if (error instanceof DouyinError) {
      return fail(error.code, error.message, error.code === "not-found" ? 404 : 502);
    }
    return fail("upstream", "这条视频的地址失效了，稍后再试", 502);
  }

  saveVideo(db, refreshed);

  const second = await openMedia(refreshed.playUrl);
  if (!second) {
    return fail("expired", "这条视频的地址失效了，再解析一次试试", 502);
  }

  return streamOut(second, refreshed.title, awemeId);
}
