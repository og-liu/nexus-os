"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/auth/db";
import {
  createNote,
  deleteNote,
  listNotes,
  setNotePinned,
  updateNoteBody,
  type StickyNote,
} from "./notes";
import { validateNoteBody } from "./validate";

/**
 * 便签的 Server Actions（《功能/便签》）。
 *
 * 两个必须记住的前提：
 * 1. Server Action 是**公开 HTTP 端点**：正文校验与归属校验必须在服务端再做一遍，
 *    浏览器里的 `maxLength` 只是体验，不是防线；
 * 2. 每个 action 第一件事是 `requireUser()`——它同时完成「登录检查」与「取当前用户」，
 *    后续每条 SQL 的 `user_id` 都来自它。
 *
 * 写操作统一返回**最新列表**：排序与查询只有服务端一份，客户端直接 setState。
 */

export type StickyNotesActionResult =
  | { ok: true; notes: StickyNote[] }
  | { ok: false; error: string };

/** 写成功后的统一回执：重新查一遍列表（排序规则只活在 SQL 里）。 */
function ok(notes: StickyNote[]): StickyNotesActionResult {
  return { ok: true, notes };
}

function fail(error: string): StickyNotesActionResult {
  return { ok: false, error };
}

/** 工具页与首页都依赖同一份数据，写完一起失效。 */
function revalidateStickyNotes(): void {
  revalidatePath("/tools/sticky-notes");
  revalidatePath("/");
}

/**
 * 新建便签。
 *
 * `pin` 是弹窗里的「置顶保存」：保存与置顶是用户的一个动作，
 * 所以放进同一个事务，不会出现「存进去了但没置顶」的半成品。
 */
export async function createNoteAction(
  rawBody: string,
  pin = false,
): Promise<StickyNotesActionResult> {
  const user = await requireUser();
  const parsed = validateNoteBody(rawBody);
  if (!parsed.ok) return fail(parsed.error);

  const db = getDb();
  db.transaction(() => {
    const note = createNote(db, user.id, parsed.body);
    if (pin) setNotePinned(db, user.id, note.id, true);
  })();
  revalidateStickyNotes();
  return ok(listNotes(db, user.id));
}

/** 改正文；`pin` 为 true 时同时置顶（编辑完成直接排到置顶区第一位）。 */
export async function updateNoteAction(
  noteId: number,
  rawBody: string,
  pin = false,
): Promise<StickyNotesActionResult> {
  const user = await requireUser();
  const parsed = validateNoteBody(rawBody);
  if (!parsed.ok) return fail(parsed.error);

  const db = getDb();
  const updated = db.transaction(() => {
    if (!updateNoteBody(db, user.id, noteId, parsed.body)) return false;
    if (pin) setNotePinned(db, user.id, noteId, true);
    return true;
  })();
  if (!updated) return fail("便签不存在");
  revalidateStickyNotes();
  return ok(listNotes(db, user.id));
}

export async function togglePinAction(
  noteId: number,
  pinned: boolean,
): Promise<StickyNotesActionResult> {
  const user = await requireUser();
  const db = getDb();
  if (!setNotePinned(db, user.id, noteId, pinned)) {
    return fail("便签不存在");
  }
  revalidateStickyNotes();
  return ok(listNotes(db, user.id));
}

export async function deleteNoteAction(
  noteId: number,
): Promise<StickyNotesActionResult> {
  const user = await requireUser();
  const db = getDb();
  if (!deleteNote(db, user.id, noteId)) {
    return fail("便签不存在");
  }
  revalidateStickyNotes();
  return ok(listNotes(db, user.id));
}
