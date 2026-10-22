"use server";

import { nextQuoteIndex, quoteAt, type DailyQuote } from "./daily";

/**
 * 「换一句」的 Server Action（《功能/每日一句》§2.4、§四）。
 *
 * 句子库只留在服务端：客户端不 import `quotes.ts`，浏览器包里不会多背 365 条常量
 * （《功能/每日一句》§七「句子库进浏览器包」）。这里返回一条，客户端只拿到这一条。
 *
 * 三件**没做**的事，各有理由：
 * - 不 `requireUser()`：句子里没有任何用户数据，读的是代码内的公开常量；
 *   加一道登录检查只是让每次点击多一次会话查询。
 * - 不写库：换一句只改当前显示，刷新回到当天那句（§四「换一句要不要落库」）。
 * - 不 `revalidatePath()`：首页上「今天那句」由日期决定，不因这次调用而变；
 *   让页面缓存失效反而会把刚换上的一句冲掉。
 *
 * 它是公开 HTTP 端点，所以下标先过 `normalizeIndex`：收到越界数字、小数、
 * 别的类型都不会把 `undefined` 当句子返回出去。
 */
export async function nextQuote(index: number): Promise<DailyQuote> {
  const next = nextQuoteIndex(index);
  const quote = quoteAt(next);
  return { index: next, body: quote.body, author: quote.author };
}
