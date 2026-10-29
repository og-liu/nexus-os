"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { getDb, type Db } from "@/lib/auth/db";
import {
  createGroup,
  createItem,
  deleteGroup,
  deleteItem,
  deleteItems,
  groupExists,
  listGroups,
  listItems,
  moveItems,
  nextUntitledTitle,
  renameGroup,
  updateItem,
  type VaultField,
  type VaultGroup,
  type VaultItem,
} from "./vault";
import {
  UNTITLED,
  validateFields,
  validateGroupName,
  validateTitle,
} from "./validate";

/**
 * 保险库的 Server Actions（《功能/保险库》）。
 *
 * 三个必须记住的前提：
 * 1. Server Action 是**公开 HTTP 端点**：所有校验都要在服务端再做一遍；
 * 2. 每个 action 第一件事是 `requireUser()`——它同时完成「登录检查」与「取当前用户」，
 *    后续每条 SQL 的 `user_id` 都来自它（这是账户隔离的落实点）；
 * 3. 写操作统一返回**整份快照**（群组 + 条目）：排序、过滤、字段并集都只有服务端一份，
 *    客户端拿到就直接 setState，不再自己维护第二套规则。数据量是「一个人几百条」，
 *    整份传回去的成本可以忽略。
 */

/** 一次读写要用的全部数据：左栏群组 + 全部条目（中栏按视图在前端过滤）。 */
export interface VaultSnapshot {
  groups: VaultGroup[];
  items: VaultItem[];
}

export type VaultActionResult =
  | { ok: true; snapshot: VaultSnapshot; createdId?: number }
  | { ok: false; error: string };

function snapshot(db: Db, userId: number): VaultSnapshot {
  return { groups: listGroups(db, userId), items: listItems(db, userId) };
}

function ok(snap: VaultSnapshot, createdId?: number): VaultActionResult {
  return createdId === undefined ? { ok: true, snapshot: snap } : { ok: true, snapshot: snap, createdId };
}

function fail(error: string): VaultActionResult {
  return { ok: false, error };
}

/** 只有这个工具页用这份数据；写完失效一次足够。 */
function revalidateVault(): void {
  revalidatePath("/tools/vault");
}

/** 客户端传来的东西一律当 `unknown` 处理：它可能是任何值，甚至不是从我们的界面发出的。 */
interface RawItemInput {
  title?: unknown;
  groupId?: unknown;
  fields?: unknown;
}

type ParsedItemInput = {
  title: string;
  groupId: number | null;
  fields: VaultField[];
};

/** 条目输入的解析 + 校验。群组 id 必须**存在且属于这个人**，否则拒绝（§六 验收 19）。 */
function parseItemInput(
  db: Db,
  userId: number,
  raw: RawItemInput,
): { ok: true; value: ParsedItemInput } | { ok: false; error: string } {
  const title = validateTitle(raw.title);
  if (!title.ok) return title;

  const fields = validateFields(raw.fields);
  if (!fields.ok) return fields;

  let groupId: number | null = null;
  if (raw.groupId !== null && raw.groupId !== undefined) {
    if (typeof raw.groupId !== "number" || !Number.isInteger(raw.groupId)) {
      return { ok: false, error: "群组格式不正确" };
    }
    // 跨用户传入别人的群组 id 时，这个检查会挡住——否则能把条目塞进别人的群组
    if (!groupExists(db, userId, raw.groupId)) {
      return { ok: false, error: "群组不存在" };
    }
    groupId = raw.groupId;
  }

  return { ok: true, value: { title: title.value, groupId, fields: fields.value } };
}

/** 批量操作的 id 列表：只收正整数、去重、封个上限（防止一次塞几千个 id）。 */
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

// ---------------------------------------------------------------- 群组

export async function createGroupAction(rawName: string): Promise<VaultActionResult> {
  const user = await requireUser();
  const name = validateGroupName(rawName);
  if (!name.ok) return fail(name.error);

  const db = getDb();
  const result = createGroup(db, user.id, name.value);
  if (!result.ok) return fail("已存在同名群组");

  revalidateVault();
  return ok(snapshot(db, user.id));
}

