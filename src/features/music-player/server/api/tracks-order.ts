import { getCurrentUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/auth/db";
import { listTracks, reorderTracks } from "../tracks";

/**
 * 曲库排序（features/music-player/README.md §2.1.5）。
 *
 * `PATCH` —— body `{ ids: number[] }`：把曲库排成这个顺序（**全量覆盖**）。
 *
 * 为什么是全量而不是「把第 3 首挪到第 7 位」：拖拽一次会影响中间所有行的位置，
 * 前端手里本来就有完整列表，直接把它交回来比让服务端推算一遍可靠——
 * 服务端的顺序和用户眼前的顺序必须来自同一份数据，否则「拖了没动」这类问题查不出来。
 *
 * 混进来的别人的 id 会被丢掉（`reorderTracks` 里过滤），不会顺手改别人的曲库。
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(code: string, message: string, status: number): Response {
  return Response.json({ code, error: message }, { status });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "请先登录", 401);

  let body: { ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("bad-request", "请求格式不对", 400);
  }

  if (!Array.isArray(body.ids)) return fail("bad-request", "缺少顺序列表", 400);

  const ids = body.ids.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0);
  if (ids.length === 0) return fail("bad-request", "缺少顺序列表", 400);
  if (ids.length > 2000) return fail("bad-request", "一次最多排 2000 首", 400);

  const db = getDb();
  const ok = reorderTracks(db, user.id, ids);
  if (!ok) return fail("not-found", "这些歌不在你的曲库里", 404);

  // 回一份最新的列表：前端拿它对齐，而不是相信自己刚才算的那一份
  return Response.json(listTracks(db, user.id));
}
