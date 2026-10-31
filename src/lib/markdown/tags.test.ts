import { describe, expect, it } from "vitest";
import { createConnection, type Db } from "@/lib/auth/db";
import { createUser } from "@/lib/auth/user";
import { createDocument, listDocuments } from "./documents";
import {
  TAG_NAME_MAX,
  countTagDocuments,
  createTag,
  deleteTags,
  deleteTag,
  listDocumentTags,
  listTags,
  normalizeTagName,
  normalizeTagNames,
  renameTag,
  setDocumentTags,
  tagKey,
  tagMatchesPrefix,
} from "./tags";

/** 内存库 + 两个用户：标签隔离的用例需要「另外一个人」。 */
function setup() {
  const db = createConnection(":memory:");
  return { db, alice: createTestUser(db, "alice"), bob: createTestUser(db, "bob") };
}

function createTestUser(db: Db, username: string) {
  const user = createUser(db, { username, usernameKey: username, passwordHash: "hash" });
  if (!user) throw new Error("测试用户创建失败");
  return user;
}

describe("标签名的归一化", () => {
  it("首尾空白修掉、内部空白折叠、斜杠两侧不留空格", () => {
    expect(normalizeTagName("  工作  ")).toBe("工作");
    expect(normalizeTagName("工作   周报")).toBe("工作 周报");
    expect(normalizeTagName("工作 / 周报")).toBe("工作/周报");
    expect(normalizeTagName("/工作/")).toBe("工作");
  });

  it("只差大小写 / 空格的算同一个标签（比较用 key）", () => {
    expect(tagKey("Work")).toBe(tagKey("work "));
    expect(tagKey("工作")).toBe("工作");
  });

  it("空名字、非字符串、超长都不合法", () => {
    expect(normalizeTagName("")).toBeNull();
    expect(normalizeTagName("   ")).toBeNull();
    expect(normalizeTagName("/")).toBeNull();
    expect(normalizeTagName(12)).toBeNull();
    expect(normalizeTagName("あ".repeat(TAG_NAME_MAX + 1))).toBeNull();
    expect(normalizeTagName("あ".repeat(TAG_NAME_MAX))).toBe("あ".repeat(TAG_NAME_MAX));
  });

  it("一批名字去重、跳过不合法的、超量截断", () => {
    expect(normalizeTagNames(["工作", "工作 ", "重要"])).toEqual(["工作", "重要"]);
    expect(normalizeTagNames(["", "  ", "工作"])).toEqual(["工作"]);
    expect(normalizeTagNames("工作")).toEqual([]);
    expect(normalizeTagNames(Array.from({ length: 20 }, (_, i) => `标签${i}`))).toHaveLength(12);
  });
});

