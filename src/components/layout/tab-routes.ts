import { findToolBySlug } from "@/components/tools/tool-catalog";
import { navItems } from "@/components/layout/nav-items";

/**
 * 页签栏白名单（《功能/页签栏》§二）：**哪些路径会开标签**。
 *
 * 不在表里的路径（404、登录页、以后新增但没登记的页面）不开标签——页面照常显示，
 * 只是栏里没有对应的激活项。新页面要进页签栏 = 在这里加一行，这是显式决策，不是自动推断。
 *
 * 标题只有一个真相源，这里不重抄文字：
 * - 七个一级入口取 `nav-items.ts`（与侧边栏同一份，菜单改名两边一起变）；
 * - 工具页取工具目录里的 `name`（`/tools/<slug>`），本文件只登记「哪些 slug 算数」。
 */

/**
 * 会开标签的工具页 slug。工具目录里还有几十个「开发中」的条目，
 * 它们不是页签栏的入口——加一个可用工具时才在这里加一行。
 */
const TOOL_TAB_SLUGS = new Set([
  "sticky-notes",
  "todo-list",
  "attendance-calendar",
  "vault",
  "image-compress",
  "markdown-editor",
]);

const TOOL_PATH_PREFIX = "/tools/";

/** 路径 → 标签文字；不登记就返回 `null`。 */
export function resolveTabLabel(path: string): string | null {
  const navItem = navItems.find((item) => item.href === path);
  if (navItem) return navItem.label;

  if (path.startsWith(TOOL_PATH_PREFIX)) {
    const slug = path.slice(TOOL_PATH_PREFIX.length);
    if (!TOOL_TAB_SLUGS.has(slug)) return null;
    return findToolBySlug(slug)?.name ?? null;
  }

  return null;
}

/** 这个路径会不会开标签（登记与白名单判断共用一处，避免两处各写一遍）。 */
export function isTabRoute(path: string): boolean {
  return resolveTabLabel(path) !== null;
}
