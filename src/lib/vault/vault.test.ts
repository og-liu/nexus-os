import { describe, expect, it } from "vitest";
import { createConnection, type Db } from "@/lib/auth/db";
import { createUser } from "@/lib/auth/user";
import {
  collectFieldKeys,
  createGroup,
  createItem,
  deleteGroup,
  deleteItem,
  deleteItems,
  getItem,
  groupExists,
  listGroups,
  listItems,
  moveItems,
  nextUntitledTitle,
  parseFields,
  renameGroup,
  serializeFields,
  titleTaken,
  updateItem,
} from "./vault";

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

function makeGroup(db: Db, userId: number, name: string, now = Date.now()) {
  const result = createGroup(db, userId, name, now);
  if (!result.ok) throw new Error("测试群组创建失败");
  return result.id;
}

function makeItem(
  db: Db,
  userId: number,
  title: string,
  groupId: number | null = null,
  fields: { key: string; value: string }[] = [],
  now = Date.now(),
) {
  return createItem(db, userId, { title, groupId, fields }, now);
}

describe("保险库群组", () => {
  it("最新建的群组排最上面，带各自的条目数", () => {
    const { db, alice } = setup();
    const bank = makeGroup(db, alice.id, "银行", 1_000);
    makeGroup(db, alice.id, "阿里云", 2_000);
    makeItem(db, alice.id, "招商", bank);
    makeItem(db, alice.id, "工行", bank);
    makeItem(db, alice.id, "没归组");

    const groups = listGroups(db, alice.id);
    // created_at DESC：2_000 的「阿里云」在前
    expect(groups.map((group) => group.name)).toEqual(["阿里云", "银行"]);
    expect(groups.map((group) => group.itemCount)).toEqual([0, 2]);
  });

  it("同一个人不能有两个同名群组；不同人可以重名", () => {
    const { db, alice, bob } = setup();
    expect(createGroup(db, alice.id, "银行").ok).toBe(true);
    expect(createGroup(db, alice.id, "银行")).toEqual({ ok: false, error: "duplicate" });
    expect(createGroup(db, bob.id, "银行").ok).toBe(true);
  });

  it("重命名：成功 / 撞名 / 群组不存在（含别人的群组）", () => {
    const { db, alice, bob } = setup();
    const bank = makeGroup(db, alice.id, "银行");
    makeGroup(db, alice.id, "阿里云");

    expect(renameGroup(db, alice.id, bank, "银行卡")).toBe("ok");
    expect(renameGroup(db, alice.id, bank, "阿里云")).toBe("duplicate");
    expect(renameGroup(db, alice.id, 9999, "随便")).toBe("missing");
    // bob 拿到 alice 的群组 id 也改不动
    expect(renameGroup(db, bob.id, bank, "抢走")).toBe("missing");
  });

  it("删除群组不删条目：组内条目变成未分组，条目本身还在", () => {
    const { db, alice } = setup();
    const bank = makeGroup(db, alice.id, "银行");
    const kept = makeItem(db, alice.id, "招商", bank);

    expect(deleteGroup(db, alice.id, bank)).toBe(true);

    const item = getItem(db, alice.id, kept.id);
    expect(item).not.toBeNull();
    expect(item?.groupId).toBeNull();
    // 未分组列表里能查到它
    expect(listItems(db, alice.id, null).map((row) => row.id)).toEqual([kept.id]);
    expect(listGroups(db, alice.id)).toEqual([]);
  });

  it("groupExists 只认自己的群组", () => {
    const { db, alice, bob } = setup();
    const bank = makeGroup(db, alice.id, "银行");
    expect(groupExists(db, alice.id, bank)).toBe(true);
    expect(groupExists(db, bob.id, bank)).toBe(false);
  });
});

