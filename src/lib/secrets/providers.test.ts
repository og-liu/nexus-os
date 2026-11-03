import { describe, expect, it } from "vitest";
import { SECRET_GROUPS, SECRET_PROVIDERS, resolveGroup } from "./providers";

describe("resolveGroup", () => {
  it("合法的 tab 原样返回", () => {
    expect(resolveGroup("model")).toBe("model");
    expect(resolveGroup("tool")).toBe("tool");
  });

  it("乱写的值兜底到第一个分组，而不是报错或空页面", () => {
    expect(resolveGroup("nonsense")).toBe("model");
    expect(resolveGroup("")).toBe("model");
    expect(resolveGroup(undefined)).toBe("model");
  });

  it("同一个参数出现两次时 Next 给数组，取第一个", () => {
    expect(resolveGroup(["tool", "model"])).toBe("tool");
  });
});

describe("SECRET_GROUPS 与 SECRET_PROVIDERS 的约束", () => {
  it("每个 provider 的 group 都能在分组表里找到（否则那个 Key 永远不会显示）", () => {
    const ids = new Set(SECRET_GROUPS.map((group) => group.id));
    for (const provider of SECRET_PROVIDERS) {
      expect(ids.has(provider.group)).toBe(true);
    }
  });

  it("分组 id 是英文短横线格式，能直接当 URL 参数", () => {
    for (const group of SECRET_GROUPS) {
      expect(group.id).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it("provider id 不重复（它是 user_secrets 的主键之一）", () => {
    const ids = SECRET_PROVIDERS.map((provider) => provider.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
