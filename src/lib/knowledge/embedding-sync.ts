// 语义指纹的「编排层」：把嵌入服务（外部 IO）和数据层（纯 SQLite）接起来。
//
// 为什么单独一层：store 保持纯数据操作（同步、可测试、不碰网络），
// 「调 API 拿向量再落库」这个带副作用的流程归这里管。
// 失败策略是全链路的关键设计：指纹算不出来绝不阻塞保存——
// 大不了这条暂时没有语义指纹，关键词路照样能搜到它，回头回填补上。

import type Database from "better-sqlite3";
import { embedMany, embedText } from "@/lib/embeddings";
import {
  listItemsNeedingEmbedding,
  setEmbedding,
} from "./store";

/** 单条同步：内容保存后调用。任何失败都只记日志，不影响主流程 */
export async function syncEmbedding(
  conn: Database.Database,
  id: string,
  title: string,
  content: string,
): Promise<void> {
  try {
    // 标题拼进正文一起算：标题往往是最浓缩的主题信号
    const vec = await embedText(`${title}\n${content}`);
    setEmbedding(conn, id, vec);
  } catch (err) {
    console.warn(
      `[embedding-sync] 条目 ${id} 指纹生成失败，等待回填:`,
      err instanceof Error ? err.message : err,
    );
  }
}

export interface BackfillResult {
  /** 本次成功补算的条数 */
  embedded: number;
  /** 失败条数（下次回填会自动重试） */
  failed: number;
  /** 剩余未处理（理论上为 0，除非中途断网） */
  remaining: number;
}

/**
 * 回填：给所有缺指纹/模型不符的已保留条目补算向量。
 * 幂等——跑多少次结果都收敛到「所有 kept 都有当前模型的指纹」。
 * 用法：curl -X POST .../api/knowledge/backfill
 */
export async function backfillEmbeddings(
  conn: Database.Database,
): Promise<BackfillResult> {
  const pending = listItemsNeedingEmbedding(conn);
  let embedded = 0;
  let failed = 0;

  while (pending.length > 0) {
    const batch = pending.splice(0, 16);
    try {
      const texts = batch.map((it) => `${it.title}\n${it.content}`);
      const vectors = await embedMany(texts);
      batch.forEach((it, i) => setEmbedding(conn, it.id, vectors[i]));
      embedded += batch.length;
    } catch (err) {
      console.warn(
        `[backfill] 批次失败:`,
        err instanceof Error ? err.message : err,
      );
      failed += batch.length;
    }
  }

  return {
    embedded,
    failed,
    remaining: listItemsNeedingEmbedding(conn).length,
  };
}