export async function renameGroupAction(
  groupId: number,
  rawName: string,
): Promise<VaultActionResult> {
  const user = await requireUser();
  const name = validateGroupName(rawName);
  if (!name.ok) return fail(name.error);

  const db = getDb();
  const result = renameGroup(db, user.id, groupId, name.value);
  if (result === "missing") return fail("群组不存在");
  if (result === "duplicate") return fail("已存在同名群组");

  revalidateVault();
  return ok(snapshot(db, user.id));
}

/**
 * 删除群组。**条目不会跟着删**：`group_id` 上的 `ON DELETE SET NULL` 会把它们
 * 变成未分组（《数据库/保险库群组表》§七）。
 */
export async function deleteGroupAction(groupId: number): Promise<VaultActionResult> {
  const user = await requireUser();
  const db = getDb();
  if (!deleteGroup(db, user.id, groupId)) return fail("群组不存在");

  revalidateVault();
  return ok(snapshot(db, user.id));
}

// ---------------------------------------------------------------- 条目

export async function createItemAction(raw: RawItemInput): Promise<VaultActionResult> {
  const user = await requireUser();
  const db = getDb();
  const parsed = parseItemInput(db, user.id, raw);
  if (!parsed.ok) return fail(parsed.error);

  // 用户没自己起名（空 / 正好是「未命名」）时补序号：`未命名 2`、`未命名 3`……
  // 自己起的名字即使在库里撞名也不动 — 同名的两条记录是合法的（同名的两张卡）。
  const title =
    parsed.value.title === UNTITLED ? nextUntitledTitle(db, user.id) : parsed.value.title;

  const created = createItem(db, user.id, { ...parsed.value, title });
  revalidateVault();
  // 带上新条目的 id：创建完界面要直接选中它（否则用户得在列表里再找一遍）
  return ok(snapshot(db, user.id), created.id);
}

export async function updateItemAction(
  itemId: number,
  raw: RawItemInput,
): Promise<VaultActionResult> {
  const user = await requireUser();
  const db = getDb();
  const parsed = parseItemInput(db, user.id, raw);
  if (!parsed.ok) return fail(parsed.error);

  if (!updateItem(db, user.id, itemId, parsed.value)) return fail("记录不存在");

  revalidateVault();
  return ok(snapshot(db, user.id));
}

export async function deleteItemAction(itemId: number): Promise<VaultActionResult> {
  const user = await requireUser();
  const db = getDb();
  if (!deleteItem(db, user.id, itemId)) return fail("记录不存在");

  revalidateVault();
  return ok(snapshot(db, user.id));
}

/** 批量删除。一条都没命中（比如已被别处删掉）也算失败，让界面刷新而不是假装成功。 */
export async function deleteItemsAction(rawIds: unknown): Promise<VaultActionResult> {
  const user = await requireUser();
  const ids = parseIds(rawIds);
  if (!ids) return fail("选中的记录不正确");

  const db = getDb();
  if (deleteItems(db, user.id, ids) === 0) return fail("记录不存在");

  revalidateVault();
  return ok(snapshot(db, user.id));
}

/** 批量移动。`groupId` 为 `null` 表示移到「未分组」。 */
export async function moveItemsAction(
  rawIds: unknown,
  rawGroupId: unknown,
): Promise<VaultActionResult> {
  const user = await requireUser();
  const ids = parseIds(rawIds);
  if (!ids) return fail("选中的记录不正确");

  let groupId: number | null = null;
  if (rawGroupId !== null && rawGroupId !== undefined) {
    if (typeof rawGroupId !== "number" || !Number.isInteger(rawGroupId)) {
      return fail("群组格式不正确");
    }
    if (!groupExists(getDb(), user.id, rawGroupId)) return fail("群组不存在");
    groupId = rawGroupId;
  }

  const db = getDb();
  if (moveItems(db, user.id, ids, groupId) === 0) return fail("记录不存在");

  revalidateVault();
  return ok(snapshot(db, user.id));
}
