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
import {
  EMBEDDING_MODEL,
  blobToVector,
  cosineSimilarity,
  vectorToBlob,
} from "@/lib/embeddings";

/** 知识条目的生命周期状态（语义见 db.ts 建表注释） */
export type KnowledgeStatus = "inbox" | "kept" | "discarded" | "trashed";

/** 状态白名单：store 层唯一权威，写入前必须过这道闸 */
const KNOWLEDGE_STATUSES: readonly KnowledgeStatus[] = [
  "inbox",
  "kept",
  "discarded",
  "trashed",
];

/**
 * 条目出身（K3 前置决策：笔记与采集共用一张表，用身份字段区分而非分表）。
 * captured = 外部采集（走 inbox 拍板流）；note = 用户手写（创建即 kept）。
 * 共表让搜索/标签/回收站/AI 检索只维护一套设施；查询侧必须带 kind 防串味。
 */
export type KnowledgeKind = "captured" | "note";

const KNOWLEDGE_KINDS: readonly KnowledgeKind[] = ["captured", "note"];

function assertKind(kind: string): asserts kind is KnowledgeKind {
  if (!KNOWLEDGE_KINDS.includes(kind as KnowledgeKind)) {
    throw new Error(`非法的条目类型：${kind}（允许：${KNOWLEDGE_KINDS.join(" / ")}）`);
  }
}

/** 面向上层的知识条目视图：SQL 行 + 组装好的标签数组 */
export interface KnowledgeItemRow {
  id: string;
  title: string;
  /** Markdown 正文（存储即纯文本单一事实源，渲染归前端） */
  content: string;
  source: string | null;
  source_url: string | null;
  status: KnowledgeStatus;
  kind: KnowledgeKind;
  /** 进入回收站的时间（仅 trashed 有值），7 天懒清理依据 */
  deleted_at: number | null;
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
  kind: string;
  deleted_at: number | null;
  /** K4：语义指纹二进制与模型名——只在混合检索内部使用，
   *  不进 KnowledgeItemRow 对外暴露（列表/详情没必要拖 4KB 二进制） */
  embedding: Buffer | null;
  embedding_model: string | null;
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
    kind: r.kind as KnowledgeKind,
    tags: tagsByItem.get(r.id) ?? [],
  }));
}

export interface CreateItemInput {
  title?: string;
  content?: string;
  source?: string | null;
  source_url?: string | null;
  status?: KnowledgeStatus;
  /** 出身：captured（默认，采集流）/ note（手写文章）。默认值放 store，
   *  route 层显式传参时以 route 为准（如笔记创建传 kind=note + status=kept） */
  kind?: KnowledgeKind;
  tags?: string[];
}

