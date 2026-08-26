// knowledge store 单元测试（K0 数据地基）。
// 全部跑在 :memory: 内存库上（createInMemoryDb），不碰真实 data/nexus.db。

import { describe, it, expect, beforeEach } from "vitest";
import { createInMemoryDb } from "../db";
import type Database from "better-sqlite3";
import {
  createItem,
  getItem,
  listItems,
  updateItem,
  setTags,
  deleteItem,
  countsByStatus,
} from "./store";

let conn: Database.Database;

beforeEach(() => {
  conn = createInMemoryDb();
});

describe("knowledge store · createItem / getItem", () => {
  it("创建后能完整回读（含标签与默认状态 inbox）", () => {
    const created = createItem(conn, {
      title: "Skill 深度解析",
      content: "# Skill 是什么\n技能文件夹…",
      source: "手动粘贴",
      source_url: "https://example.com/a",
      tags: ["agent", "skill", "agent"],
    });

    expect(created.id).toBeTruthy();
    expect(created.status).toBe("inbox");
    expect(created.title).toBe("Skill 深度解析");
    // 重复标签应被去重，读出按字典序稳定排列
    expect(created.tags).toEqual(["agent", "skill"]);

    const fetched = getItem(conn, created.id);
    expect(fetched?.content).toContain("技能文件夹");
    expect(fetched?.tags).toEqual(["agent", "skill"]);
  });

  it("允许只有正文没有标题的采集（title 兜底空串）", () => {
    const item = createItem(conn, { content: "一段随手存的话" });
    expect(item.title).toBe("");
    expect(item.status).toBe("inbox");
  });

  it("非法状态直接拒绝，脏数据进不了库", () => {
    expect(() =>
      createItem(conn, { content: "x", status: "published" as never }),
    ).toThrow(/非法的知识状态/);
  });
});

describe("knowledge store · listItems", () => {
  beforeEach(() => {
    createItem(conn, {
      title: "Agent 编排模式",
      content: "Plan-and-Execute 是一种任务规划范式",
      status: "kept",
      tags: ["agent"],
    });
    createItem(conn, {
      title: "RAG 入门",
      content: "检索增强生成让回答有据可依",
      status: "inbox",
      tags: ["rag", "检索"],
    });
    createItem(conn, {
      title: "周末菜谱",
      content: "番茄炒蛋的做法",
      status: "kept",
      tags: ["生活"],
    });
  });

  it("按 status 过滤 + total 反映过滤后的总数", () => {
    const kept = listItems(conn, { status: "kept" });
    expect(kept.total).toBe(2);
    expect(kept.items.map((i) => i.title).sort()).toEqual([
      "Agent 编排模式",
      "周末菜谱",
    ]);

    expect(listItems(conn, { status: "inbox" }).total).toBe(1);
  });

  it("关键词同时命中标题与正文", () => {
    // 命中标题
    expect(listItems(conn, { q: "RAG" }).total).toBe(1);
    // 命中正文（标题里没有「范式」）
    expect(listItems(conn, { q: "范式" }).items[0]?.title).toBe(
      "Agent 编排模式",
    );
    // 无关词零命中
    expect(listItems(conn, { q: "不存在的词" }).total).toBe(0);
  });

  it("关键词里的 LIKE 通配符按字面匹配，不当通配符用", () => {
    createItem(conn, { title: "100% 纯果汁笔记", content: "" });
    // % 若未转义会匹配一切（4 条全中）；正确转义后按字面意思只应命中
    // 标题里真含 % 的那一条
    expect(listItems(conn, { q: "100%" }).total).toBe(1);
    expect(listItems(conn, { q: "%" }).total).toBe(1);
  });

  it("按标签精确过滤", () => {
    const rag = listItems(conn, { tag: "rag" });
    expect(rag.total).toBe(1);
    expect(rag.items[0]?.title).toBe("RAG 入门");
  });

  it("status + tag + q 组合条件是 AND 关系", () => {
    expect(listItems(conn, { tag: "agent", q: "规划" }).total).toBe(1);
    expect(listItems(conn, { tag: "agent", q: "番茄" }).total).toBe(0);
  });

  it("limit/offset 分页且 total 不随分页变化", () => {
    const page = listItems(conn, { limit: 1, offset: 0 });
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(3);
  });
});

describe("knowledge store · updateItem / setTags", () => {
  it("更新内容并完成 inbox → kept 状态流转", () => {
    const item = createItem(conn, { content: "草稿" });
    const updated = updateItem(conn, item.id, {
      title: "定稿标题",
      status: "kept",
    });
    expect(updated?.status).toBe("kept");
    expect(updated?.title).toBe("定稿标题");
  });

  it("setTags 全量替换：多退少补", () => {
    const item = createItem(conn, { content: "x", tags: ["a", "b"] });
    setTags(conn, item.id, ["b", "c"]);
    expect(getItem(conn, item.id)?.tags.sort()).toEqual(["b", "c"]);
    // 全清空也合法
    setTags(conn, item.id, []);
    expect(getItem(conn, item.id)?.tags).toEqual([]);
  });
});

describe("knowledge store · deleteItem / countsByStatus", () => {
  it("删除条目后标签级联清理，不留孤儿行", () => {
    const item = createItem(conn, { content: "x", tags: ["t1"] });
    expect(deleteItem(conn, item.id)).toBe(true);

    expect(getItem(conn, item.id)).toBeNull();
    const orphan = conn
      .prepare(`SELECT COUNT(*) AS c FROM knowledge_item_tags WHERE item_id = ?`)
      .get(item.id) as { c: number };
    expect(orphan.c).toBe(0);

    // 再删一次应返回 false（幂等友好）
    expect(deleteItem(conn, item.id)).toBe(false);
  });

  it("countsByStatus 各状态计数准确（给待拍板红点供数）", () => {
    createItem(conn, { content: "1", status: "inbox" });
    createItem(conn, { content: "2", status: "kept" });
    createItem(conn, { content: "3", status: "kept" });
    createItem(conn, { content: "4", status: "discarded" });

    const counts = countsByStatus(conn);
    expect(counts.inbox).toBe(1);
    expect(counts.kept).toBe(2);
    expect(counts.discarded).toBe(1);
    expect(counts.trashed).toBe(0);
  });
});
