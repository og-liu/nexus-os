// 摘录模块（阶段4 P2）：详情页选中文字存成「读书划线」。
//
// 设计取舍：本版摘录是纯文本记录（原文 + 时间），不做原文内高亮渲染——
// 快照是净化后的 HTML，选区跨节点时无法稳定定位回原 DOM 做高亮标记，
// 硬做得存偏移量、跟快照版本绑死，成本高且脆。先让「摘的内容能存住、
// 能回看、能删」成立，高亮渲染等真实使用反馈再议（方案里 P2 本就是
// 可选增强，做减法优先）。

import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

/** 摘录一行数据的形状（与 knowledge_excerpts 表列一一对应） */
export interface ExcerptRow {
  id: string;
  item_id: string;
  text: string;
  note: string | null;
  created_at: number;
}

/** 限制摘录长度：太短没意义（误触选中几个字），太长不是摘录是复制全文 */
const MIN_EXCERPT_LEN = 3;
const MAX_EXCERPT_LEN = 1000;

export function addExcerpt(
  conn: Database.Database,
  itemId: string,
  text: string,
  note?: string,
): { row: ExcerptRow } | { duplicate: true } {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length < MIN_EXCERPT_LEN) {
    throw new Error("摘录太短了（至少 3 个字）");
  }
  if (trimmed.length > MAX_EXCERPT_LEN) {
    throw new Error(`摘录太长了（最多 ${MAX_EXCERPT_LEN} 字）`);
  }

  // 同一条目里存过一模一样的文字就不再存：手抖双击、翻页回来又选一次，
  // 都是真实会发生的事。按原文判重（不含 note）——同一句话的两次摘录
  // 没有信息增量
  const dup = conn
    .prepare("SELECT id FROM knowledge_excerpts WHERE item_id = ? AND text = ?")
    .get(itemId, trimmed);
  if (dup) return { duplicate: true };

  const row: ExcerptRow = {
    id: randomUUID(),
    item_id: itemId,
    text: trimmed,
    note: (note ?? "").trim() || null,
    created_at: Date.now(),
  };
  conn
    .prepare(
      `INSERT INTO knowledge_excerpts (id, item_id, text, note, created_at)
       VALUES (@id, @item_id, @text, @note, @created_at)`,
    )
    .run(row);
  return { row };
}

/** 列某条目的全部摘录，先摘的在前（读书的自然顺序） */
export function listExcerpts(
  conn: Database.Database,
  itemId: string,
): ExcerptRow[] {
  return conn
    .prepare(
      "SELECT * FROM knowledge_excerpts WHERE item_id = ? ORDER BY created_at ASC",
    )
    .all(itemId) as ExcerptRow[];
}

/** 删一条摘录。条目删除时靠外键级联，不经过这里 */
export function removeExcerpt(
  conn: Database.Database,
  id: string,
): boolean {
  const r = conn.prepare("DELETE FROM knowledge_excerpts WHERE id = ?").run(id);
  return r.changes > 0;
}
