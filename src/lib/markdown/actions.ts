"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/auth/db";
import {
  createDocument,
  deleteDocument,
  deleteDocuments,
  getDocument,
  nextUntitledTitle,
  saveDocument,
  type MdDocument,
} from "./documents";
import {
  createTag,
  deleteTag,
  deleteTags,
  listTags,
  renameTag,
  setDocumentTags,
  type MdDocumentTag,
  type MdTag,
} from "./tags";
import { UNTITLED, validateBody, validateId, validateTitle } from "./validate";

/**
 * Markdown 编辑器的 Server Actions（《功能/Markdown编辑器》§五）。
 *
 * 三个必须记住的前提（同保险库）：
 * 1. Server Action 是**公开 HTTP 端点**：所有校验都要在服务端再做一遍，
 *    输入框上的 `maxLength` 不是防线；
 * 2. 每个 action 第一件事是 `requireUser()`——它同时完成「登录检查」与「取当前用户」，
 *    后续每条 SQL 的 `user_id` 都来自它（这是账户隔离的落实点）；
 * 3. **只回传这一篇**，不回传整份列表：自动保存每 0.8 秒一次，回整份列表既浪费
 *    又会打断正在输入的那一行（界面按返回值本地更新那一行，见《功能/Markdown编辑器》§七）。
 */

export type MarkdownActionResult =
  | { ok: true; document: MdDocument }
  | { ok: false; error: string };

function fail(error: string): MarkdownActionResult {
  return { ok: false, error };
}

/** 只有这个工具页用这份数据；写完失效一次足够。 */
function revalidateMarkdown(): void {
  revalidatePath("/tools/markdown-editor");
}

/**
 * 新建一篇。标题一律是「未命名文档」（重名补序号）——
 * 新建时用户还没想好名字，弹窗先起名会多一步（《功能/Markdown编辑器》§四）。
 */
export async function createDocumentAction(): Promise<MarkdownActionResult> {
  const user = await requireUser();
  const db = getDb();

  const title = nextUntitledTitle(db, user.id);
  const created = createDocument(db, user.id, title, "");

  revalidateMarkdown();
  return { ok: true, document: created };
}

/** 打开一篇（切换文档时用）。不存在 / 不属于这个人 → 「文档不存在」。 */
export async function openDocumentAction(rawId: unknown): Promise<MarkdownActionResult> {
  const user = await requireUser();
  const id = validateId(rawId);
  if (!id.ok) return fail(id.error);

  const document = getDocument(getDb(), user.id, id.value);
  if (!document) return fail("文档不存在");
  return { ok: true, document };
}

/**
 * 自动保存。标题留空 → 服务端补「未命名文档」，与库里已有的同号标题重名时补序号
 * （用户自己起的名字即使重复也不动：两篇都叫「灵感」是合法的）。
 *
 * 返回整行：`updated_at` 是服务端算的，客户端不猜时间。
 */
export async function saveDocumentAction(
  rawId: unknown,
  raw: { title?: unknown; body?: unknown },
): Promise<MarkdownActionResult> {
  const user = await requireUser();
  const id = validateId(rawId);
  if (!id.ok) return fail(id.error);

  const title = validateTitle(raw?.title);
  if (!title.ok) return fail(title.error);

  const body = validateBody(raw?.body);
  if (!body.ok) return fail(body.error);

  const db = getDb();
  const finalTitle =
    title.value === UNTITLED
      ? nextUntitledTitle(db, user.id, id.value)
      : title.value;

  const saved = saveDocument(db, user.id, id.value, { title: finalTitle, body: body.value });
  if (!saved) return fail("文档不存在");

  revalidateMarkdown();
  return { ok: true, document: saved };
}

// ---------------------------------------------------------------- 标签

export type TagsActionResult =
  | { ok: true; tags: MdDocumentTag[]; allTags: MdTag[] }
  | { ok: false; error: string };

/**
 * 把这篇文档的标签整体换成 `names`：前端传来什么就是什么（空数组 = 清空标签，
 * 文档本身不动）。刚打的标签就落库，不需要另外「保存」。
 */
