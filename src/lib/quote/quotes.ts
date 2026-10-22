import { QUOTES_CN } from "./quotes-cn";
import { QUOTES_INTL } from "./quotes-intl";

/**
 * 每日一句的句子库（《功能/每日一句》§2.4、§五）。
 *
 * 数据分两个文件按题材存放（中文古典与近现代 / 外国名言中译），在这里合成
 * **一份定长数组**——取句只看下标，不分来源；日期与句子的对应关系由数组顺序决定。
 *
 * 为什么拆两个文件：365 条一条一行的常量本身就是 370 行，超过《技术栈说明》
 * 「单文件约 300 行就拆」的线；拆成两份，每份都在 300 行内，读 diff 时也按题材成块。
 */

export interface Quote {
  /** 正文（含标点，≤ 40 字，单测把关）。 */
  body: string;
  /** 作者；没有明确出处的写「佚名」。 */
  author: string;
}

/** 数据文件的格式是 `[正文, 作者]` 两元组，这里转成具名字段，页面与 action 都用得清楚。 */
function toQuotes(rows: readonly (readonly [string, string])[]): Quote[] {
  return rows.map(([body, author]) => ({ body, author }));
}

/** 全部句子：中文在前、外国名言在后，共 365 条。 */
export const QUOTES: readonly Quote[] = [
  ...toQuotes(QUOTES_CN),
  ...toQuotes(QUOTES_INTL),
];

/**
 * 句子库长度。
 *
 * 取句规则按它取模，而不是写死一个 365：库少一条时取模仍然落在合法下标上，
 * 不会因为「今年第 365 天」拿到 `undefined`。长度必须是 365 这件事由单测钉住。
 */
export const QUOTE_COUNT = QUOTES.length;