describe("保险库条目", () => {
  it("字段数组往返：中文、符号、空值都原样保留，顺序不变", () => {
    const { db, alice } = setup();
    const fields = [
      { key: "卡号", value: "8821319", hidden: false },
      { key: "密码", value: 'p@ss "word" \\ ok', hidden: true },
      { key: "备注", value: "", hidden: false },
    ];
    const created = makeItem(db, alice.id, "招商银行信用卡", null, fields);

    const loaded = getItem(db, alice.id, created.id);
    expect(loaded?.fields).toEqual(fields);
  });

  it("排序：更新时间倒序，同一毫秒用 id 倒序兜底", () => {
    const { db, alice } = setup();
    const first = makeItem(db, alice.id, "A", null, [], 1_000);
    makeItem(db, alice.id, "B", null, [], 3_000);
    makeItem(db, alice.id, "C", null, [], 2_000);
    // 与 B 同一毫秒，靠 id 排到 B 前面
    const sameMs = makeItem(db, alice.id, "D", null, [], 3_000);

    expect(listItems(db, alice.id).map((item) => item.title)).toEqual([
      "D",
      "B",
      "C",
      "A",
    ]);

    // 改 A 的时间到最新 → 它浮到最上面
    updateItem(db, alice.id, first.id, { title: "A", groupId: null, fields: [] }, 9_000);
    expect(listItems(db, alice.id)[0].title).toBe("A");
    // sameMs 这次没被改时间，仍在 B 前
    expect(listItems(db, alice.id).map((item) => item.id)[1]).toBe(sameMs.id);
  });

  it("三种视图：全部 / 未分组（null）/ 某个群组", () => {
    const { db, alice } = setup();
    const bank = makeGroup(db, alice.id, "银行");
    const cloud = makeGroup(db, alice.id, "阿里云");
    makeItem(db, alice.id, "招商", bank);
    makeItem(db, alice.id, "ECS", cloud);
    makeItem(db, alice.id, "散记");

    expect(listItems(db, alice.id).length).toBe(3);
    expect(listItems(db, alice.id, null).map((item) => item.title)).toEqual(["散记"]);
    expect(listItems(db, alice.id, bank).map((item) => item.title)).toEqual(["招商"]);
  });

  it("改归属群组会刷新 updated_at", () => {
    const { db, alice } = setup();
    const bank = makeGroup(db, alice.id, "银行");
    const item = makeItem(db, alice.id, "招商", null, [], 1_000);

    updateItem(db, alice.id, item.id, { title: "招商", groupId: bank, fields: [] }, 7_000);

    const updated = getItem(db, alice.id, item.id);
    expect(updated?.groupId).toBe(bank);
    expect(updated?.updatedAt).toBe(7_000);
  });

  it("批量移动：含移到未分组", () => {
    const { db, alice } = setup();
    const bank = makeGroup(db, alice.id, "银行");
    const a = makeItem(db, alice.id, "A");
    const b = makeItem(db, alice.id, "B");
    const c = makeItem(db, alice.id, "C");

    expect(moveItems(db, alice.id, [a.id, b.id], bank, 5_000)).toBe(2);
    expect(listItems(db, alice.id, bank).length).toBe(2);

    expect(moveItems(db, alice.id, [a.id, b.id], null, 6_000)).toBe(2);
    expect(listItems(db, alice.id, bank).length).toBe(0);
    expect(listItems(db, alice.id, null).map((item) => item.id).sort()).toEqual(
      [a.id, b.id, c.id].sort(),
    );
  });

  it("批量删除；空数组不做任何事", () => {
    const { db, alice } = setup();
    const a = makeItem(db, alice.id, "A");
    const b = makeItem(db, alice.id, "B");
    makeItem(db, alice.id, "C");

    expect(deleteItems(db, alice.id, [])).toBe(0);
    expect(deleteItems(db, alice.id, [a.id, b.id])).toBe(2);
    expect(listItems(db, alice.id).map((item) => item.title)).toEqual(["C"]);
    expect(deleteItem(db, alice.id, a.id)).toBe(false);
  });
});

describe("账户隔离（不靠界面，靠每条 SQL 的 user_id）", () => {
  it("bob 查不到 alice 的群组与条目", () => {
    const { db, alice, bob } = setup();
    const bank = makeGroup(db, alice.id, "银行");
    makeItem(db, alice.id, "招商", bank);

    expect(listGroups(db, bob.id)).toEqual([]);
    expect(listItems(db, bob.id)).toEqual([]);
  });

  it("bob 改不动 / 删不掉 alice 的条目", () => {
    const { db, alice, bob } = setup();
    const item = makeItem(db, alice.id, "招商", null, [{ key: "卡号", value: "1" }]);

    expect(updateItem(db, bob.id, item.id, { title: "偷改", groupId: null, fields: [] })).toBe(
      false,
    );
    expect(deleteItem(db, bob.id, item.id)).toBe(false);
    expect(moveItems(db, bob.id, [item.id], null)).toBe(0);
    expect(deleteItems(db, bob.id, [item.id])).toBe(0);

    const untouched = getItem(db, alice.id, item.id);
    expect(untouched?.title).toBe("招商");
    expect(untouched?.fields).toEqual([{ key: "卡号", value: "1", hidden: false }]);
  });

  it("bob 删群组删不到 alice 的", () => {
    const { db, alice, bob } = setup();
    const bank = makeGroup(db, alice.id, "银行");
    expect(deleteGroup(db, bob.id, bank)).toBe(false);
    expect(listGroups(db, alice.id).length).toBe(1);
  });
});