export async function setDocumentTagsAction(
  rawId: unknown,
  rawNames: unknown,
): Promise<TagsActionResult> {
  const user = await requireUser();
  const id = validateId(rawId);
  if (!id.ok) return { ok: false, error: id.error };

  const db = getDb();
  const tags = setDocumentTags(db, user.id, id.value, rawNames);
  if (!tags) return { ok: false, error: "文档不存在" };

  revalidateMarkdown();
  return { ok: true, tags, allTags: listTags(db, user.id) };
}

/** 新建一个标签（不带文档）。名字重复 / 不合法都会明确拒绝，不静默改用户的输入。 */
export async function createTagAction(
  rawName: unknown,
): Promise<{ ok: true; allTags: MdTag[] } | { ok: false; error: string }> {
  const user = await requireUser();
  const db = getDb();
  const result = createTag(db, user.id, rawName);
  if (result === "invalid") return { ok: false, error: "标签名不合法或太长" };
  if (result === "duplicate") return { ok: false, error: "已存在同名标签" };

  revalidateMarkdown();
  return { ok: true, allTags: listTags(db, user.id) };
}

/** 重命名一个标签（带子标签一起改）。 */
export async function renameTagAction(
  rawId: unknown,
  rawName: unknown,
): Promise<{ ok: true; allTags: MdTag[] } | { ok: false; error: string }> {
  const user = await requireUser();
  const id = validateId(rawId);
  if (!id.ok) return { ok: false, error: id.error };

  const db = getDb();
  const result = renameTag(db, user.id, id.value, rawName);
  if (result === "missing") return { ok: false, error: "标签不存在或名字不合法" };
  if (result === "duplicate") return { ok: false, error: "已存在同名标签" };

  revalidateMarkdown();
  return { ok: true, allTags: listTags(db, user.id) };
}

/** 删一个标签：只解除关联，文档留着。 */
export async function deleteTagAction(
  rawId: unknown,
): Promise<{ ok: true; allTags: MdTag[] } | { ok: false; error: string }> {
  const user = await requireUser();
  const id = validateId(rawId);
  if (!id.ok) return { ok: false, error: id.error };

  const db = getDb();
  if (!deleteTag(db, user.id, id.value)) return { ok: false, error: "标签不存在" };

  revalidateMarkdown();
  return { ok: true, allTags: listTags(db, user.id) };
}

/** 批量删标签（只解除关联，文档不删）。 */
export async function deleteTagsAction(rawIds: unknown): Promise<
  { ok: true; count: number; allTags: MdTag[] } | { ok: false; error: string }
> {
  const user = await requireUser();
  const ids = parseIds(rawIds);
  if (!ids) return { ok: false, error: "选中的标签不正确" };

  const db = getDb();
  const count = deleteTags(db, user.id, ids);
  if (count === 0) return { ok: false, error: "标签不存在" };

  revalidateMarkdown();
  return { ok: true, count, allTags: listTags(db, user.id) };
}

/**
 * 批量删除。id 列表当 `unknown` 处理（Server Action 是公开端点）：必须是数组、
 * 只收正整数、去重、封上限——照保险库的同一套规矩。
 */
export async function deleteDocumentsAction(
  rawIds: unknown,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const user = await requireUser();
  const ids = parseIds(rawIds);
  if (!ids) return { ok: false, error: "选中的文档不正确" };

  const count = deleteDocuments(getDb(), user.id, ids);
  if (count === 0) return { ok: false, error: "文档不存在" };

  revalidateMarkdown();
  return { ok: true, count };
}

/** 批量操作的 id 列表：正整数、去重、最多 200 条（防一次塞几千个）。 */
const BATCH_MAX = 200;

function parseIds(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const ids: number[] = [];
  for (const entry of raw) {
    if (typeof entry !== "number" || !Number.isInteger(entry) || entry <= 0) return null;
    if (!ids.includes(entry)) ids.push(entry);
  }
  if (ids.length === 0 || ids.length > BATCH_MAX) return null;
  return ids;
}

/** 删除（真删）。界面上的二次确认由客户端做，这里只认「这一行删掉了没有」。 */
export async function deleteDocumentAction(
  rawId: unknown,
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const user = await requireUser();
  const id = validateId(rawId);
  if (!id.ok) return { ok: false, error: id.error };

  if (!deleteDocument(getDb(), user.id, id.value)) {
    return { ok: false, error: "文档不存在" };
  }

  revalidateMarkdown();
  return { ok: true, id: id.value };
}
