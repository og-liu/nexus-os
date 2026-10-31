import { describe, expect, it } from "vitest";
import { createConnection, type Db } from "@/lib/auth/db";
import { createUser } from "@/lib/auth/user";
import {
  createDocument,
  deleteDocument,
  deleteDocuments,
  getDocument,
  listDocuments,
  nextUntitledTitle,
  saveDocument,
} from "./documents";
import { UNTITLED } from "./validate";

/** 内存库 + 两个用户：归属隔离的用例需要「另外一个人」。 */
function setup() {
  const db = createConnection(":memory:");
  return { db, alice: createTestUser(db, "alice"), bob: createTestUser(db, "bob") };
}

function createTestUser(db: Db, username: string) {
  const user = createUser(db, { username, usernameKey: username, passwordHash: "hash" });
  if (!user) throw new Error("测试用户创建失败");
  return user;
}

describe("md_documents 数据访问", () => {
  it("列表按 updated_at 倒序；毫秒撞车时 id 大的在前（id DESC 兜底）", () => {
    const { db, alice } = setup();
    const a = createDocument(db, alice.id, "A", "", 1_000);
    const b = createDocument(db, alice.id, "B", "", 2_000);
    // 与 B 同一毫秒创建：没有 id 兜底两条会互换位置
    const c = createDocument(db, alice.id, "C", "", 2_000);

    expect(listDocuments(db, alice.id).map((doc) => doc.id)).toEqual([
      c.id,
      b.id,
      a.id,
    ]);
  });

  it("保存后浮到列表最前，只刷新 updated_at，created_at 一个字节都不动", () => {
    const { db, alice } = setup();
    const older = createDocument(db, alice.id, "旧", "正文", 1_000);
    createDocument(db, alice.id, "新", "", 2_000);

    const saved = saveDocument(db, alice.id, older.id, { title: "旧（改过）", body: "改过了" }, 3_000);
    if (!saved) throw new Error("保存应当成功");

    expect(saved.createdAt).toBe(1_000);
    expect(saved.updatedAt).toBe(3_000);
    expect(saved.body).toBe("改过了");

    const stored = getDocument(db, alice.id, older.id);
    expect(stored?.createdAt).toBe(1_000);
    expect(stored?.updatedAt).toBe(3_000);
    expect(listDocuments(db, alice.id).map((doc) => doc.title)).toEqual([
      "旧（改过）",
      "新",
    ]);
  });

  it("user_id 隔离：对方的列表里看不到、按 id 也读不到", () => {
    const { db, alice, bob } = setup();
    const mine = createDocument(db, alice.id, "我的", "secret", 1_000);

    expect(listDocuments(db, bob.id)).toHaveLength(0);
    expect(getDocument(db, bob.id, mine.id)).toBeNull();
  });

  it("user_id 隔离：对方拿着 id 也改不动、删不掉（影响行数 0）", () => {
    const { db, alice, bob } = setup();
    const mine = createDocument(db, alice.id, "我的", "原文", 1_000);

    expect(saveDocument(db, bob.id, mine.id, { title: "被改了", body: "被改了" }, 2_000)).toBeNull();
    expect(deleteDocument(db, bob.id, mine.id)).toBe(false);

    // A 的行一点没变
    const stored = getDocument(db, alice.id, mine.id);
    expect(stored?.title).toBe("我的");
    expect(stored?.body).toBe("原文");
    expect(stored?.updatedAt).toBe(1_000);
  });

  it("删除是真删：删完读不到，列表里也没有", () => {
    const { db, alice } = setup();
    const doc = createDocument(db, alice.id, "要删的", "", 1_000);

    expect(deleteDocument(db, alice.id, doc.id)).toBe(true);
    expect(getDocument(db, alice.id, doc.id)).toBeNull();
    expect(listDocuments(db, alice.id)).toHaveLength(0);

    // 再删一次：已经没了，返回 false（服务端据此回「文档不存在」）
    expect(deleteDocument(db, alice.id, doc.id)).toBe(false);
  });
});

