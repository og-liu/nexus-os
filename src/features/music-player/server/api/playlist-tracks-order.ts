import { getCurrentUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/auth/db";
import { listPlaylistsWithTracks, reorderPlaylistTracks } from "../playlists";

/**
 * 歌单内排序（features/music-player/README.md §2.1.5）。
 *
 * `PATCH` —— body `{ playlistId, ids: number[] }`：把该歌单排成这个顺序（全量覆盖）。
 *
 * 只动这个歌单的关联行，**不动曲库的 `position`**——在歌单里拖一首歌，
 * 「全部歌曲」那边的顺序不该跟着变。
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(code: string, message: string, status: number): Response {
  return Response.json({ code, error: message }, { status });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "请先登录", 401);

  let body: { playlistId?: unknown; ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("bad-request", "请求格式不对", 400);
  }

  const playlistId = Number(body.playlistId);
  if (!Number.isInteger(playlistId) || playlistId <= 0) {
    return fail("bad-request", "缺少歌单 id", 400);
  }
  if (!Array.isArray(body.ids)) return fail("bad-request", "缺少顺序列表", 400);

  const ids = body.ids.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0);
  if (ids.length === 0) return fail("bad-request", "缺少顺序列表", 400);
  if (ids.length > 2000) return fail("bad-request", "一次最多排 2000 首", 400);

  const db = getDb();
  const ok = reorderPlaylistTracks(db, user.id, playlistId, ids);
  // 歌单不存在、不属于该用户、或者 id 一个都不在这个歌单里：同一个 404
  if (!ok) return fail("not-found", "这个歌单里没有这些歌", 404);

  return Response.json({ playlists: listPlaylistsWithTracks(db, user.id) });
}
