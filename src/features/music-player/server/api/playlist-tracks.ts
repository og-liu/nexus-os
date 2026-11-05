import { getCurrentUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/auth/db";
import {
  addTracksToPlaylist,
  findPlaylist,
  removeTrackFromPlaylist,
} from "../playlists";

/**
 * 歌单与曲目的关联接口（两个动作，都是「往歌单里放 / 拿出来」）。
 *
 * `POST`   —— 加歌进来，body `{ playlistId, trackIds }`；已经在歌单里的不重复加，
 *              别人的歌静默过滤（不能靠歌单 id 去碰别人的曲目）
 * `DELETE` —— 移除一首，`?playlistId=&trackId=`；**歌还在曲库里**
 *
 * 两个动作都不碰磁盘文件，只动 `playlist_tracks`。
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(code: string, message: string, status: number): Response {
  return Response.json({ code, error: message }, { status });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "请先登录", 401);

  let body: { playlistId?: unknown; trackIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("bad-request", "请求格式不对", 400);
  }

  const playlistId = Number(body.playlistId);
  if (!Number.isInteger(playlistId) || playlistId <= 0) {
    return fail("bad-request", "缺少歌单 id", 400);
  }

  const trackIds = Array.isArray(body.trackIds)
    ? body.trackIds.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)
    : [];
  if (trackIds.length === 0) return fail("bad-request", "没选歌", 400);
  if (trackIds.length > 500) return fail("bad-request", "一次最多加 500 首", 400);

  const db = getDb();
  const added = addTracksToPlaylist(db, user.id, playlistId, trackIds);
  // null = 歌单不存在或不属于该用户
  if (added === null) return fail("not-found", "这个歌单不在你这里", 404);

  return Response.json({
    ok: true,
    added,
    requested: trackIds.length,
    playlist: findPlaylist(db, user.id, playlistId),
  });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "请先登录", 401);

  const params = new URL(request.url).searchParams;
  const playlistId = Number(params.get("playlistId") ?? "");
  const trackId = Number(params.get("trackId") ?? "");

  if (!Number.isInteger(playlistId) || playlistId <= 0) {
    return fail("bad-request", "缺少歌单 id", 400);
  }
  if (!Number.isInteger(trackId) || trackId <= 0) {
    return fail("bad-request", "缺少曲目 id", 400);
  }

  const db = getDb();
  const removed = removeTrackFromPlaylist(db, user.id, playlistId, trackId);
  if (!removed) return fail("not-found", "这个歌单里没有这首歌", 404);

  return Response.json({ ok: true, playlist: findPlaylist(db, user.id, playlistId) });
}
