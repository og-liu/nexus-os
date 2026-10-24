import { describe, expect, it } from "vitest";
import {
  HOME_PATH,
  nextPathAfterClose,
  parseTabs,
  registerTab,
  removeTab,
  serializeTabs,
  type Tab,
} from "./tabs";

/**
 * 页签栏纯逻辑的用例（《功能/页签栏》§一 做 / §四 关键决策 / §六 验收）。
 *
 * 这里钉的都是「不打开浏览器也能判死」的规则：登记去重、顺序、邻居怎么选、
 * 存储被写坏时怎么兜底。外观与路由行为不在这里测（那要靠 §六 的浏览器验收）。
 */

const paths = (tabs: readonly Tab[]) => tabs.map((tab) => tab.path);

describe("registerTab", () => {
  it("没登记过的路径追加到末尾", () => {
    const tabs: Tab[] = [{ path: "/" }, { path: "/tools" }];
    expect(paths(registerTab(tabs, "/settings"))).toEqual([
      "/",
      "/tools",
      "/settings",
    ]);
  });

  it("重复访问不追加、不挪位置，并返回同一个数组引用", () => {
    const tabs: Tab[] = [{ path: "/" }, { path: "/tools" }, { path: "/files" }];
    const next = registerTab(tabs, "/tools");
    expect(paths(next)).toEqual(["/", "/tools", "/files"]);
    expect(next).toBe(tabs);
  });

  it("空列表登记时先补上固定标签「总览」", () => {
    expect(paths(registerTab([], "/tools"))).toEqual(["/", "/tools"]);
  });

  it("非法路径不登记：必须有 / 开头、且不能是协议相对地址", () => {
    const tabs: Tab[] = [{ path: "/" }];
    expect(registerTab(tabs, "tools")).toBe(tabs);
    expect(registerTab(tabs, "//evil.example.com")).toBe(tabs);
    expect(registerTab(tabs, "")).toBe(tabs);
  });
});

describe("removeTab", () => {
  it("关掉一个普通标签，其余顺序不变", () => {
    const tabs: Tab[] = [{ path: "/" }, { path: "/tools" }, { path: "/files" }];
    expect(paths(removeTab(tabs, "/tools"))).toEqual(["/", "/files"]);
  });

  it("总览关不掉", () => {
    const tabs: Tab[] = [{ path: "/" }, { path: "/files" }];
    expect(removeTab(tabs, HOME_PATH)).toBe(tabs);
  });

  it("不在列表里的路径：原样返回同一个数组", () => {
    const tabs: Tab[] = [{ path: "/" }];
    expect(removeTab(tabs, "/settings")).toBe(tabs);
  });
});

describe("nextPathAfterClose", () => {
  const tabs: Tab[] = [
    { path: "/" },
    { path: "/tools" },
    { path: "/tools/sticky-notes" },
    { path: "/tools/todo-list" },
  ];

  it("右边有邻居就落到右邻居", () => {
    expect(nextPathAfterClose(tabs, "/tools")).toBe("/tools/sticky-notes");
  });

  it("右边没有就落到左邻居", () => {
    // 《功能/页签栏》§六 验收 4 的例子：待办清单此刻是最右一个标签，关掉它落到便签
    expect(nextPathAfterClose(tabs, "/tools/todo-list")).toBe(
      "/tools/sticky-notes",
    );
  });

  it("只剩总览时回总览（总览本身也关不掉）", () => {
    expect(nextPathAfterClose([{ path: "/" }], "/")).toBe("/");
  });

  it("不在列表里的路径：回总览", () => {
    expect(nextPathAfterClose(tabs, "/tools/not-a-tool")).toBe("/");
  });

  it("关掉当前激活的标签 = 先按原次序算邻居、再移除（两步拼起来的结果）", () => {
    const current: Tab[] = [
      { path: "/" },
      { path: "/tools" },
      { path: "/tools/sticky-notes" },
    ];
    const next = nextPathAfterClose(current, "/tools/sticky-notes");
    const left = removeTab(current, "/tools/sticky-notes");

    expect(next).toBe("/tools");
    expect(paths(left)).toEqual(["/", "/tools"]);
  });
});

describe("serializeTabs / parseTabs", () => {
  it("往返一致", () => {
    const tabs: Tab[] = [{ path: "/" }, { path: "/tools/todo-list" }];
    expect(parseTabs(serializeTabs(tabs))).toEqual(tabs);
  });

  it("没有存储（null / 空串）时只给总览", () => {
    expect(paths(parseTabs(null))).toEqual(["/"]);
    expect(paths(parseTabs(""))).toEqual(["/"]);
  });

  it("存储里不是 JSON / 不是数组时兜底成总览，不抛错", () => {
    expect(paths(parseTabs("not json"))).toEqual(["/"]);
    expect(paths(parseTabs('{"path":"/tools"}'))).toEqual(["/"]);
    expect(paths(parseTabs("null"))).toEqual(["/"]);
  });

  it("坏项与重复项逐个丢掉，不影响其余标签", () => {
    const raw = JSON.stringify([
      { path: "/tools" },
      { path: 42 },
      null,
      "settings",
      { path: "/tools" },
      { path: "//evil.example.com" },
      { path: "/files" },
    ]);
    expect(paths(parseTabs(raw))).toEqual(["/", "/tools", "/files"]);
  });

  it("存储里缺总览时补回最左（总览永远在第一位）", () => {
    const raw = JSON.stringify([{ path: "/files" }, { path: "/tools" }]);
    expect(paths(parseTabs(raw))).toEqual(["/", "/files", "/tools"]);
  });
});
