// 重复检测的查询层（阶段2 P0）：拿着 simhash.ts 的算法去库里找重复。
//
// 分层说明：算法（纯计算）在 simhash.ts，这里只做「查库 + 比对」的粘合，
// route 层调用。store 不掺和——它是通用 CRUD，查重是采集入口的业务策略。
//
// 比对范围的取舍：只认 inbox / kept / draft 三种「活着的」条目——
// discarded（用户明确不要了）和 trashed（删除待清）不算数：同一篇文章
// 用户「不要了」之后又采集一次，说明反悔了，该让他重新存，而不是弹「已有」。

import type Database from "better-sqlite3";
import { hammingDistance, normalizeUrl } from "@/lib/knowledge/simhash";

/** 近似判重的汉明距离阈值：≤3 位不同即视为同一篇文章。
 *  经验值：转载改动（替换几处词、加个「来源：xxx」）一般只翻转 0~3 位；
 *  两篇只是话题相近的文章距离通常在 20 位以上，3 是安全又不迟钝的线 */
const SIMHASH_THRESHOLD = 3;

/** 参与查重的最小行信息（列表提示用，不拖正文） */
export interface DuplicateHit {
  id: string;
  title: string;
  status: string;
}

/** 按归一化 URL 查库找重复。
 *  为什么内存比对而不是 SQL 等值查询：库里存量 source_url 是各时期、
 *  各入口写入的原始形态，没法保证「存的时候就归一化过」；把候选行拉回
 *  内存统一归一化再比，历史数据不用洗也能查准。个人库量级（几千条）
 *  这一次全扫是毫秒级，不值得为它建归一化列 + 索引 */
export function findDuplicateByUrl(
  conn: Database.Database,
  url: string,
): DuplicateHit | null {
  const rows = conn
    .prepare(
      `SELECT id, title, status, source_url FROM knowledge_items
       WHERE source_url IS NOT NULL AND status IN ('inbox', 'kept', 'draft')`,
    )
    .all() as Array<{ id: string; title: string; status: string; source_url: string }>;
  const target = normalizeUrl(url);
  for (const r of rows) {
    if (normalizeUrl(r.source_url) === target) {
      return { id: r.id, title: r.title, status: r.status };
    }
  }
  return null;
}

/** 按文本指纹查库找近似重复（调方先算好 simhash 传进来）。
 *  同样是全量拉回内存逐对比对：汉明距离没法用 SQL 索引表达，
 *  而几千条 × 64 位异或 popcount 在 JS 里是亚毫秒级的事 */
export function findDuplicateBySimhash(
  conn: Database.Database,
  simhash: string,
): DuplicateHit | null {
  if (!simhash) return null;
  const rows = conn
    .prepare(
      `SELECT id, title, status, simhash FROM knowledge_items
       WHERE simhash IS NOT NULL AND simhash != '' AND status IN ('inbox', 'kept', 'draft')`,
    )
    .all() as Array<{ id: string; title: string; status: string; simhash: string }>;
  for (const r of rows) {
    if (hammingDistance(simhash, r.simhash) <= SIMHASH_THRESHOLD) {
      return { id: r.id, title: r.title, status: r.status };
    }
  }
  return null;
}

/** 全库重复报告：归一化 URL 相同 或 指纹距离 ≤3 的条目聚成一组。
 *  给将来「批量去重」功能（知识库设置里的兜底入口）当数据底座：
 *  先能稳定找出「谁和谁重复」，合并/保留策略再往上叠 */
export function findDuplicates(conn: Database.Database): Array<{
  reason: "url" | "simhash";
  items: Array<{ id: string; title: string; status: string; created_at: number }>;
}> {
  const rows = conn
    .prepare(
      `SELECT id, title, status, source_url, simhash, created_at FROM knowledge_items
       WHERE status IN ('inbox', 'kept', 'draft') ORDER BY created_at ASC`,
    )
    .all() as Array<{
    id: string;
    title: string;
    status: string;
    source_url: string | null;
    simhash: string | null;
    created_at: number;
  }>;

  // 并查集：同组重复的条目归并到同一个代表 id 下，避免 A-B、B-C 分组时
  // 把传递性的重复拆散（A、C 也该同组）
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) && parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const reasonOf = new Map<string, "url" | "simhash">(); // 组代表 → 判重原因
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      const sameUrl =
        a.source_url &&
        b.source_url &&
        normalizeUrl(a.source_url) === normalizeUrl(b.source_url);
      const sameText =
        a.simhash &&
        b.simhash &&
        hammingDistance(a.simhash, b.simhash) <= SIMHASH_THRESHOLD;
      if (sameUrl || sameText) {
        union(a.id, b.id);
        // url 判重比 simhash 判重更「实锤」，同组时优先标注 url
        const root = find(a.id);
        if (sameUrl || reasonOf.get(root) !== "url") {
          reasonOf.set(root, sameUrl ? "url" : "simhash");
        }
      }
    }
  }

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const root = find(r.id);
    const g = groups.get(root);
    if (g) g.push(r);
    else groups.set(root, [r]);
  }

  return [...groups.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([root, items]) => ({
      reason: reasonOf.get(root) ?? "simhash",
      items: items.map(({ id, title, status, created_at }) => ({
        id,
        title,
        status,
        created_at,
      })),
    }));
}
