// 知识库工具单元测试（K3：Agent 衔接）。
// 直接测 tools.ts 导出的内核函数 runKnowledgeSearch / runKnowledgeRead，
// 全部跑在 :memory: 内存库上——不碰真实 data/nexus.db，
// 也不需要真的发起 LLM 调用（工具的 execute 薄壳不在测试范围）。

import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createInMemoryDb } from "../db";
import {
  createItem,
  updateItem,
  trashItem,
} from "@/lib/knowledge/store";
import {
  runKnowledgeSearch,
  runKnowledgeRead,
} from "./tools";

let conn: Database.Database;

beforeEach(() => {
  conn = createInMemoryDb();
});

/** 造一条已保留（kept）的测试数据，返回 id。
 * 注意必须显式传 status——createItem 默认进收件箱（inbox），而知识库工具只对 kept 可见 */
function seed(
  title: string,
  content: string,
  kind: "note" | "captured" = "captured",
): string {
  const item = createItem(conn, {
    title,
    content,
    source: "手动采集",
    kind,
    status: "kept",
  });
  return item.id;
}

describe("search_knowledge 内核", () => {
  it("语义红线：只有 kept 对 Agent 可见", async () => {
    const keptId = seed("Agent 记忆机制", "kept 的正文提到 agent");
    const inboxId = seed("Agent 待拍板", "inbox 的正文提到 agent");
    const trashedId = seed("Agent 回收站", "trashed 的正文提到 agent");
    const discardedId = seed("Agent 已放弃", "discarded 的正文提到 agent");

    // 把三条推进各自的状态
    updateItem(conn, inboxId, { status: "inbox" }); // 默认就是 inbox，显式写清意图
    await trashItem(conn, trashedId); // kept → trashed
    updateItem(conn, discardedId, { status: "discarded" });

    const result = (await runKnowledgeSearch(conn, { q: "agent" })) as {
      results: Array<{ id: string }>;
      total: number;
    };

    expect(result.total).toBe(1);
    expect(result.results.map((r) => r.id)).toEqual([keptId]);
  });

  it("关键词同时命中标题和正文，返回摘要与元数据", async () => {
    seed("向量数据库入门", "正文里讲 embedding 检索");
    const result = (await runKnowledgeSearch(conn, { q: "向量" })) as {
      total: number;
      results: Array<Record<string, unknown>>;
    };

    expect(result.total).toBe(1);
    const r = result.results[0];
    expect(r.title).toBe("向量数据库入门");
    expect(r.kind).toBe("采集条目"); // kind 已翻成给模型看的中文
    expect(String(r.excerpt)).toContain("embedding");
  });

  it("kind 参数收窄：只要手写笔记", async () => {
    seed("采集的同名文章", "captured 版本内容");
    seed("我的同名笔记", "note 版本内容", "note");

    const all = (await runKnowledgeSearch(conn, { q: "同名" })) as {
      total: number;
    };
    const notesOnly = (await runKnowledgeSearch(conn, {
      q: "同名",
      kind: "note",
    })) as { total: number; results: Array<{ kind: string }> };

    expect(all.total).toBe(2);
    expect(notesOnly.total).toBe(1);
    expect(notesOnly.results[0].kind).toBe("手写笔记");
  });

  it("摘要截断：长文压成一行并截到 200 字加省略号", async () => {
    const long = "很长的段落。\n第二行也很多字。".repeat(40);
    seed("长文测试", long);

    const result = (await runKnowledgeSearch(conn, { q: "长文" })) as {
      results: Array<{ excerpt: string }>;
    };
    const excerpt = result.results[0].excerpt;

    // 换行被压成空格（不会出现 \n），总长 200 字 + 省略号，且以 … 结尾
    expect(excerpt).not.toContain("\n");
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(201);
  });

  it("缺 q 报错；limit 上限 10、非法值回退默认", async () => {
    expect(((await runKnowledgeSearch(conn, {})) as { error: string }).error).toBeTruthy();

    for (let i = 0; i < 15; i++) seed(`条目${i} 关键词`, `内容${i}`);
    const capped = (await runKnowledgeSearch(conn, {
      q: "关键词",
      limit: 99,
    })) as { total: number };
    expect(capped.total).toBe(10);
  });
});

describe("read_knowledge 内核", () => {
  it("按 id 读全文与元数据", async () => {
    const id = seed("RAG 检索增强", "全文内容在这里");
    const result = (await runKnowledgeRead(conn, { id })) as Record<
      string,
      unknown
    >;

    expect(result.title).toBe("RAG 检索增强");
    expect(result.content).toBe("全文内容在这里");
    expect(result.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("非 kept 只报状态原因，不泄露内容", async () => {
    const id = seed("会被删掉的文章", "回收站里的机密内容");
    await trashItem(conn, id);

    const result = (await runKnowledgeRead(conn, { id })) as {
      error?: string;
      content?: string;
    };

    expect(result.error).toContain("回收站");
    expect(result.content).toBeUndefined(); // 正文一个字都不能漏出去
  });

  it("不存在的 id 返回明确错误", async () => {
    const result = (await runKnowledgeRead(conn, { id: "no-such-id" })) as {
      error?: string;
    };
    expect(result.error).toContain("不存在");
  });

  it("缺 id 提示先搜索", async () => {
    const result = (await runKnowledgeRead(conn, {})) as { error?: string };
    expect(result.error).toContain("search_knowledge");
  });
});
