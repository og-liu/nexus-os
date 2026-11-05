/**
 * 文档标签的类型与纯函数（两端共用，不碰数据库）。
 *
 * 这个文件是从原来的 `lib/markdown/tags.ts` 拆出来的一半：**碰库的部分留在
 * `server/tags.ts`**（带 `server-only`），而这里的归一化 / 前缀匹配是纯函数，
 * 客户端也要用（标签条的 `tagKey`、筛选的 `tagMatchesPrefix` 都在浏览器里算）。
 * 拆的理由见《项目优化 04 · 垂直迁移》§三 固定动作 5。
 */

/** 单个标签的对外表示。`count` 是「多少篇文档在用它」，chips 按它排序。 */
export interface MdTag {
  id: number;
  name: string;
  count: number;
}

/** 挂在某篇文档上的标签（列表里用，不需要计数）。 */
export interface MdDocumentTag {
  id: number;
  name: string;
}

/** 标签名的归一化键：`工作` / `工作 ` / `Work` 归一后分别相等或不等，用来判重。 */
export function tagKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** 标签名上限。太长会把左栏 chips 撑爆，也没什么用。 */
export const TAG_NAME_MAX = 30;
/** 一篇文档最多挂多少个标签。防手滑，也防 chips 条失控。 */
export const TAGS_PER_DOCUMENT_MAX = 12;

/** 归一化 + 校验一行输入；不合法返回 `null`（调用方跳过这一条）。 */
export function normalizeTagName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // 名字里的「/」两侧空白统一去掉：`工作 / 周报` → `工作/周报`
  const name = raw
    .trim()
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .replace(/^\/+|\/+$/g, "");
  if (name === "") return null;
  if (Array.from(name).length > TAG_NAME_MAX) return null;
  if (tagKey(name) === "") return null;
  return name;
}

/** 去重 + 归一化一批名字（保持输入顺序）。 */
export function normalizeTagNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const names: string[] = [];
  for (const entry of raw) {
    const name = normalizeTagName(entry);
    if (!name) continue;
    const key = tagKey(name);
    if (names.some((existing) => tagKey(existing) === key)) continue;
    names.push(name);
    if (names.length >= TAGS_PER_DOCUMENT_MAX) break;
  }
  return names;
}

/** 这个标签名是不是 `prefix` 本身或它的子标签。 */
export function tagMatchesPrefix(nameKey: string, prefixKey: string): boolean {
  return nameKey === prefixKey || nameKey.startsWith(`${prefixKey}/`);
}
