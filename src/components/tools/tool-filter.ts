import { TOOL_CATEGORIES, type Tool, type ToolCategory } from "./tool-catalog";

/**
 * 工具中心的过滤与分组逻辑（纯函数，可单测；《功能/工具中心》§四）。
 * 规则复刻旧界面：搜索匹配「名称 / 描述 / 分类」三处，忽略大小写与首尾空白。
 */

/** 「全部」是筛选器的默认值，不属于任何具体分类。 */
export const ALL_CATEGORY = "全部" as const;

export type CategoryFilter = typeof ALL_CATEGORY | ToolCategory;

/** 筛选条上的全部选项：全部 + 七个分类（数组顺序即展示顺序）。 */
export const CATEGORY_FILTERS: CategoryFilter[] = [
  ALL_CATEGORY,
  ...TOOL_CATEGORIES,
];

export function filterTools(
  tools: Tool[],
  query: string,
  category: CategoryFilter,
): Tool[] {
  const q = query.trim().toLowerCase();
  return tools.filter((tool) => {
    const matchesCategory =
      category === ALL_CATEGORY || tool.category === category;
    const matchesSearch =
      !q ||
      tool.name.toLowerCase().includes(q) ||
      tool.description.toLowerCase().includes(q) ||
      tool.category.toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });
}

/**
 * 按分类分组。注意一处**刻意复刻**的旧行为：
 * 选中具体分类时**始终返回该组**（哪怕过滤结果为空）——
 * 旧界面此时仍显示组标题与「0」计数，而不是空态（见《功能/工具中心》验收 #4）。
 */
export function groupTools(
  tools: Tool[],
  category: CategoryFilter,
): Record<string, Tool[]> {
  if (category !== ALL_CATEGORY) {
    return { [category]: tools };
  }
  const groups: Record<string, Tool[]> = {};
  for (const tool of tools) {
    (groups[tool.category] ??= []).push(tool);
  }
  return groups;
}
