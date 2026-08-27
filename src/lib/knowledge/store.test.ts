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
  renameTag,
  removeTag,
  listTags,
  trashItem,
  restoreItem,
  purgeExpiredTrash,
  setEmbedding,
  listItemsNeedingEmbedding,
  searchHybrid,
  getReviewItems,
  countAgedInbox,
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

describe("knowledge store · 全文搜索（FTS5 trigram，阶段3 P1）", () => {
  beforeEach(() => {
    createItem(conn, {
      title: "向量数据库选型指南",
      content: "Milvus 与 Qdrant 的横向对比测试",
      status: "kept",
    });
  });

  it("≥3 字走 FTS：标题与正文的子串都能命中", () => {
    // 「数据库选型」是标题中段子串——「只记得半句话」的核心场景
    expect(listItems(conn, { q: "数据库选型" }).total).toBe(1);
    // 命中正文子串（标题里没有「横向对比」）
    expect(listItems(conn, { q: "横向对比" }).items[0]?.title).toBe(
      "向量数据库选型指南",
    );
    // 没有的子串零命中
    expect(listItems(conn, { q: "图数据库迁移" }).total).toBe(0);
  });

  it("<3 字回落 LIKE：两字中文词照常可搜（trigram 最短 3 字符的限制被兜住）", () => {
    expect(listItems(conn, { q: "选型" }).total).toBe(1);
    expect(listItems(conn, { q: "菜谱" }).total).toBe(0);
  });

  it("FTS 保留字按字面匹配：整串包成字符串字面量，AND/OR 不是布尔语法", () => {
    createItem(conn, {
      title: "AND 与 OR 的区别",
      content: "逻辑运算符笔记",
      status: "kept",
    });
    // 若不转义，「AND 与」会被 MATCH 解析成布尔表达式，轻则零命中重则语法错
    expect(listItems(conn, { q: "AND 与" }).total).toBe(1);
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

describe("knowledge store · 全局标签管理（K2）", () => {
  it("renameTag 所有条目一起改名，且与已有新名合并去重", () => {
    // 条目 A 只有旧名；条目 B 旧名新名都有（模拟整理时的重名场景）
    const a = createItem(conn, { content: "a", tags: ["ai"] });
    const b = createItem(conn, { content: "b", tags: ["ai", "AI"] });

    const changed = renameTag(conn, "ai", "AI");
    expect(changed).toBe(true);

    // A 的 ai → AI；B 上两个标签合并成一个 AI，不撞复合主键不留重复
    expect(getItem(conn, a.id)!.tags).toEqual(["AI"]);
    expect(getItem(conn, b.id)!.tags).toEqual(["AI"]);
    // 全库只剩一个 AI 标签行
    expect(listTags(conn)).toEqual([{ tag: "AI", count: 2 }]);
  });

  it("renameTag 空名 / 同名直接拒绝，返回 false 不动数据", () => {
    const item = createItem(conn, { content: "x", tags: ["t1"] });
    expect(renameTag(conn, "", "t2")).toBe(false);
    expect(renameTag(conn, "t1", " t1 ")).toBe(false); // trim 后同名
    expect(getItem(conn, item.id)!.tags).toEqual(["t1"]);
  });

  it("removeTag 从所有条目摘掉该标签，正文不受影响", () => {
    const a = createItem(conn, { content: "a", tags: ["old", "keep"] });
    const b = createItem(conn, { content: "b", tags: ["old"] });

    expect(removeTag(conn, "old")).toBe(true);

    expect(getItem(conn, a.id)!.tags).toEqual(["keep"]);
    expect(getItem(conn, b.id)!.tags).toEqual([]);
    // 删不存在的标签：没有行被删，返回 false
    expect(removeTag(conn, "not-exist")).toBe(false);
  });

  it("listTags 返回使用计数并按次数降序排列", () => {
    createItem(conn, { content: "1", tags: ["热门", "冷门"] });
    createItem(conn, { content: "2", tags: ["热门"] });

    expect(listTags(conn)).toEqual([
      { tag: "热门", count: 2 },
      { tag: "冷门", count: 1 },
    ]);
  });
});

describe("knowledge store · 笔记与回收站（K3 前置）", () => {
  it("kind=note 创建即保留，与 captured 条目在列表里互不串味", () => {
    const note = createItem(conn, {
      title: "我的第一篇笔记",
      content: "正文",
      kind: "note",
      status: "kept", // route 层对笔记的约定：创建即保留，不走拍板流
    });
    // captured 也造一条 kept 的：知识流的查询条件是 status=kept + kind=captured
    const captured = createItem(conn, { content: "采集来的", status: "kept" });

    expect(note.kind).toBe("note");
    expect(note.status).toBe("kept");
    expect(captured.kind).toBe("captured");

    // 知识流只看 captured：手写文章不该混进阅读信息流
    const feed = listItems(conn, { status: "kept", kind: "captured" });
    expect(feed.items.map((i) => i.id)).toEqual([captured.id]);

    // 我的文章只看 note
    const notes = listItems(conn, { status: "kept", kind: "note" });
    expect(notes.items.map((i) => i.id)).toEqual([note.id]);
  });

  it("notStatus 排除回收站条目，常规列表天然看不到已删内容", () => {
    const a = createItem(conn, { content: "A", status: "kept" });
    createItem(conn, { content: "B" }); // inbox
    trashItem(conn, a.id);

    const visible = listItems(conn, { notStatus: "trashed" });
    expect(visible.total).toBe(1);
    expect(visible.items[0].status).toBe("inbox");
  });

  it("trashItem 只有 kept 能进回收站；restoreItem 捞回并清 deleted_at", () => {
    const kept = createItem(conn, { content: "已保留", status: "kept" });
    const inboxItem = createItem(conn, { content: "待拍板" }); // 默认 inbox

    // inbox 条目不能直接进回收站（还没拍板，没有反悔期可言）
    expect(trashItem(conn, inboxItem.id)).toBeNull();

    const trashed = trashItem(conn, kept.id);
    expect(trashed?.status).toBe("trashed");
    expect(trashed?.deleted_at).toBeGreaterThan(0);

    const restored = restoreItem(conn, kept.id);
    expect(restored?.status).toBe("kept");
    expect(restored?.deleted_at).toBeNull();
  });

  it("purgeExpiredTrash 只清过期的：未到期的和已捞回的都不动", () => {
    const old = createItem(conn, { content: "8 天前进回收站", status: "kept" });
    const fresh = createItem(conn, { content: "刚进回收站", status: "kept" });
    const back = createItem(conn, { content: "已经捞回了", status: "kept" });

    trashItem(conn, old.id);
    trashItem(conn, fresh.id);
    trashItem(conn, back.id);

    // 手动把「old」的删除时间拨回 8 天前，模拟时间流逝（测试里直接改库是合理手段）
    conn
      .prepare(`UPDATE knowledge_items SET deleted_at = ? WHERE id = ?`)
      .run(Date.now() - 8 * 24 * 3_600_000, old.id);

    restoreItem(conn, back.id); // back 捞回后不该被清理波及

    const purged = purgeExpiredTrash(conn);
    expect(purged).toBe(1); // 只有过期的 old 被物理删除

    expect(getItem(conn, old.id)).toBeNull();
    expect(getItem(conn, fresh.id)?.status).toBe("trashed"); // 未到期仍在站内
    expect(getItem(conn, back.id)?.status).toBe("kept"); // 已捞回不受影响
  });

  it("updateItem 不允许绕过状态机直接改 trashed（保护 deleted_at 一致性）", () => {
    const item = createItem(conn, { content: "x", status: "kept" });
    expect(() =>
      updateItem(conn, item.id, { status: "trashed" }),
    ).toThrow(/trashItem/);

    trashItem(conn, item.id);
    // 站内条目也不能随手改状态，必须先捞回
    expect(() =>
      updateItem(conn, item.id, { status: "kept" }),
    ).toThrow(/restoreItem/);
  });
});

// ─── K4：混合检索 searchHybrid ────────────────────────────────

describe("knowledge store · 混合检索 searchHybrid（K4）", () => {
  /** 构造第 hot 位为 1 的单位向量（已归一化）：测试里用不同 hot 位模拟
   *  「意思远近」——同位=完全相同的意思，不同位=正交即毫不相关 */
  function unitVec(hot: number): Float32Array {
    const v = new Float32Array(1024);
    v[hot] = 1;
    return v;
  }

  it("语义路：字面零重叠也能靠向量命中", () => {
    const item = createItem(conn, {
      title: "深度学习入门",
      content: "讲神经网络和梯度下降",
      status: "kept",
    });
    setEmbedding(conn, item.id, unitVec(0));

    // 查询词与内容没有任何字面交集；查询向量与条目向量同向 → sim=1
    const { items } = searchHybrid(conn, { q: "机器学习", qVector: unitVec(0) });

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(item.id);
  });

  it("双路融合：关键词+语义双命中的条目排最前", () => {
    // BOTH：两路都上榜（含关键词 + 向量同向）
    const both = createItem(conn, {
      title: "机器学习全景",
      content: "正文提到机器学习",
      status: "kept",
    });
    setEmbedding(conn, both.id, unitVec(0));
    // KW_ONLY：只有关键词路（向量正交被相似度门槛过滤）
    const kwOnly = createItem(conn, {
      title: "旧笔记",
      content: "机器学习的早期记录",
      status: "kept",
    });
    setEmbedding(conn, kwOnly.id, unitVec(7));
    // SEM_ONLY：只有语义路（不含查询词）
    const semOnly = createItem(conn, {
      title: "AI 随笔",
      content: "关于智能系统的思考",
      status: "kept",
    });
    setEmbedding(conn, semOnly.id, unitVec(0));

    const { items } = searchHybrid(conn, { q: "机器学习", qVector: unitVec(0) });

    expect(items.map((i) => i.id)).toEqual([both.id, kwOnly.id, semOnly.id]);
  });

  it("kept 红线在混合检索下依然生效：回收站条目向量再近也不出现", () => {
    const trashed = createItem(conn, {
      title: "被删的文章",
      content: "提到机器学习",
      status: "kept",
    });
    setEmbedding(conn, trashed.id, unitVec(0));
    trashItem(conn, trashed.id); // kept → trashed

    const { items } = searchHybrid(conn, { q: "机器学习", qVector: unitVec(0) });

    expect(items).toHaveLength(0);
  });

  it("无查询向量时优雅降级为纯关键词路", () => {
    createItem(conn, {
      title: "笔记A",
      content: "包含特殊词汇",
      status: "kept",
    });

    const { items } = searchHybrid(conn, { q: "特殊词汇", qVector: null });

    expect(items).toHaveLength(1);
  });

  it("setEmbedding 的模型标记：换模型后旧指纹会被回填认领重算", () => {
    const item = createItem(conn, {
      title: "迁移测试",
      content: "内容",
      status: "kept",
    });
    setEmbedding(conn, item.id, unitVec(0), "old-model/v1");

    // 当前模型（EMBEDDING_MODEL）≠ old-model/v1 → 判定为需要重算
    const pending = listItemsNeedingEmbedding(conn);
    expect(pending.map((i) => i.id)).toContain(item.id);

    // 用当前模型补算后不再出现在待办里（幂等收敛）
    setEmbedding(conn, item.id, unitVec(1));
    expect(listItemsNeedingEmbedding(conn).map((i) => i.id)).not.toContain(
      item.id,
    );
  });
});

describe("阶段4 P2 · 智能列表 since 过滤 + 每日回顾数据", () => {
  it("since：只返回指定时间之后采集的条目", () => {
    const now = Date.now();
    const old = createItem(conn, {
      title: "一周前的老条目",
      content: "c",
      status: "kept",
    });
    const fresh = createItem(conn, {
      title: "刚存的新条目",
      content: "c",
      status: "kept",
    });
    // createItem 的 created_at 用当下时间，手工把老条目改回 8 天前
    conn
      .prepare("UPDATE knowledge_items SET created_at = ? WHERE id = ?")
      .run(now - 8 * 24 * 3_600_000, old.id);

    const { items, total } = listItems(conn, {
      status: "kept",
      since: now - 7 * 24 * 3_600_000,
    });
    expect(total).toBe(1);
    expect(items.map((i) => i.id)).toEqual([fresh.id]);
  });

  it("getReviewItems：从未读过的排最前，读过的按最早阅读时间排", () => {
    const unread = createItem(conn, {
      title: "存了从没读",
      content: "从未读过的内容",
      status: "kept",
    });
    const readOld = createItem(conn, {
      title: "读过的老条目",
      content: "很早读过",
      status: "kept",
    });
    const readNew = createItem(conn, {
      title: "读过的新条目",
      content: "最近读过",
      status: "kept",
    });
    // readOld：10 天前读过；readNew：1 天前读过（markRead 用当下时间，手工改）
    conn
      .prepare("UPDATE knowledge_items SET read_at = ? WHERE id = ?")
      .run(Date.now() - 10 * 24 * 3_600_000, readOld.id);
    conn
      .prepare("UPDATE knowledge_items SET read_at = ? WHERE id = ?")
      .run(Date.now() - 1 * 24 * 3_600_000, readNew.id);

    const { revisit } = getReviewItems(conn);
    // 顺序断言：从未读（COALESCE(read_at,0)=0）→ 最早读过的 → 最近读过的
    expect(revisit.map((r) => r.id)).toEqual([unread.id, readOld.id, readNew.id]);
  });

  it("getReviewItems：只有 kept 参与，回收站/待处理/草稿不进重温", () => {
    createItem(conn, { title: "kept 的", content: "c", status: "kept" });
    createItem(conn, { title: "inbox 的", content: "c", status: "inbox" });
    createItem(conn, { title: "draft 的", content: "c", status: "draft" });

    const { revisit } = getReviewItems(conn);
    expect(revisit.map((r) => r.title)).toEqual(["kept 的"]);
  });

  it("countAgedInbox：只数待处理里超过 N 天的，其他状态不算", () => {
    const now = Date.now();
    const aged = createItem(conn, {
      title: "躺了很久",
      content: "c",
      status: "inbox",
    });
    createItem(conn, { title: "刚来的", content: "c", status: "inbox" });
    createItem(conn, { title: "老的但已拍板", content: "c", status: "kept" });
    conn
      .prepare("UPDATE knowledge_items SET created_at = ? WHERE id = ?")
      .run(now - 40 * 24 * 3_600_000, aged.id);

    expect(countAgedInbox(conn, 30)).toBe(1);
    expect(countAgedInbox(conn, 60)).toBe(0);
  });
});
