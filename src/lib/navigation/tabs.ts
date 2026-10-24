/**
 * 页签栏的纯逻辑（《功能/页签栏》§三 / §五）。
 *
 * 这一层只算「怎么变」：登记、去重、关闭、算邻居、序列化。
 * 不碰 `window` / `sessionStorage`、也不 import 组件——读写存储与渲染都在
 * `components/layout/tab-bar.tsx`。分开的好处是规则能脱离浏览器钉住（`tabs.test.ts`）。
 *
 * 两条不变量贯穿所有函数：
 * 1. `HOME_PATH`（总览）永远在第一位、永远存在、关不掉；
 * 2. 同一个路径只出现一次，顺序按第一次访问的先后——重复访问只让它变激活态，
 *    不追加、也不挪位置（挪位置会让用户眼里的标签乱跳）。
 */

/** `sessionStorage` 的键名（《功能/页签栏》§三）。 */
export const TABS_STORAGE_KEY = "nexus-os:tabs";

/** 固定标签：总览。 */
export const HOME_PATH = "/";

/** 一个标签。**只存路径、不存标题**：标题由白名单现查，菜单改名后标签跟着变。 */
export interface Tab {
  path: string;
}

/** 只认站内绝对路径（`/` 开头）；`//host` 是协议相对地址，不算。 */
function isTabPath(value: unknown): value is string {
  return (
    typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
  );
}

/**
 * 收成合法标签表：丢掉非法项与重复项、保证总览在最左。
 * 已经是合法表时原样返回同一个数组——调用方可以据此跳过重渲染。
 */
function normalizeTabs(tabs: Tab[]): Tab[] {
  const seen = new Set<string>();
  const result: Tab[] = [];
  for (const tab of tabs) {
    if (!isTabPath(tab.path) || seen.has(tab.path)) continue;
    seen.add(tab.path);
    result.push({ path: tab.path });
  }
  if (result[0]?.path !== HOME_PATH) {
    result.unshift({ path: HOME_PATH });
  }

  const unchanged =
    result.length === tabs.length &&
    result.every((tab, index) => tab.path === tabs[index]?.path);
  return unchanged ? tabs : result;
}

/**
 * 登记一次访问：没有就追加到末尾，已有就原样返回（同一个数组引用）。
 * 总览也走这里——它本来就在第一位，所以等价于什么都不做。
 */
export function registerTab(tabs: Tab[], path: string): Tab[] {
  if (!isTabPath(path)) return tabs;
  const base = normalizeTabs(tabs);
  if (base.some((tab) => tab.path === path)) return base;
  return [...base, { path }];
}

/** 关掉一个标签。总览关不掉、也不在列表里的路径，都原样返回。 */
export function removeTab(tabs: Tab[], path: string): Tab[] {
  if (path === HOME_PATH) return tabs;
  if (!tabs.some((tab) => tab.path === path)) return tabs;
  return tabs.filter((tab) => tab.path !== path);
}

/**
 * 关掉 `closingPath` 之后该去哪个路径：先右邻居，右边没有就左邻居，
 * 都没有就回总览（与浏览器关标签页的手感一致，用户不用学第二套）。
 *
 * 传进来的应当是**关之前**的列表——邻居要按原来的次序算。
 */
export function nextPathAfterClose(
  tabs: readonly Tab[],
  closingPath: string,
): string {
  const index = tabs.findIndex((tab) => tab.path === closingPath);
  if (index < 0) return HOME_PATH;
  return tabs[index + 1]?.path ?? tabs[index - 1]?.path ?? HOME_PATH;
}

/** 序列化成 `sessionStorage` 里存的字符串（`[{"path":"/"}]`）。 */
export function serializeTabs(tabs: readonly Tab[]): string {
  return JSON.stringify(tabs.map((tab) => ({ path: tab.path })));
}

/**
 * 从 `sessionStorage` 的字符串还原标签表。
 *
 * 存储里的东西一律当**不可信输入**：解析失败、不是数组、缺字段、路径不合法
 * 都只是丢掉对应项；怎么都还原不出来就给一张只有总览的表——页签栏永远能画。
 */
export function parseTabs(raw: string | null): Tab[] {
  if (!raw) return [{ path: HOME_PATH }];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [{ path: HOME_PATH }];
  }
  if (!Array.isArray(parsed)) return [{ path: HOME_PATH }];

  const tabs: Tab[] = [];
  for (const entry of parsed) {
    const path =
      typeof entry === "object" && entry !== null
        ? (entry as { path?: unknown }).path
        : undefined;
    if (isTabPath(path)) tabs.push({ path });
  }
  return normalizeTabs(tabs);
}
