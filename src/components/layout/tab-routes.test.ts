import { describe, expect, it } from "vitest";
import { TOOLS } from "@/components/tools/tool-catalog";
import { isTabRoute, resolveTabLabel } from "./tab-routes";

/**
 * 页签栏白名单的守门用例（《功能/页签栏》§二 / §七）。
 *
 * 白名单是**显式**的：新工具上线时忘了往 `TOOL_TAB_SLUGS` 里加一行，页签栏里就
 * 不会出现它的标签——保险库、图片压缩都踩过这个坑。这里把「工具目录里状态为可用的
 * 工具，必须都能开标签」钉成用例，以后漏登记会直接红。
 */
describe("resolveTabLabel（页签栏白名单）", () => {
  it("工具目录里所有「可用」的工具都能开标签，且标签名就是工具名", () => {
    const available = TOOLS.filter((tool) => tool.status === "可用");
    expect(available.length).toBeGreaterThan(0);

    for (const tool of available) {
      const path = `/tools/${tool.slug}`;
      expect(isTabRoute(path), `${path} 没登记进页签栏白名单`).toBe(true);
      expect(resolveTabLabel(path)).toBe(tool.name);
    }
  });

  it("一级入口取侧栏的同一份文案", () => {
    expect(resolveTabLabel("/")).toBe("总览");
    expect(resolveTabLabel("/tools")).toBe("工具");
  });

  it("没登记的工具页 / 未知路径返回 null，不开标签", () => {
    expect(resolveTabLabel("/tools/image-format-convert")).toBeNull();
    expect(resolveTabLabel("/login")).toBeNull();
    expect(resolveTabLabel("/tools/not-a-tool")).toBeNull();
    expect(resolveTabLabel("")).toBeNull();
  });
});
