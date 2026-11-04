import { getCurrentUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/auth/db";
import { savePlaybackState } from "@/lib/music-player/playback";

/**
 * 上报「上次播到哪」（《功能/音乐播放器》§2.1.6）。
 *
 * `POST` —— body `{ trackId, playlistId, positionMs, playing }`
 *
 * `playing` 是「此刻是不是正在播」：刷新后 `playing: false` 就停在暂停态、
 * `true` 才尝试接着播（浏览器不许无手势自动播时会被拒，前端静默停在暂停）。
 *
 * **用 POST 而不是 PUT**：页面卸载前的前端用 `fetch(..., { keepalive: true })`
 * 发出，同时 `navigator.sendBeacon` 只会 POST。一个方法两种发送方式都能用，
 * 比为了语义漂亮多留一条只有 sendBeacon 走的路强。
 *
 * 这个接口**不校验 trackId 是否属于该用户**：它只影响调用者自己那一行 state，
 * 读回来时 `resolvePlaybackState` 还会再和库里的曲目对一遍（不是自己的就当没有）。
 * 校验一次要多一次查询，而收益是「防止用户伪造自己被恢复成某首不存在的歌」——没有意义。
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ code: "unauthorized", error: "请先登录" }, { status: 401 });

  let body: {
    trackId?: unknown;
    playlistId?: unknown;
    positionMs?: unknown;
    playing?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ code: "bad-request", error: "请求格式不对" }, { status: 400 });
  }

  const num = (value: unknown): number | null => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  };

  savePlaybackState(getDb(), user.id, {
    trackId: num(body.trackId),
    playlistId: num(body.playlistId),
    positionMs: Number(body.positionMs) || 0,
    // 只有明确的 true 才算在播：老客户端不带这个字段时按暂停处理（宁可不响）
    playing: body.playing === true,
  });

  // 什么都不回：这个请求是「顺手记一笔」，前端不等结果
  return Response.json({ ok: true });
}
