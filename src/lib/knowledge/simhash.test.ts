// 重复检测单测（阶段2 P0）：算法层 + 查询层一起验。
// 算法测「数学性质」，查询测「落到库里的真实行为」，都在 :memory: 内存库上跑。

import { describe, it, expect, beforeEach } from "vitest";
import { createInMemoryDb } from "../db";
import type Database from "better-sqlite3";
import {
  hammingDistance,
  normalizeUrl,
  simhash64,
} from "./simhash";
import {
  findDuplicateBySimhash,
  findDuplicateByUrl,
  findDuplicates,
} from "./dedupe";
import { createItem } from "./store";

let conn: Database.Database;

beforeEach(() => {
  conn = createInMemoryDb();
});

describe("normalizeUrl", () => {
  it("剥掉跟踪参数与尾斜杠后归一", () => {
    const a = "https://Example.com/article/?utm_source=x&utm_medium=y";
    const b = "https://example.com/article";
    expect(normalizeUrl(a)).toBe(normalizeUrl(b));
    expect(normalizeUrl(a)).toBe("https://example.com/article");
  });

  it("保留承载内容的参数", () => {
    expect(normalizeUrl("https://a.com/p?page=2")).toBe("https://a.com/p?page=2");
  });

  it("去掉页内锚点 #hash", () => {
    expect(normalizeUrl("https://a.com/doc#section-2")).toBe("https://a.com/doc");
  });

  it("解析不了的串原样返回（可比对即安全）", () => {
    expect(normalizeUrl("不是链接")).toBe("不是链接");
  });
});

describe("simhash64", () => {
  it("同文本指纹稳定一致", () => {
    const text = "人工智能正在改变知识管理的形态，重复检测是其中一环。";
    expect(simhash64(text)).toBe(simhash64(text));
  });

  it("轻微改写（转载加来源行）汉明距离很小", () => {
    const original =
      "本文介绍本地知识库的重复检测方案。通过 URL 归一化和 SimHash 指纹，" +
      "手动采集与 RSS 自动抓取的重复内容都能被拦截。方案零依赖，纯位运算实现。";
    const repost =
      "本文介绍本地知识库的重复检测方案。通过 URL 归一化和 SimHash 指纹，" +
      "手动采集与 RSS 自动抓取的重复内容都能被拦截。方案零依赖，纯位运算实现。" +
      "来源：某博客";
    expect(hammingDistance(simhash64(original), simhash64(repost))).toBeLessThanOrEqual(6);
  });

  it("不同主题的文章距离远大于阈值 3", () => {
    const a =
      "今天学习了 TypeScript 的类型体操，const assertion 与模板字面量类型的组合很有意思。" +
      "编译期能推导出字符串的排列组合，写起来像解谜。";
    const b =
      "周日去菜场买了鲈鱼和豆腐，清蒸八分钟淋上豉油，比饭店的还嫩。" +
      "关键是水开再上锅，鱼身斜划三刀。";
    expect(hammingDistance(simhash64(a), simhash64(b))).toBeGreaterThan(3);
  });

  it("空文本返回空串", () => {
    expect(simhash64("")).toBe("");
    expect(simhash64("   \n  ")).toBe("");
  });
});

describe("dedupe 查询层", () => {
  const urlA = "https://example.com/post-1";

  it("findDuplicateByUrl：归一化后命中即算重复", () => {
    createItem(conn, {
      title: "第一篇",
      content: "正文",
      source_url: "https://example.com/post-1/",
      status: "kept",
    });
    const hit = findDuplicateByUrl(conn, `${urlA}?utm_source=weibo`);
    expect(hit).not.toBeNull();
    expect(hit!.title).toBe("第一篇");
    expect(hit!.status).toBe("kept");
  });

  it("findDuplicateByUrl：discarded/trashed 的旧条目不算重复（反悔场景）", () => {
    createItem(conn, {
      title: "不要了的",
      content: "正文",
      source_url: urlA,
      status: "discarded",
    });
    expect(findDuplicateByUrl(conn, urlA)).toBeNull();
  });

  it("findDuplicateBySimhash：指纹相近的入库条目命中", () => {
    const text = "同一篇文章的正文，讲的是本地优先软件的设计取舍与数据自主权。";
    createItem(conn, {
      title: "本地优先软件",
      content: text,
      source_url: "https://mirror.example.com/a",
      status: "inbox",
      simhash: simhash64(`本地优先软件\n${text}`),
    });
    const hit = findDuplicateBySimhash(conn, simhash64(`本地优先软件\n${text}`));
    expect(hit).not.toBeNull();
    expect(hit!.status).toBe("inbox");
  });

  it("findDuplicateBySimhash：空指纹直接放行", () => {
    createItem(conn, { title: "空文", content: "", simhash: "" });
    expect(findDuplicateBySimhash(conn, "")).toBeNull();
  });

  it("findDuplicates：归一化 URL 相同的条目聚成一组", () => {
    createItem(conn, {
      title: "旧地址版",
      content: "a",
      source_url: "https://example.com/x/",
      status: "kept",
    });
    createItem(conn, {
      title: "带参数版",
      content: "b",
      source_url: "https://example.com/x?from=timeline",
      status: "inbox",
    });
    createItem(conn, {
      title: "无关条目",
      content: "c",
      source_url: "https://example.com/y",
      status: "kept",
    });
    const groups = findDuplicates(conn);
    expect(groups).toHaveLength(1);
    expect(groups[0].reason).toBe("url");
    expect(groups[0].items).toHaveLength(2);
  });
});
