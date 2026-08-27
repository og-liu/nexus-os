// 降级条目的重抓（阶段2 P0·失败兜底）。
//
// 场景：当初只按链接落库（没抓到正文）的条目，网络恢复 / 站点解除屏蔽后
// 把正文补回来。两个入口共用这份逻辑：
// - 用户点「重新抓取」按钮 → POST /api/knowledge/[id]/refetch
// - 降级落库 45 秒后的后台自动重试（POST /api/knowledge 里 fire-and-forget）
//
// 成功时原地更新：正文/标题/快照/指纹一起补齐、degraded 清零，
// 条目保持 inbox（拍板权在人，重抓不该替用户做决定）；顺手刷新语义指纹，
// 让「补全后的正文」立即参与 AI 检索。

import type Database from "better-sqlite3";
import { syncEmbedding } from "@/lib/knowledge/embedding-sync";
import { fetchPage, isHttpUrl } from "@/lib/knowledge/fetch-page";
import { simhash64 } from "@/lib/knowledge/simhash";
import { getItem, updateItem, type KnowledgeItemRow } from "@/lib/knowledge/store";

export type RefetchResult =
  | { ok: true; item: KnowledgeItemRow }
  | { ok: false; reason: string };

/** 重抓一条降级条目。条目必须有 source_url（没有链接的纯文本条目无「重抓」可言） */
export async function refetchItem(
  conn: Database.Database,
  id: string,
): Promise<RefetchResult> {
  const item = getItem(conn, id);
  if (!item) return { ok: false, reason: "条目不存在" };
  if (!item.source_url) return { ok: false, reason: "这条没有链接，无法重抓" };
  if (!isHttpUrl(item.source_url)) {
    return { ok: false, reason: "链接不是 http/https，无法重抓" };
  }

  const fetched = await fetchPage(item.source_url);
  if (fetched.kind === "feed") {
    return { ok: false, reason: "这是订阅地址，去「自动」页添加关注" };
  }
  if (fetched.kind === "error") {
    // 不动原条目：降级条目保持原样，用户还可以再试。失败原因原样回传，
    // 让前端 toast 讲人话（「该网站拒绝抓取」比「error」有用得多）
    return { ok: false, reason: fetched.reason };
  }

  // 抓取成功：原地补全。title 保留抓到的（老标题是「来自 xxx 的链接」占位），
  // 但抓不到 title 时回落旧标题——别用空标题覆盖占位提示
  const content = fetched.description
    ? `${fetched.description}\n\n${fetched.text}`
    : fetched.text;
  const updated = updateItem(conn, id, {
    title: fetched.title || item.title,
    content,
    snapshot_html: fetched.html,
    simhash: simhash64(`${fetched.title}\n${fetched.text}`),
    degraded: 0,
  });
  if (!updated) return { ok: false, reason: "条目不存在" };

  // 正文变了语义指纹也必须重算，否则 AI 检索到的是旧向量（占位文案的向量）
  void syncEmbedding(conn, updated.id, updated.title, updated.content);
  return { ok: true, item: updated };
}