describe("批量删除", () => {
  it("只删选中的那几篇，其余不动", () => {
    const { db, alice } = setup();
    const a = createDocument(db, alice.id, "A", "", 1_000);
    const b = createDocument(db, alice.id, "B", "", 2_000);
    const c = createDocument(db, alice.id, "C", "", 3_000);

    expect(deleteDocuments(db, alice.id, [a.id, c.id])).toBe(2);
    expect(listDocuments(db, alice.id).map((row) => row.id)).toEqual([b.id]);
  });

  it("user_id 隔离：别人的 id 混进来只是「命中 0 行」，不会删错", () => {
    const { db, alice, bob } = setup();
    const mine = createDocument(db, alice.id, "我的", "", 1_000);
    const his = createDocument(db, bob.id, "他的", "", 2_000);

    // A 拿自己的 + B 的一起删：只有自己那篇被删掉
    expect(deleteDocuments(db, alice.id, [mine.id, his.id])).toBe(1);
    expect(listDocuments(db, alice.id)).toHaveLength(0);
    expect(listDocuments(db, bob.id).map((row) => row.id)).toEqual([his.id]);
    expect(getDocument(db, bob.id, his.id)?.title).toBe("他的");
  });

  it("空数组什么都不做；重复 id 只算一次", () => {
    const { db, alice } = setup();
    const doc = createDocument(db, alice.id, "A", "", 1_000);

    expect(deleteDocuments(db, alice.id, [])).toBe(0);
    expect(deleteDocuments(db, alice.id, [doc.id, doc.id])).toBe(1);
    expect(listDocuments(db, alice.id)).toHaveLength(0);
  });

  it("一篇都不剩时列表回到空数组", () => {
    const { db, alice } = setup();
    const a = createDocument(db, alice.id, "A", "", 1_000);
    const b = createDocument(db, alice.id, "B", "", 2_000);

    expect(deleteDocuments(db, alice.id, [a.id, b.id])).toBe(2);
    expect(listDocuments(db, alice.id)).toEqual([]);
  });
});

describe("未命名文档补序号", () => {
  it("没有同名时就是「未命名文档」", () => {
    const { db, alice } = setup();
    expect(nextUntitledTitle(db, alice.id)).toBe(UNTITLED);
  });

  it("依次补 2、3，删掉中间那个后补最小的空位", () => {
    const { db, alice } = setup();
    const first = createDocument(db, alice.id, nextUntitledTitle(db, alice.id), "", 1_000);
    expect(first.title).toBe("未命名文档");

    const second = createDocument(db, alice.id, nextUntitledTitle(db, alice.id), "", 2_000);
    expect(second.title).toBe("未命名文档 2");

    const third = createDocument(db, alice.id, nextUntitledTitle(db, alice.id), "", 3_000);
    expect(third.title).toBe("未命名文档 3");

    // 删掉「未命名文档 2」后，下一个补的是 2（不是 4）
    expect(deleteDocument(db, alice.id, second.id)).toBe(true);
    expect(nextUntitledTitle(db, alice.id)).toBe("未命名文档 2");
  });

  it("用户自己起的名字即使重复也不动序号逻辑：只认「未命名文档」这个形态", () => {
    const { db, alice } = setup();
    createDocument(db, alice.id, "未命名文档说明", "", 1_000);
    createDocument(db, alice.id, "灵感", "", 2_000);
    createDocument(db, alice.id, "灵感", "", 3_000);

    // 「未命名文档说明」不是占位名，不该被算作占用
    expect(nextUntitledTitle(db, alice.id)).toBe(UNTITLED);
  });

  it("保存已有文档时排除自己：标题不变就不会白跳一号", () => {
    const { db, alice } = setup();
    const doc = createDocument(db, alice.id, UNTITLED, "", 1_000);
    expect(nextUntitledTitle(db, alice.id, doc.id)).toBe(UNTITLED);

    createDocument(db, alice.id, UNTITLED, "", 2_000);
    expect(nextUntitledTitle(db, alice.id, doc.id)).toBe("未命名文档 2");
  });

  it("序号按人分：别人的文档不占我的号", () => {
    const { db, alice, bob } = setup();
    createDocument(db, alice.id, UNTITLED, "", 1_000);
    expect(nextUntitledTitle(db, bob.id)).toBe(UNTITLED);
  });
});
