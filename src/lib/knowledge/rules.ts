// 自动归档规则模块（阶段4 P2）：满足条件自动打标签。
//
// 语义边界（项目铁律）：规则只打标签、不替人拍板留弃。打标是整理——
// 可逆、无损；拍板是决策——丢弃有反悔成本。所谓「自动归档」在这套
// 系统里的实现是「自动打好标签，人拍板时一眼看出该进哪个抽屉」。
//
// 匹配逻辑刻意做宽（包含匹配而非精确相等）：
// - domain：pattern 写 github.com，条目链接的域名含它就命中——
//   用户心智是「GitHub 来的都算」，不是「只有这个子域名」
// - keyword：标题或正文含关键词。正文只取前 2000 字——规则的
//   意图是「这篇文章讲什么」，主旨几乎总在开头

import type Database from "better-sqlite3";
import { getItem, setTags } from "./store";

export type RuleType = "domain" | "keyword";

/** 规则一行数据的形状（与 knowledge_rules 表列一一对应） */
export interface RuleRow {
  id: number;
  type: RuleType;
  pattern: string;
  tag: string;
  enabled: number;
  created_at: number;
}

export function listRules(conn: Database.Database): RuleRow[] {
  return conn
    .prepare("SELECT * FROM knowledge_rules ORDER BY created_at ASC")
    .all() as RuleRow[];
}

export function addRule(
  conn: Database.Database,
  input: { type: RuleType; pattern: string; tag: string },
): RuleRow {
  const pattern = input.pattern.trim();
  const tag = input.tag.trim();
  if (!pattern) throw new Error("匹配内容不能为空");
  if (!tag) throw new Error("要打的标签不能为空");
  if (tag.length > 30) throw new Error("标签最长 30 字");

  // 同型同 pattern 的规则不重复建：规则表是给系统跑的（每入库一条都要
  // 全表扫一遍），重复规则纯耗性能且没有任何语义增量
  const dup = conn
    .prepare("SELECT id FROM knowledge_rules WHERE type = ? AND pattern = ?")
    .get(input.type, pattern);
  if (dup) throw new Error("这条规则已经存在了");

  const now = Date.now();
  const info = conn
    .prepare(
      `INSERT INTO knowledge_rules (type, pattern, tag, enabled, created_at)
       VALUES (?, ?, ?, 1, ?)`,
    )
    .run(input.type, pattern, tag, now);
  return {
    id: Number(info.lastInsertRowid),
    type: input.type,
    pattern,
    tag,
    enabled: 1,
    created_at: now,
  };
}

export function removeRule(conn: Database.Database, id: number): boolean {
  const r = conn.prepare("DELETE FROM knowledge_rules WHERE id = ?").run(id);
  return r.changes > 0;
}

export function setRuleEnabled(
  conn: Database.Database,
  id: number,
  enabled: boolean,
): boolean {
  const r = conn
    .prepare("UPDATE knowledge_rules SET enabled = ? WHERE id = ?")
    .run(enabled ? 1 : 0, id);
  return r.changes > 0;
}

/** 从 URL 里取域名（小写）。取不出域名（相对路径、非 URL）返回 null */
function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** 对某条知识条目跑一遍所有启用的规则，命中的标签挂上。
 *  返回本次新挂上的标签列表（调用方拿去记日志）。
 *  已有的标签不重复挂（setTags 内部按集合合并）；条目不存在返回空数组 */
export function applyRulesToItem(
  conn: Database.Database,
  itemId: string,
): string[] {
  const item = getItem(conn, itemId);
  if (!item) return [];

  const rules = listRules(conn).filter((r) => r.enabled === 1);
  if (rules.length === 0) return [];

  const domain = item.source_url ? domainOf(item.source_url) : null;
  const haystack =
    `${item.title}\n${item.content.slice(0, 2000)}`.toLowerCase();

  const hits = new Set<string>();
  for (const rule of rules) {
    if (rule.type === "domain") {
      if (domain && domain.includes(rule.pattern.toLowerCase())) {
        hits.add(rule.tag);
      }
    } else {
      if (haystack.includes(rule.pattern.toLowerCase())) {
        hits.add(rule.tag);
      }
    }
  }
  if (hits.size === 0) return [];

  // 合并追加而非替换：条目可能已有人工标签，规则不能覆盖人的决定
  const merged = [...new Set([...item.tags, ...hits])];
  setTags(conn, itemId, merged);
  return [...hits];
}
