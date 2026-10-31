import { describe, expect, it } from "vitest";
import { TOOLS, TOOL_CATEGORIES, findToolBySlug } from "./tool-catalog";
import { filterTools, groupTools } from "./tool-filter";

describe("tool-catalog（《功能/工具中心》数据）", () => {
  it("只收真能用的工具：6 个，名称不重复", () => {
    expect(TOOLS).toHaveLength(6);
    const names = TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("slug 唯一且格式是全小写连字符", () => {
    const slugs = TOOLS.map((tool) => tool.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it("六个真工具的 slug 一个不少", () => {
    expect(TOOLS.map((tool) => tool.slug).sort()).toEqual([
      "attendance-calendar",
      "image-compress",
      "markdown-editor",
      "sticky-notes",
      "todo-list",
      "vault",
    ]);
  });

  it("按 slug 精确查找，大小写不匹配时查不到", () => {
    expect(findToolBySlug("image-compress")?.name).toBe("图片压缩");
    expect(findToolBySlug("Image-Compress")).toBeUndefined();
    expect(findToolBySlug("not-a-real-tool")).toBeUndefined();
  });

  it("工具的分类必须在七个分类之内，状态取值合法", () => {
    for (const tool of TOOLS) {
      expect(TOOL_CATEGORIES).toContain(tool.category);
      expect(["可用", "开发中"]).toContain(tool.status);
    }
    // 分类是路线图，允许暂时没有工具（空分类由 views 给占位提示）
    const emptyCategories = TOOL_CATEGORIES.filter(
      (category) => !TOOLS.some((tool) => tool.category === category),
    );
    expect(emptyCategories.length).toBeGreaterThan(0);
  });
});

describe("filterTools（搜索 + 分类过滤）", () => {
  it("空条件返回全部工具；纯空白先 trim 再判断", () => {
    expect(filterTools(TOOLS, "", "全部")).toHaveLength(TOOLS.length);
    expect(filterTools(TOOLS, "   ", "全部")).toHaveLength(TOOLS.length);
  });

  it("按分类过滤后，结果的分类全是所选分类", () => {
    const life = filterTools(TOOLS, "", "生活");
    expect(life).toHaveLength(2);
    expect(life.every((tool) => tool.category === "生活")).toBe(true);

    // 便签 / 待办归「文本」，不是「生活」（2026-10-30 调整）
    const text = filterTools(TOOLS, "", "文本");
    expect(text.map((tool) => tool.slug).sort()).toEqual([
      "sticky-notes",
      "todo-list",
    ]);
  });

  it("空分类返回空数组（页面据此显示占位提示）", () => {
    for (const category of ["文件", "媒体", "AI"] as const) {
      expect(filterTools(TOOLS, "", category)).toHaveLength(0);
    }
    // 「开发」在 Markdown 编辑器上线后不再是空分类（《功能/工具中心》验收 1）
    expect(filterTools(TOOLS, "", "开发").map((tool) => tool.slug)).toEqual([
      "markdown-editor",
    ]);
  });

  it("搜索忽略大小写，名称 / 描述 / 分类三处都能命中", () => {
    expect(filterTools(TOOLS, "压缩", "全部").map((t) => t.name)).toEqual([
      "图片压缩",
    ]);
    // 命中描述
    expect(filterTools(TOOLS, "常驻", "全部").map((t) => t.name)).toEqual([
      "便签",
    ]);
    // 命中分类名：搜「生活」捞出整个生活分类
    expect(filterTools(TOOLS, "生活", "全部")).toHaveLength(2);
  });

  it("搜索与分类叠加生效", () => {
    const result = filterTools(TOOLS, "图片", "生活");
    expect(result).toHaveLength(0);
  });

  it("无匹配返回空数组", () => {
    expect(filterTools(TOOLS, "不存在的工具zzz", "全部")).toHaveLength(0);
  });
});

describe("groupTools（分类分组）", () => {
  it("「全部」只给有工具的分类分组，顺序与目录一致", () => {
    const groups = groupTools(TOOLS, "全部");
    expect(Object.keys(groups)).toEqual(["图片", "文本", "生活", "开发"]);
    expect(groups["图片"]).toHaveLength(1);
    expect(groups["文本"]).toHaveLength(2);
    expect(groups["生活"]).toHaveLength(2);
    expect(groups["开发"]).toHaveLength(1);
  });

  it("选中具体分类：只含该组；结果为空也保留组（靠它渲染占位提示）", () => {
    const life = groupTools(
      TOOLS.filter((tool) => tool.category === "生活"),
      "生活",
    );
    expect(Object.keys(life)).toEqual(["生活"]);

    const empty = groupTools([], "图片");
    expect(empty).toEqual({ 图片: [] });
  });
});
