// 摘录模块单元测试（阶段4 P2）。
// 跑在 :memory: 内存库上，不碰真实 data/nexus.db

import { describe, it, expect, beforeEach } from "vitest";
import { createInMemoryDb } from "../db";
import type Database from "better-sqlite3";
import { createItem } from "./store";
import { addExcerpt, listExcerpts, removeExcerpt } from "./excerpts";

let conn: Database.Database;

beforeEach(() => {
  conn = createInMemoryDb();
});

describe("excerpts · 摘录 CRUD", () => {
  it("新增后能按时间正序读回（先摘的在前）", () => {
    const item = createItem(conn, {
      title: "长文",
      content: "正文内容",
      source: "手动采集",
    });
    addExcerpt(conn, item.id, "第一句值得记的话");
    addExcerpt(conn, item.id, "  第二句   带着松散空白  ");

    const list = listExcerpts(conn, item.id);
    expect(list).toHaveLength(2);
    expect(list[0].text).toBe("第一句值得记的话");
    // 空白被压平：选区里夹的换行缩进不该带进库里
    expect(list[1].text).toBe("第二句 带着松散空白");
  });

  it("同一句话摘两次是幂等的（duplicate 而不是报错或重复入库）", () => {
    const item = createItem(conn, {
      title: "t",
      content: "c",
      source: "手动采集",
    });
    const first = addExcerpt(conn, item.id, "金句");
    const second = addExcerpt(conn, item.id, "金句");

    expect("row" in first).toBe(true);
    expect("duplicate" in second).toBe(true);
    expect(listExcerpts(conn, item.id)).toHaveLength(1);
  });

  it("太短的摘录被拒绝（误触选中一两个字不算划线）", () => {
    const item = createItem(conn, {
      title: "t",
      content: "c",
      source: "手动采集",
    });
    expect(() => addExcerpt(conn, item.id, "ab")).toThrow();
    expect(() => addExcerpt(conn, item.id, "  ")).toThrow();
  });

  it("删除摘录按自己的 id，删完列表为空", () => {
    const item = createItem(conn, {
      title: "t",
      content: "c",
      source: "手动采集",
    });
    // 联合类型收窄：duplicate 分支不带 row，先排除（本用例第一次摘，不可能重复）
    const added = addExcerpt(conn, item.id, "要删的话");
    if (!("row" in added)) throw new Error("不应命中重复分支");
    const { row } = added;
    expect(removeExcerpt(conn, row.id)).toBe(true);
    expect(removeExcerpt(conn, row.id)).toBe(false); // 再删同一条：已不存在
    expect(listExcerpts(conn, item.id)).toHaveLength(0);
  });
});
