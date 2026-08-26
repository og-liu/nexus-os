// 知识库数据访问层（K0 数据地基）。
//
// 设计要点：
// 1. 依赖注入风格——所有函数第一个参数都是数据库连接，而不是内部调 getDb()。
//    这样单元测试可以直接喂 :memory: 内存库，生产由 route 层传 getDb()，
//    同一份代码两条路径，测试不碰真实磁盘。
// 2. 数据边界在这一层把住：状态白名单、输入清洗（标签去重去空白）都在 store 完成，
//    上层 route / 未来接 Agent 工具时拿到的就是干净数据。
// 3. 所有列表查询都带 rowid 第二排序键——这是本项目踩过 real 坑的教训（pitfalls #7：
//    同毫秒写入时 SQLite 排序不稳定），这里从第一行代码就规避。

import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

/** 知识条目的生命周期状态（语义见 db.ts 建表注释） */
export type KnowledgeStatus = "inbox" | "kept" | "discarded" | "trashed";

/** 状态白名单：store 层唯一权威，写入前必须过这道闸 */
const KNOWLEDGE_STATUSES: readonly KnowledgeStatus[] = [
  "inbox",
  "kept",
  "discarded",
  "trashed",
];

/** 面向上层的知识条目视图：SQL 行 + 组装好的标签数组 */
export interface KnowledgeItemRow {
  id: string;
  title: string;
  /** Markdown 正文（存储即纯文本单一事实源，渲染归前端） */
  content: string;
  source: string | null;
  source_url: string | null;
  status: KnowledgeStatus;
  tags: string[];
  created_at: number;
  updated_at: number;
}

/** SQL 原始行（不含 tags，tags 在关联表中单独查） */
interface ItemSqlRow {
  id: string;
  title: string;
  content: string;
  source: string | null;
  source_url: string | null;
  status: string;
  created_at: number;
  updated_at: number;
}

function assertStatus(status: string): asserts status is KnowledgeStatus {
  if (!KNOWLEDGE_STATUSES.includes(status as KnowledgeStatus)) {
    throw new Error(`非法的知识状态：${status}（允许：${KNOWLEDGE_STATUSES.join(" / ")}）`);
  }
}

/** 清洗标签输入：去空白、丢空串、去重——脏标签不进库 */
function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  for (const raw of tags ?? []) {
    const t = typeof raw === "string" ? raw.trim() : "";
    if (t) seen.add(t);
  }
  // Set 迭代序即插入序，读出侧会再按字典序稳定排序
  return [...seen];
}

/**
 * 给一批 SQL 行批量挂上各自标签。
 * 为什么不用逐条查询（N+1）：列表页一页几十条，逐条查 tags 会放大成几十次往返；
 * 这里一次 IN 查询取回全部关联，内存分组后再拼装——数量级差异在 SQLite 上不明显，
 * 但这是正确的访问姿势，习惯从这里养成。
 */
function attachTags(conn: Database.Database, rows: ItemSqlRow[]): KnowledgeItemRow[] {
  if (rows.length === 0) return [];

  const placeholders = rows.map(() => "?").join(", ");
  const tagRows = conn
    .prepare(
      `SELECT item_id, tag FROM knowledge_item_tags WHERE item_id IN (${placeholders}) ORDER BY tag`,
    )
    .all(...rows.map((r) => r.id)) as Array<{ item_id: string; tag: string }>;

  const tagsByItem = new Map<string, string[]>();
  for (const tr of tagRows) {
    const list = tagsByItem.get(tr.item_id);
    if (list) list.push(tr.tag);
    else tagsByItem.set(tr.item_id, [tr.tag]);
  }

  return rows.map((r) => ({
    ...r,
    status: r.status as KnowledgeStatus,
    tags: tagsByItem.get(r.id) ?? [],
  }));
}

export interface CreateItemInput {
  title?: string;
  content?: string;
  source?: string | null;
  source_url?: string | null;
  status?: KnowledgeStatus;
  tags?: string[];
}

