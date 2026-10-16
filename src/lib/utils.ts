import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * 类名合并工具（shadcn 约定的 `cn`，《技术栈说明》§3.4）。
 *
 * 两个库各管一件事：
 * - `clsx` 负责**条件拼接**：字符串、对象（`{ "x": cond }`）、数组、假值都吃得下；
 * - `tailwind-merge` 负责**冲突消解**：`"p-2"` 和 `"p-4"` 同时出现时，保留后者、丢掉前者。
 *   没有它，组件内外两侧的类名谁生效就由 CSS 的书写顺序决定，是个隐藏的雷。
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
