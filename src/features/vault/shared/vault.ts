/**
 * 保险库的类型与纯函数（两端共用，不碰数据库）。
 *
 * 这个文件是从原来的 `lib/vault/vault.ts` 拆出来的一半：**碰库的部分留在
 * `server/vault.ts`**（带 `server-only`），而这里的 JSON 编解码与派生数据是纯函数，
 * 客户端也要用（中栏列头 `collectFieldKeys` 就在浏览器里算）。
 * 拆的理由见《项目优化 04 · 垂直迁移》§三 固定动作 5。
 */

/** 条目里的一个自定义字段。`key` 是字段名（用户自己起），`value` 是值。 */
export interface VaultField {
  key: string;
  value: string;
  /**
   * 默认要不要遮挡（眼睛闭着）。缺省 = 不遮挡。
   *
   * **这个落库，和「临时点开看一眼」是两回事**：它回答「这条记录的这一格，
   * 我一打开就想不想看见」——是用户对数据的设定，所以跟着记录存。
   * 临时点眼睛只是改变这一刻的显示，不写回。
   */
  hidden?: boolean;
}

/** 对外的条目表示（camelCase）。库里的 `fields` 是 JSON 文本，这里已经是数组。 */
export interface VaultItem {
  id: number;
  groupId: number | null;
  title: string;
  fields: VaultField[];
  createdAt: number;
  updatedAt: number;
}

/** 对外的群组表示。`itemCount` 是查出来的，不是存的（详见群组表文档 §二）。 */
export interface VaultGroup {
  id: number;
  name: string;
  createdAt: number;
  itemCount: number;
}

/** 新建 / 编辑条目时传进来的东西。 */
export interface VaultItemInput {
  title: string;
  groupId: number | null;
  fields: VaultField[];
}

/**
 * 把库里的 JSON 文本还原成字段数组。**坏数据不能把整个列表弄崩**：
 * 库里这一列是文本，理论上可能被手工改坏（或用旧版本的格式写进去过）。
 * 解析失败按「没有字段」处理并留一条服务端日志，界面照常显示，用户至少能看到标题与时间。
 */
export function parseFields(raw: string): VaultField[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("[vault] fields 不是合法 JSON，按空字段处理：", raw.slice(0, 120));
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.warn("[vault] fields 不是数组，按空字段处理：", raw.slice(0, 120));
    return [];
  }
  // 逐项过滤：只收 k/v 都是字符串的元素，别的形状一律丢掉
  return parsed.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { key, value, hidden } = entry as {
      key?: unknown;
      value?: unknown;
      hidden?: unknown;
    };
    if (typeof key !== "string" || typeof value !== "string") return [];
    return [{ key, value, hidden: hidden === true }];
  });
}

/** 字段数组 → 存库的 JSON 文本。顺序就是用户拖出来的顺序，不排序。 */
export function serializeFields(fields: VaultField[]): string {
  return JSON.stringify(
    fields.map(({ key, value, hidden }) => ({ key, value, hidden: hidden === true })),
  );
}

/**
 * 中栏列头的来源：这些条目的字段名**并集**，按首次出现顺序，最多 `limit` 个。
 *
 * 为什么取并集：同一群组里的记录结构通常一致（都是「卡号 / 密码 / 客服电话」），
 * 并集才能横向比较；按首次出现顺序排，列头不会随选中项跳动。
 * 为什么封顶：中栏再宽也就 900px，5 个字段列加上标题与时间会挤成一条缝。
 */
export function collectFieldKeys(items: VaultItem[], limit = 4): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    for (const field of item.fields) {
      if (!seen.has(field.key)) seen.add(field.key);
      if (seen.size >= limit) return [...seen];
    }
  }
  return [...seen];
}
