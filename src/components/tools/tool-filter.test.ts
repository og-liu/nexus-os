import { describe, expect, it } from "vitest";
import { TOOLS, TOOL_CATEGORIES, findToolBySlug } from "./tool-catalog";
import { filterTools, groupTools } from "./tool-filter";

describe("tool-catalog（《功能/工具中心》数据）", () => {
  it("共 60 个工具，名称不重复", () => {
    expect(TOOLS).toHaveLength(60);
    const names = TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("59 个 slug 唯一且格式是全小写连字符", () => {
    const slugs = TOOLS.map((tool) => tool.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it("按 slug 精确查找，大小写不匹配时查不到", () => {
    expect(findToolBySlug("image-compress")?.name).toBe("图片压缩");
    expect(findToolBySlug("Image-Compress")).toBeUndefined();
    expect(findToolBySlug("not-a-real-tool")).toBeUndefined();
  });

  it("七个分类都有工具，状态取值合法", () => {
    for (const category of TOOL_CATEGORIES) {
      expect(TOOLS.some((tool) => tool.category === category)).toBe(true);
    }
    for (const tool of TOOLS) {
      expect(["可用", "开发中"]).toContain(tool.status);
    }
  });
});

describe("filterTools（搜索 + 分类过滤）", () => {
  it("空条件返回全部工具；纯空白先 trim 再判断", () => {
    expect(filterTools(TOOLS, "", "全部")).toHaveLength(TOOLS.length);
    expect(filterTools(TOOLS, "   ", "全部")).toHaveLength(TOOLS.length);
  });

  it("按分类过滤后，结果的分类全是所选分类", () => {
    const files = filterTools(TOOLS, "", "文件");
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((tool) => tool.category === "文件")).toBe(true);
  });

  it("搜索忽略大小写，名称 / 描述 / 分类三处都能命中", () => {
    expect(filterTools(TOOLS, "gif", "全部").map((t) => t.name)).toContain(
      "GIF 制作",
    );
    expect(filterTools(TOOLS, "GIF", "全部").map((t) => t.name)).toContain(
      "GIF 制作",
    );
    // 命中描述
    expect(filterTools(TOOLS, "超分辨率", "全部").map((t) => t.name)).toEqual([
      "图片放大",
    ]);
    // 命中分类名（旧行为：搜「媒体」捞出整个媒体分类）
    expect(filterTools(TOOLS, "媒体", "全部")).toHaveLength(6);
  });

  it("搜索与分类叠加生效", () => {
    const result = filterTools(TOOLS, "图片", "文件");
    expect(result.every((tool) => tool.category === "文件")).toBe(true);
  });

  it("无匹配返回空数组", () => {
    expect(filterTools(TOOLS, "不存在的工具zzz", "全部")).toHaveLength(0);
  });
});

describe("groupTools（分类分组）", () => {
  it("「全部」按分类分组：七个分组、顺序与目录一致", () => {
    const groups = groupTools(TOOLS, "全部");
    expect(Object.keys(groups)).toEqual([...TOOL_CATEGORIES]);
    expect(groups["图片"]).toHaveLength(12);
    expect(groups["生活"]).toHaveLength(11);
  });

  it("选中具体分类：只含该组；结果为空也保留组（复刻旧行为，不是 bug）", () => {
    const media = groupTools(
      TOOLS.filter((tool) => tool.category === "媒体"),
      "媒体",
    );
    expect(Object.keys(media)).toEqual(["媒体"]);

    const empty = groupTools([], "图片");
    expect(empty).toEqual({ 图片: [] });
  });
});