export function createItem(
  conn: Database.Database,
  input: CreateItemInput,
): KnowledgeItemRow {
  const status = input.status ?? "inbox"; // 采集默认进「待拍板」，与产品采集流的默认行为对齐
  assertStatus(status);

  const now = Date.now();
  const id = randomUUID();

  conn
    .prepare(
      `INSERT INTO knowledge_items (id, title, content, source, source_url, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, input.title?.trim() ?? "", input.content ?? "", input.source ?? null, input.source_url ?? null, status, now, now);

  const tags = normalizeTags(input.tags ?? []);
  if (tags.length > 0) {
    const insertTag = conn.prepare(
      `INSERT OR IGNORE INTO knowledge_item_tags (item_id, tag) VALUES (?, ?)`,
    );
    // 事务包裹：要么全部标签写成功，要么整体回滚，不留半批脏标签
    conn.transaction(() => {
      for (const t of tags) insertTag.run(id, t);
    })();
  }

  return getItem(conn, id)!;
}

export function getItem(
  conn: Database.Database,
  id: string,
): KnowledgeItemRow | null {
  const row = conn
    .prepare(`SELECT * FROM knowledge_items WHERE id = ?`)
    .get(id) as ItemSqlRow | undefined;
  if (!row) return null;
  return attachTags(conn, [row])[0];
}

export interface ListOptions {
  status?: KnowledgeStatus;
  /** 标签精确过滤（单标签起步；多标签 AND/OR 组合留给需要时再加） */
  tag?: string;
  /** 关键词：LIKE 子串匹配 title / content。中文场景够用的最低成本检索，
   *  语义检索（向量）属于 K4 阶段，届时在这层之上叠加而非替换。 */
  q?: string;
  limit?: number;
  offset?: number;
}

export function listItems(
  conn: Database.Database,
  opts: ListOptions = {},
): { items: KnowledgeItemRow[]; total: number } {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200); // 封顶防止一次拖全表
  const offset = Math.max(opts.offset ?? 0, 0);

  const conds: string[] = [];
  const params: Array<string | number> = [];

  if (opts.status) {
    assertStatus(opts.status);
    conds.push("status = ?");
    params.push(opts.status);
  }
  if (opts.q) {
    conds.push("(title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')");
    // 用户输入里的 % _ \ 是 LIKE 通配符，转义后才按字面意思匹配
    const escaped = opts.q.replace(/[\\%_]/g, (c) => `\\${c}`);
    const like = `%${escaped}%`;
    params.push(like, like);
  }
  if (opts.tag) {
    conds.push(
      `EXISTS (SELECT 1 FROM knowledge_item_tags t WHERE t.item_id = knowledge_items.id AND t.tag = ?)`,
    );
    params.push(opts.tag);
  }

  const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";

  // rowid 兜底：updated_at 相同（同毫秒批量导入）时按插入序稳定排列（pitfalls #7 教训）
  const rows = conn
    .prepare(
      `SELECT * FROM knowledge_items ${where} ORDER BY updated_at DESC, rowid DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as ItemSqlRow[];

  const countRow = conn
    .prepare(`SELECT COUNT(*) AS c FROM knowledge_items ${where}`)
    .get(...params) as { c: number };

  return { items: attachTags(conn, rows), total: countRow.c };
}

export interface UpdateItemPatch {
  title?: string;
  content?: string;
  status?: KnowledgeStatus;
}

export function updateItem(
  conn: Database.Database,
  id: string,
  patch: UpdateItemPatch,
): KnowledgeItemRow | null {
  if (patch.status !== undefined) assertStatus(patch.status);

  const sets: string[] = [];
  const params: Array<string | number> = [];
  if (patch.title !== undefined) {
    sets.push("title = ?");
    params.push(patch.title.trim());
  }
  if (patch.content !== undefined) {
    sets.push("content = ?");
    params.push(patch.content);
  }
  if (patch.status !== undefined) {
    sets.push("status = ?");
    params.push(patch.status);
  }
  if (sets.length === 0) return getItem(conn, id); // 空 patch 不白跑一趟 UPDATE

  sets.push("updated_at = ?"); // 任何字段变更都刷新 updated_at，「最近整理」排序才成立
  params.push(Date.now(), id);

  conn
    .prepare(`UPDATE knowledge_items SET ${sets.join(", ")} WHERE id = ?`)
    .run(...params);
  return getItem(conn, id);
}

/** 全量替换标签：以调用方给的数组为准，多退少补。
 *  为什么不做 add/remove 细粒度接口：UI 打标签交互就是「编辑完整集合后提交」，
 *  全量替换语义最直白，也天然免掉并发增删的去重麻烦。 */
export function setTags(
  conn: Database.Database,
  id: string,
  tags: string[],
): void {
  const next = normalizeTags(tags);
  conn.transaction(() => {
    conn.prepare(`DELETE FROM knowledge_item_tags WHERE item_id = ?`).run(id);
    const insert = conn.prepare(
      `INSERT OR IGNORE INTO knowledge_item_tags (item_id, tag) VALUES (?, ?)`,
    );
    for (const t of next) insert.run(id, t);
    conn
      .prepare(`UPDATE knowledge_items SET updated_at = ? WHERE id = ?`)
      .run(Date.now(), id);
  })();
}

/**
 * 全局重命名标签：所有条目上的这个标签一起改名（对应 UI「管理标签」）。
 *
 * 为什么不用一条 UPDATE 直接改：新名字可能已经存在于某些条目上（比如把
 * 「ai」统一成「AI」，而有的条目俩标签都有），直接 UPDATE 会撞复合主键报错。
 * 这里两步走：先把新名挂到所有带旧名的条目上（OR IGNORE 跳过已存在的），
 * 再整体删掉旧名——语义等于「合并」，正好符合整理标签时的直觉。
 */
export function renameTag(
  conn: Database.Database,
  from: string,
  to: string,
): boolean {
  const oldName = from.trim();
  const newName = to.trim();
  if (!oldName || !newName || oldName === newName) return false;

  conn.transaction(() => {
    // 先复制：把旧标签的全部关联转投到新名下，已有同组合自动跳过
    conn
      .prepare(
        `INSERT OR IGNORE INTO knowledge_item_tags (item_id, tag)
         SELECT item_id, ? FROM knowledge_item_tags WHERE tag = ?`,
      )
      .run(newName, oldName);
    // 再清旧：此时新名已完整接管，旧名可以整体退场
    conn.prepare(`DELETE FROM knowledge_item_tags WHERE tag = ?`).run(oldName);
    // 只刷新真正受影响的条目（此刻持有新名标签的），不碰无关数据
    conn
      .prepare(
        `UPDATE knowledge_items SET updated_at = ? WHERE id IN
         (SELECT item_id FROM knowledge_item_tags WHERE tag = ?)`,
      )
      .run(Date.now(), newName);
  })();
  return true;
}

/** 全局删除标签：从所有条目上摘掉这个标签（对应 UI「管理标签」的删除按钮） */
export function removeTag(conn: Database.Database, tag: string): boolean {
  const name = tag.trim();
  if (!name) return false;
  const info = conn
    .prepare(`DELETE FROM knowledge_item_tags WHERE tag = ?`)
    .run(name);
  return info.changes > 0;
}

/** 全部标签及使用计数：驱动标签选择器候选列表与筛选入口。
 *  排序按使用次数降序、次键字典序稳定并列——常用标签排前面才符合直觉 */
export interface TagCount {
  tag: string;
  count: number;
}

export function listTags(conn: Database.Database): TagCount[] {
  return conn
    .prepare(
      `SELECT tag, COUNT(*) AS count FROM knowledge_item_tags GROUP BY tag ORDER BY count DESC, tag`,
    )
    .all() as TagCount[];
}

/** 硬删除：tags 随外键 CASCADE 自动清理，无需手动收尾 */
export function deleteItem(conn: Database.Database, id: string): boolean {
  const info = conn
    .prepare(`DELETE FROM knowledge_items WHERE id = ?`)
    .run(id);
  return info.changes > 0;
}

/** 各状态计数：给前端「待拍板红点」和导航角标一次性取数用 */
export function countsByStatus(
  conn: Database.Database,
): Record<KnowledgeStatus, number> {
  const rows = conn
    .prepare(`SELECT status, COUNT(*) AS c FROM knowledge_items GROUP BY status`)
    .all() as Array<{ status: string; c: number }>;
  const result: Record<KnowledgeStatus, number> = {
    inbox: 0,
    kept: 0,
    discarded: 0,
    trashed: 0,
  };
  for (const r of rows) {
    if ((KNOWLEDGE_STATUSES as readonly string[]).includes(r.status)) {
      result[r.status as KnowledgeStatus] = r.c;
    }
  }
  return result;
}
