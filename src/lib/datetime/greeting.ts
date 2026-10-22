/**
 * 问候词分档（《功能/日期时间面板》§2.4 内容规则）。
 *
 * 只收**小时数**、不碰 `Date`：分档边界能一条条测出来，
 * 时区的事交给调用方（`shanghaiParts` 给北京时间的小时，`today.ts` 负责串起来）。
 *
 * 六档：`<6` 夜深了 · `6–8` 早上好 · `9–11` 上午好 · `12–13` 中午好 · `14–17` 下午好 · `≥18` 晚上好
 */
export function greetingForHour(hour: number): string {
  if (hour < 6) return "夜深了";
  if (hour < 9) return "早上好";
  if (hour < 12) return "上午好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}