describe("字段解析与派生数据", () => {
  it("parseFields：坏 JSON / 非数组 / 元素形状不对 → 空字段，不抛异常", () => {
    expect(parseFields("not json")).toEqual([]);
    expect(parseFields('{"key":"a","value":"b"}')).toEqual([]);
    expect(parseFields('[{"key":"a"}]')).toEqual([]);
    expect(parseFields('[{"key":"a","value":1}]')).toEqual([]);
    expect(parseFields("[]")).toEqual([]);
    expect(parseFields('[{"key":"卡号","value":"1"},{"key":"","value":"x"}]')).toEqual([
      { key: "卡号", value: "1", hidden: false },
      { key: "", value: "x", hidden: false },
    ]);
  });

  it("parseFields：老数据没有 hidden → 当 false（默认不遮挡）", () => {
    expect(parseFields('[{"key":"a","value":"1"}]')).toEqual([
      { key: "a", value: "1", hidden: false },
    ]);
    expect(parseFields('[{"key":"a","value":"1","hidden":true}]')).toEqual([
      { key: "a", value: "1", hidden: true },
    ]);
  });

  it("serializeFields 写出 key / value / hidden，顺序不变", () => {
    const json = serializeFields([
      { key: "b", value: "2" },
      { key: "a", value: "1", hidden: true },
    ]);
    expect(json).toBe(
      '[{"key":"b","value":"2","hidden":false},{"key":"a","value":"1","hidden":true}]',
    );
  });

  it("collectFieldKeys：并集、首次出现顺序、可封顶", () => {
    const items = [
      { id: 1, groupId: null, title: "", createdAt: 0, updatedAt: 0, fields: [{ key: "卡号", value: "" }, { key: "密码", value: "" }] },
      { id: 2, groupId: null, title: "", createdAt: 0, updatedAt: 0, fields: [{ key: "密码", value: "" }, { key: "客服", value: "" }] },
      { id: 3, groupId: null, title: "", createdAt: 0, updatedAt: 0, fields: [{ key: "地址", value: "" }] },
    ];

    expect(collectFieldKeys(items)).toEqual(["卡号", "密码", "客服", "地址"]);
    expect(collectFieldKeys(items, 2)).toEqual(["卡号", "密码"]);
    expect(collectFieldKeys([])).toEqual([]);
  });

  it("nextUntitledTitle：从最小空号往上补，不吃「未命名说明」", () => {
    const { db, alice } = setup();
    expect(nextUntitledTitle(db, alice.id)).toBe("未命名");

    makeItem(db, alice.id, "未命名");
    expect(nextUntitledTitle(db, alice.id)).toBe("未命名 2");

    // 已有「未命名 5」不影响：序号从最小空号开始补，界面上的名字才连着
    makeItem(db, alice.id, "未命名 5");
    expect(nextUntitledTitle(db, alice.id)).toBe("未命名 2");

    makeItem(db, alice.id, "未命名 2");
    expect(nextUntitledTitle(db, alice.id)).toBe("未命名 3");

    // 「未命名说明」不是占位名，不该占掉「未命名 3」之外的序号
    makeItem(db, alice.id, "未命名说明");
    expect(nextUntitledTitle(db, alice.id)).toBe("未命名 3");
  });

  it("titleTaken 只看得到自己的标题", () => {
    const { db, alice, bob } = setup();
    makeItem(db, alice.id, "招商");
    expect(titleTaken(db, alice.id, "招商")).toBe(true);
    expect(titleTaken(db, alice.id, "工行")).toBe(false);
    expect(titleTaken(db, bob.id, "招商")).toBe(false);
  });
});
