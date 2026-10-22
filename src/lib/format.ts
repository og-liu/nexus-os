/**
 * 时间展示格式化（纯函数，手写，不引 dayjs / date-fns）。
 *
 * 规则：**统一显示绝对日期时间 `YYYY-MM-DD HH:mm`**（精确到分钟）。
 * 不用「今天 / 昨天」这类相对说法——同一块列表里相对日期会随时间变化而跳，
 * 扫读时还要在脑子里换算成「到底是哪天」。
 *
 * 时区：**按 UTC+8 计算**——线上容器多为 UTC，用服务端本地时区会错开 8 小时。
 * 实现：先把时间戳加 8 小时，再用 `getUTC*` 读取，得到的就是 +8 的墙上时间。
 *
 * 便签与待办共用这一份：两个工具的卡片上时间长得一样，换格式只改一处。
 */

const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** 把毫秒时间戳格式化成 `YYYY-MM-DD HH:mm`（UTC+8）。 */
export function formatDateTime(ts: number): string {
  const date = new Date(ts + UTC8_OFFSET_MS);
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hour = pad(date.getUTCHours());
  const minute = pad(date.getUTCMinutes());
  return `${year}-${month}-${day} ${hour}:${minute}`;
}
