import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn（类名合并）", () => {
  it("把多个字符串拼成一个类名列表", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("忽略 false、undefined、null 等假值（clsx 语义）", () => {
    expect(cn("a", false && "b", undefined, null)).toBe("a");
  });

  it("同一类名冲突时保留后者（tailwind-merge 语义）", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