describe("标签的增删改", () => {
  it("给文档打标签：新词顺手建出来；一篇可以多个", () => {
    const { db, alice } = setup();
    const doc = createDocument(db, alice.id, "周报", "", 1_000);

    const tags = setDocumentTags(db, alice.id, doc.id, ["工作/周报", "重要"]);
    expect(tags?.map((tag) => tag.name)).toEqual(["工作/周报", "重要"]);
    expect(listTags(db, alice.id).map((tag) => tag.name).sort()).toEqual(["工作/周报", "重要"]);
  });

  it("同一篇再换一批：整体替换，不是叠加", () => {
    const { db, alice } = setup();
    const doc = createDocument(db, alice.id, "周报", "", 1_000);

    setDocumentTags(db, alice.id, doc.id, ["工作", "重要"]);
    const next = setDocumentTags(db, alice.id, doc.id, ["灵感"]);
    expect(next?.map((tag) => tag.name)).toEqual(["灵感"]);
    // 「工作」「重要」两个标签本身还在（只是这篇不再挂了）
    expect(listTags(db, alice.id).map((tag) => tag.name).sort()).toEqual(["工作", "灵感", "重要"].sort());
  });

  it("清空标签：文档还在，只是没有标签了", () => {
    const { db, alice } = setup();
    const doc = createDocument(db, alice.id, "周报", "", 1_000);
    setDocumentTags(db, alice.id, doc.id, ["工作"]);

    expect(setDocumentTags(db, alice.id, doc.id, [])).toEqual([]);
    expect(listDocuments(db, alice.id).map((row) => row.id)).toEqual([doc.id]);
    expect(listDocuments(db, alice.id)[0].tags).toEqual([]);
  });

  it("只差大小写/空格的两次输入，落成同一个标签", () => {
    const { db, alice } = setup();
    const a = createDocument(db, alice.id, "A", "", 1_000);
    const b = createDocument(db, alice.id, "B", "", 2_000);

    setDocumentTags(db, alice.id, a.id, ["Work"]);
    setDocumentTags(db, alice.id, b.id, ["work "]);

    const tags = listTags(db, alice.id);
    expect(tags).toHaveLength(1);
    expect(tags[0].count).toBe(2);
  });

  it("user_id 隔离：打标签、读标签都只认自己的", () => {
    const { db, alice, bob } = setup();
    const mine = createDocument(db, alice.id, "我的", "", 1_000);

    expect(setDocumentTags(db, bob.id, mine.id, ["偷偷"])).toBeNull();
    expect(listDocumentTags(db, bob.id, mine.id)).toEqual([]);
    expect(listTags(db, bob.id)).toEqual([]);

    setDocumentTags(db, alice.id, mine.id, ["工作"]);
    expect(listTags(db, bob.id)).toEqual([]);
  });

  it("删标签：只解除关联，文档与其他标签都留着", () => {
    const { db, alice } = setup();
    const doc = createDocument(db, alice.id, "周报", "", 1_000);
    setDocumentTags(db, alice.id, doc.id, ["工作", "重要"]);
    const work = listTags(db, alice.id).find((tag) => tag.name === "工作");
    if (!work) throw new Error("标签没建出来");

    expect(countTagDocuments(db, alice.id, work.id)).toBe(1);
    expect(deleteTag(db, alice.id, work.id)).toBe(true);

    expect(listTags(db, alice.id).map((tag) => tag.name)).toEqual(["重要"]);
    expect(listDocuments(db, alice.id)[0].tags.map((tag) => tag.name)).toEqual(["重要"]);
    expect(deleteTag(db, alice.id, work.id)).toBe(false);
  });

  it("重命名：撞名拒绝，改名成功时子标签跟着改", () => {
    const { db, alice } = setup();
    const doc = createDocument(db, alice.id, "周报", "", 1_000);
    setDocumentTags(db, alice.id, doc.id, ["工作", "工作/周报", "重要"]);

    const work = listTags(db, alice.id).find((tag) => tag.name === "工作");
    const important = listTags(db, alice.id).find((tag) => tag.name === "重要");
    if (!work || !important) throw new Error("标签没建出来");

    expect(renameTag(db, alice.id, work.id, "重要")).toBe("duplicate");

    expect(renameTag(db, alice.id, work.id, "职业")).toBe("ok");
    expect(listTags(db, alice.id).map((tag) => tag.name).sort()).toEqual(
      ["职业", "职业/周报", "重要"].sort(),
    );
  });

  it("重命名：子标签会撞到别人身上时返回 conflict，且库里一行都没改", () => {
    const { db, alice } = setup();
    createTag(db, alice.id, "工作");
    createTag(db, alice.id, "工作/周报");
    // 只有 `生活/周报`、没有父级 `生活`——所以 `工作` → `生活` 本身不撞名，
    // 撞的是它下面的 `工作/周报` → `生活/周报`
    createTag(db, alice.id, "生活/周报");

    const before = listTags(db, alice.id).map((tag) => tag.name).sort();
    const work = listTags(db, alice.id).find((tag) => tag.name === "工作");
    if (!work) throw new Error("标签没建出来");

    expect(renameTag(db, alice.id, work.id, "生活")).toBe("conflict");
    expect(listTags(db, alice.id).map((tag) => tag.name).sort()).toEqual(before);
  });

  it("重命名：只改大小写 / 空格（键不变）不算冲突，子标签不动", () => {
    const { db, alice } = setup();
    createTag(db, alice.id, "Work");
    createTag(db, alice.id, "Work/Weekly");
    createTag(db, alice.id, "生活");

    const work = listTags(db, alice.id).find((tag) => tag.name === "Work");
    if (!work) throw new Error("标签没建出来");

    expect(renameTag(db, alice.id, work.id, "work")).toBe("ok");
    expect(listTags(db, alice.id).map((tag) => tag.name).sort()).toEqual(
      ["Work/Weekly", "生活", "work"].sort(),
    );
  });
});

