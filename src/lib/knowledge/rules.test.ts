// 自动归档规则单元测试（阶段4 P2）。
// 跑在 :memory: 内存库上，不碰真实 data/nexus.db

import { describe, it, expect, beforeEach } from "vitest";
import { createInMemoryDb } from "../db";
import type Database from "better-sqlite3";
import { createItem, getItem, setTags } from "./store";
import {
  addRule,
  listRules,
  removeRule,
  setRuleEnabled,
  applyRulesToItem,
} from "./rules";

let conn: Database.Database;

beforeEach(() => {
  conn = createInMemoryDb();
});

describe("rules · 规则管理", () => {
  it("增删改：同型同 pattern 的规则不重复建", () => {
    const r1 = addRule(conn, { type: "domain", pattern: "github.com", tag: "开源" });
    expect(() =>
      addRule(conn, { type: "domain", pattern: "github.com", tag: "代码" }),
    ).toThrow("已存在");

    // 同 pattern 不同型是两条独立规则（语义不同：域名 vs 关键词）
    const r2 = addRule(conn, { type: "keyword", pattern: "github.com", tag: "平台" });
    expect(listRules(conn)).toHaveLength(2);

    expect(setRuleEnabled(conn, r1.id, false)).toBe(true);
    expect(listRules(conn).find((r) => r.id === r1.id)?.enabled).toBe(0);

    expect(removeRule(conn, r2.id)).toBe(true);
    expect(listRules(conn)).toHaveLength(1);
  });

  it("空 pattern / 空标签被拒绝", () => {
    expect(() => addRule(conn, { type: "keyword", pattern: " ", tag: "t" })).toThrow();
    expect(() => addRule(conn, { type: "keyword", pattern: "p", tag: " " })).toThrow();
  });
});

describe("rules · applyRulesToItem", () => {
  it("domain 规则：链接域名包含 pattern 就命中", () => {
    addRule(conn, { type: "domain", pattern: "github.com", tag: "开源" });
    const item = createItem(conn, {
      title: "某仓库",
      content: "正文",
      source: "github.com",
      source_url: "https://github.com/og-liu/nexus-os",
    });

    const hits = applyRulesToItem(conn, item.id);
    expect(hits).toEqual(["开源"]);
    expect(getItem(conn, item.id)?.tags).toEqual(["开源"]);
  });

  it("keyword 规则：标题或正文含关键词就命中（大小写不敏感）", () => {
    addRule(conn, { type: "keyword", pattern: "RAG", tag: "检索" });
    const item = createItem(conn, {
      title: "一篇讲 rag 实践的文章",
      content: "正文没提",
      source: "手动采集",
    });

    const hits = applyRulesToItem(conn, item.id);
    expect(hits).toEqual(["检索"]);
  });

  it("命中规则打标是追加不是覆盖：已有标签保留", () => {
    addRule(conn, { type: "keyword", pattern: "智能体", tag: "agent" });
    const item = createItem(conn, {
      title: "智能体四件套",
      content: "正文",
      source: "手动采集",
      tags: ["笔记"],
    });

    applyRulesToItem(conn, item.id);
    expect(getItem(conn, item.id)?.tags).toEqual(["笔记", "agent"]);
  });

  it("停用的规则不参与匹配；不存在的条目安全返回空", () => {
    const rule = addRule(conn, { type: "keyword", pattern: "测试", tag: "t" });
    setRuleEnabled(conn, rule.id, false);
    const item = createItem(conn, {
      title: "测试标题",
      content: "c",
      source: "手动采集",
    });

    expect(applyRulesToItem(conn, item.id)).toEqual([]);
    expect(getItem(conn, item.id)?.tags).toEqual([]);
    expect(applyRulesToItem(conn, "不存在的id")).toEqual([]);
  });

  it("再次 apply 不产生重复标签（幂等）", () => {
    addRule(conn, { type: "keyword", pattern: "AI", tag: "智能" });
    const item = createItem(conn, {
      title: "AI 是什么",
      content: "c",
      source: "手动采集",
    });

    applyRulesToItem(conn, item.id);
    applyRulesToItem(conn, item.id);
    expect(getItem(conn, item.id)?.tags).toEqual(["智能"]);
  });

  it("keyword 匹配正文前 2000 字（长文尾部关键词不命中是文档化行为）", () => {
    addRule(conn, { type: "keyword", pattern: "结尾暗号", tag: "尾" });
    const item = createItem(conn, {
      title: "t",
      // 2500 字正文，暗号在 2000 字之后
      content: "a".repeat(2500) + "结尾暗号",
      source: "手动采集",
    });
    expect(applyRulesToItem(conn, item.id)).toEqual([]);
  });

  it("规则打标后人工标签仍可自由修改（setTags 全量替换语义不冲突）", () => {
    addRule(conn, { type: "keyword", pattern: "AI", tag: "智能" });
    const item = createItem(conn, {
      title: "AI 是什么",
      content: "c",
      source: "手动采集",
    });
    applyRulesToItem(conn, item.id);
    // 人工删掉规则打的标签——规则不会追着打回来（apply 只在入库时跑一次）
    setTags(conn, item.id, []);
    expect(getItem(conn, item.id)?.tags).toEqual([]);
  });
});