export function createItem(
  conn: Database.Database,
  input: CreateItemInput,
): KnowledgeItemRow {
  const status = input.status ?? "inbox"; // 采集默认进「待拍板」，与产品采集流的默认行为对齐
  assertStatus(status);
  const kind = input.kind ?? "captured"; // 不传出身按采集处理，兼容既有调用方
  assertKind(kind);

  const now = Date.now();
  const id = randomUUID();

  conn
    .prepare(
      `INSERT INTO knowledge_items (id, title, content, source, source_url, status, kind, deleted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    )
    .run(id, input.title?.trim() ?? "", input.content ?? "", input.source ?? null, input.source_url ?? null, status, kind, now, now);

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
  /** 排除某状态：HTTP 列表默认排除 trashed（回收站是独立视图，不混进常规列表），
   *  比「查出来再过滤」正确——分页计数不会错位 */
  notStatus?: KnowledgeStatus;
  /** 出身过滤：知识流只看 captured、我的文章只看 note，由调用方显式指定防串味 */
  kind?: KnowledgeKind;
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
  if (opts.notStatus) {
    assertStatus(opts.notStatus);
    conds.push("status != ?");
    params.push(opts.notStatus);
  }
  if (opts.kind) {
    assertKind(opts.kind);
    conds.push("kind = ?");
    params.push(opts.kind);
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
  if (patch.status !== undefined) {
    assertStatus(patch.status);
    // 状态机保护：进出回收站必须走 trashItem / restoreItem（它们同步维护
    // deleted_at 时间戳），直接改 status 会漏掉时间戳，7 天清理就失去依据
    if (patch.status === "trashed") {
      throw new Error('请使用 trashItem 进入回收站，不允许直接把 status 改为 "trashed"');
    }
    const current = getItem(conn, id);
    if (current?.status === "trashed") {
      throw new Error("回收站内的条目请先 restoreItem 捞回，再修改状态");
    }
  }

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

// ---------- 回收站（K3 前置：软删 → 捞回 → 7 天懒清理） ----------
// 与 discarded 的语义分野：discarded 是「从未保留过」（拍板放弃），trashed 是
// 「曾经保留过再删」。回收站只收后者——用户亲手留下的东西才值得给反悔期。

/** 软删除：kept → trashed 并记录 deleted_at。只有保留过的条目能进回收站，
 *  inbox/discarded 条目没有「反悔」概念（前者还没拍板、后者已经拍板放弃） */
export function trashItem(conn: Database.Database, id: string): KnowledgeItemRow | null {
  const current = getItem(conn, id);
  if (!current || current.status !== "kept") return null;
  const now = Date.now();
  conn
    .prepare(
      `UPDATE knowledge_items SET status = 'trashed', deleted_at = ?, updated_at = ? WHERE id = ?`,
    )
    .run(now, now, id);
  return getItem(conn, id);
}

/** 捞回：trashed → kept，清除 deleted_at。条目回到它被删前的位置（知识流或我的文章） */
export function restoreItem(conn: Database.Database, id: string): KnowledgeItemRow | null {
  const current = getItem(conn, id);
  if (!current || current.status !== "trashed") return null;
  conn
    .prepare(
      `UPDATE knowledge_items SET status = 'kept', deleted_at = NULL, updated_at = ? WHERE id = ?`,
    )
    .run(Date.now(), id);
  return getItem(conn, id);
}

/**
 * 懒清理：删掉进回收站超过 maxAgeMs 的条目。
 * 为什么不做定时任务：单机 SQLite 没有后台进程，而「列表请求顺手清一次」
 * 效果完全等价——过期条目反正不会展示给用户，晚几毫秒物理消失无感知，
 * 却省掉一整套 cron 基础设施。返回本次清理的条数（供日志/测试断言）。
 */
export function purgeExpiredTrash(
  conn: Database.Database,
  maxAgeMs: number = 7 * 24 * 3_600_000,
): number {
  const cutoff = Date.now() - maxAgeMs;
  const info = conn
    .prepare(
      `DELETE FROM knowledge_items WHERE status = 'trashed' AND deleted_at IS NOT NULL AND deleted_at < ?`,
    )
    .run(cutoff);
  return info.changes;
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
// ─── K4 向量检索：语义指纹存取 + 混合检索（关键词路 × 语义路 RRF 融合）───

/**
 * 写入/更新某条目的语义指纹。
 * 指纹的生成（调嵌入 API）不在这里做——store 保持「纯数据层」：
 * 只管存取和计算，不碰任何外部服务。生成是 route 层编排的事。
 */
export function setEmbedding(
  conn: Database.Database,
  id: string,
  vector: Float32Array,
  model: string = EMBEDDING_MODEL,
): void {
  const info = conn
    .prepare(
      `UPDATE knowledge_items SET embedding = ?, embedding_model = ? WHERE id = ?`,
    )
    .run(vectorToBlob(vector), model, id);
  if (info.changes === 0) throw new Error(`条目不存在: ${id}`);
}

/**
 * 找出所有需要补算指纹的已保留条目：没有指纹的，或指纹是用别的模型算的。
 * 「模型不符也要重算」是关键设计：不同模型的向量不在同一空间，
 * 新旧混比等于拿厘米和英寸做加法。回填脚本靠它做到可重复执行（幂等）。
 */
export function listItemsNeedingEmbedding(
  conn: Database.Database,
  model: string = EMBEDDING_MODEL,
): KnowledgeItemRow[] {
  const rows = conn
    .prepare(
      `SELECT * FROM knowledge_items
       WHERE status = 'kept'
         AND (embedding IS NULL OR embedding_model != ?)`,
    )
    .all(model) as ItemSqlRow[];
  return attachTags(conn, rows);
}

/** 清掉指纹（内容被改但重算失败时会用到，让回填脚本能重新认领它） */
export function clearEmbedding(conn: Database.Database, id: string): void {
  conn
    .prepare(
      `UPDATE knowledge_items SET embedding = NULL, embedding_model = NULL WHERE id = ?`,
    )
    .run(id);
}

export interface HybridSearchOptions {
  /** 用户查询词 */
  q: string;
  /** 查询词的语义向量。调用方负责生成；传 null/undefined 时退化为纯关键词检索
   *  （嵌入服务挂了不该拖垮整个搜索）*/
  qVector?: Float32Array | null;
  kind?: KnowledgeKind;
  limit?: number;
}

/**
 * 混合检索内核：关键词路 + 语义路，两路排名用 RRF（倒数排名融合）合并。
 *
 * 为什么两路都要：关键词路抓「字面精确命中」（型号名、专有名词它最强），
 * 语义路抓「意思相近但字面不同」（搜大模型能找到写 LLM 的文章），
 * 单独哪一路都会漏。RRF 公式出奇的简单有效：
 *   每条目得分 = Σ 它在每路排名 r 的 1/(60+r)
 * 排得越靠前加分越多；两路都上榜的条目自然浮到最顶。
 * k=60 是业界验证过的大量场景下的稳健默认值（出自原论文）。
 *
 * 为什么不上向量数据库：个人知识库量级（千条内）下，全表向量
 * 在内存里暴力点积是毫秒级开销，「向量数据库」是百万级数据的工具。
 * 先用对的简单方案，规模真到了再升级——不过早优化。
 */
export function searchHybrid(
  conn: Database.Database,
  opts: HybridSearchOptions,
): { items: KnowledgeItemRow[]; total: number } {
  const q = opts.q.trim();
  if (!q) return { items: [], total: 0 };
  const limit = Math.min(Math.max(opts.limit ?? 5, 1), 20);
  const POOL = 20; // 每路候选池大小：取宽一点给融合留余地，最后再截断

  // 过滤条件两路共用：只搜 kept（与 Agent 工具的语义红线一致），kind 可选收窄
  const conds = [`status = 'kept'`];
  const params: Array<string | number> = [];
  if (opts.kind) {
    assertKind(opts.kind);
    conds.push(`kind = ?`);
    params.push(opts.kind);
  }
  const where = conds.join(` AND `);

  // ── 路1 关键词（LIKE 字面匹配），按更新时间排（LIKE 无相关度可言）
  const kwRows = conn
    .prepare(
      `SELECT id FROM knowledge_items WHERE ${where}
       AND (title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')
       ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(
      ...params,
      `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`,
      `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`,
      POOL,
    ) as Array<{ id: string }>;

  // RRF 记分板：id → 累计分
  const scores = new Map<string, number>();
  kwRows.forEach((r, i) => {
    scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (60 + i + 1));
  });

  // ── 路2 语义（向量点积排序）。查询向量缺失就整路跳过（优雅降级）
  let semanticHits = 0;
  if (opts.qVector) {
    const vecRows = conn
      .prepare(
        `SELECT id, embedding FROM knowledge_items
         WHERE ${where} AND embedding IS NOT NULL AND embedding_model = ?`,
      )
      .all(...params, EMBEDDING_MODEL) as Array<{
      id: string;
      embedding: Buffer;
    }>;

    const ranked = vecRows
      .map((r) => ({
        id: r.id,
        sim: cosineSimilarity(opts.qVector!, blobToVector(r.embedding)),
      }))
      // 相关性门槛：低于它的基本是噪声，别占候选池名额
      .filter((r) => r.sim > 0.35)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, POOL);

    semanticHits = ranked.length;
    ranked.forEach((r, i) => {
      scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (60 + i + 1));
    });
  }

  // ── 融合排序，取前 limit 条补全标签返回
  const merged = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  const items = merged
    .map((id) => getItem(conn, id))
    .filter((x): x is KnowledgeItemRow => x !== null);

  return { items, total: items.length };
}