describe("单独新建标签（管理面板）", () => {
  it("建出来是 0 篇使用；同名（含大小写/空格差异）拒绝", () => {
    const { db, alice } = setup();
    expect(createTag(db, alice.id, "素材")).toBe("ok");
    expect(listTags(db, alice.id)).toEqual([{ id: expect.any(Number), name: "素材", count: 0 }]);

    expect(createTag(db, alice.id, "素材")).toBe("duplicate");
    expect(createTag(db, alice.id, " 素材 ")).toBe("duplicate");
    expect(createTag(db, alice.id, "SU")).toBe("ok");
    expect(createTag(db, alice.id, "su")).toBe("duplicate");
  });

  it("名字不合法 / 超长直接拒绝，不落库", () => {
    const { db, alice } = setup();
    expect(createTag(db, alice.id, "")).toBe("invalid");
    expect(createTag(db, alice.id, "   ")).toBe("invalid");
    expect(createTag(db, alice.id, "あ".repeat(TAG_NAME_MAX + 1))).toBe("invalid");
    expect(createTag(db, alice.id, 42)).toBe("invalid");
    expect(listTags(db, alice.id)).toEqual([]);
  });

  it("按人分：别人建过同名标签不影响我", () => {
    const { db, alice, bob } = setup();
    expect(createTag(db, alice.id, "工作")).toBe("ok");
    expect(createTag(db, bob.id, "工作")).toBe("ok");
    expect(listTags(db, alice.id)).toHaveLength(1);
    expect(listTags(db, bob.id)).toHaveLength(1);
  });
});

describe("批量删标签", () => {
  it("只删选中的，文档与其他标签都不动", () => {
    const { db, alice } = setup();
    const doc = createDocument(db, alice.id, "周报", "", 1_000);
    setDocumentTags(db, alice.id, doc.id, ["工作", "重要", "灵感"]);
    const tags = listTags(db, alice.id);
    const targets = tags.filter((tag) => tag.name === "工作" || tag.name === "灵感");

    expect(deleteTags(db, alice.id, targets.map((tag) => tag.id))).toBe(2);
    expect(listTags(db, alice.id).map((tag) => tag.name)).toEqual(["重要"]);
    // 文档还在，只是少了两个标签
    const rows = listDocuments(db, alice.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].tags.map((tag) => tag.name)).toEqual(["重要"]);
  });

  it("别人的 id 混进来只是命中 0 行", () => {
    const { db, alice, bob } = setup();
    createTag(db, alice.id, "我的");
    createTag(db, bob.id, "他的");
    const mine = listTags(db, alice.id)[0];
    const his = listTags(db, bob.id)[0];

    expect(deleteTags(db, alice.id, [mine.id, his.id])).toBe(1);
    expect(listTags(db, alice.id)).toEqual([]);
    expect(listTags(db, bob.id)).toHaveLength(1);
  });

  it("空数组什么都不做", () => {
    const { db, alice } = setup();
    createTag(db, alice.id, "甲");
    expect(deleteTags(db, alice.id, [])).toBe(0);
    expect(listTags(db, alice.id)).toHaveLength(1);
  });
});

describe("按标签筛选（前缀匹配）", () => {
  it("选「工作」时，`工作/周报` 这种子标签也算命中", () => {
    expect(tagMatchesPrefix("工作", "工作")).toBe(true);
    expect(tagMatchesPrefix("工作/周报", "工作")).toBe(true);
    expect(tagMatchesPrefix("工作/周报/本周", "工作/周报")).toBe(true);
    // 前缀不能跨层误命中
    expect(tagMatchesPrefix("工作台", "工作")).toBe(false);
    expect(tagMatchesPrefix("工作/周报", "工作/月报")).toBe(false);
  });

  it("文档列表带出各自的标签（一次查询，不是逐篇查）", () => {
    const { db, alice } = setup();
    const a = createDocument(db, alice.id, "A", "", 1_000);
    const b = createDocument(db, alice.id, "B", "", 2_000);
    setDocumentTags(db, alice.id, a.id, ["工作"]);
    setDocumentTags(db, alice.id, b.id, ["工作/周报", "重要"]);

    const rows = listDocuments(db, alice.id);
    expect(rows.map((row) => [row.title, row.tags.length])).toEqual([
      ["B", 2],
      ["A", 1],
    ]);
  });

  it("标签计数跟着使用次数走（排序靠它）", () => {
    const { db, alice } = setup();
    const a = createDocument(db, alice.id, "A", "", 1_000);
    const b = createDocument(db, alice.id, "B", "", 2_000);
    setDocumentTags(db, alice.id, a.id, ["常用", "少用"]);
    setDocumentTags(db, alice.id, b.id, ["常用"]);

    expect(listTags(db, alice.id).map((tag) => [tag.name, tag.count])).toEqual([
      ["常用", 2],
      ["少用", 1],
    ]);
  });
});
