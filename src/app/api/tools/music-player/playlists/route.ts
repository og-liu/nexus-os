import { getCurrentUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/auth/db";
import {
  PlaylistNameTakenError,
  cleanPlaylistName,
  createPlaylist,
  deletePlaylist,
  listPlaylists,
  renamePlaylist,
} from "@/lib/music-player/playlists";

/**
 * 歌单接口（《功能/音乐播放器》§2.1.2、《数据库/音乐歌单表》）。
 *
 * `GET`    —— 列歌单（带每单曲目数）
 * `POST`   —— 新建，body `{ name }`
 * `PATCH`  —— 改名，body `{ id, name }`
 * `DELETE` —— 删歌单，`?id=`；**歌不会被删**，只删关联
 *
 * 重名回 409 而不是 500：`UNIQUE (user_id, name)` 撞了是可预期的业务结果，
 * 不是服务器出错（§七第 17 条）。
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(code: string, message: string, status: number): Response {
  return Response.json({ code, error: message }, { status });
}

/** 从请求体里读一个干净的歌单名；读不到合法的就返回空串。 */
function readName(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";
  const raw = (body as { name?: unknown }).name;
  return typeof raw === "string" ? cleanPlaylistName(raw) : "";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "请先登录", 401);

  return Response.json(
    { playlists: listPlaylists(getDb(), user.id) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "请先登录", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("bad-request", "请求格式不对", 400);
  }

  const name = readName(body);
  if (!name) return fail("bad-request", "歌单名不能为空", 400);

  try {
    const playlist = createPlaylist(getDb(), user.id, name);
    return Response.json({ playlist }, { status: 201 });
  } catch (error) {
    if (error instanceof PlaylistNameTakenError) return fail("conflict", error.message, 409);
    throw error;
  }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "请先登录", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("bad-request", "请求格式不对", 400);
  }

  const id = Number((body as { id?: unknown })?.id);
  if (!Number.isInteger(id) || id <= 0) return fail("bad-request", "缺少歌单 id", 400);

  const name = readName(body);
  if (!name) return fail("bad-request", "歌单名不能为空", 400);

  try {
    const playlist = renamePlaylist(getDb(), user.id, id, name);
    if (!playlist) return fail("not-found", "这个歌单不在你这里", 404);
    return Response.json({ playlist });
  } catch (error) {
    if (error instanceof PlaylistNameTakenError) return fail("conflict", error.message, 409);
    throw error;
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "请先登录", 401);

  const id = Number(new URL(request.url).searchParams.get("id") ?? "");
  if (!Number.isInteger(id) || id <= 0) return fail("bad-request", "缺少歌单 id", 400);

  const removed = deletePlaylist(getDb(), user.id, id);
  if (!removed) return fail("not-found", "这个歌单不在你这里", 404);

  return Response.json({ ok: true, id });
}
