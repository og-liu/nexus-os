/**
 * 节日标签的三源合并（《功能/日期时间面板》§2.4 内容规则）。
 *
 * 三个来源依次是：公历节日（`Solar.getFestivals()`）→ 农历节日（`Lunar.getFestivals()`）
 * → 当日节气（`Lunar.getJieQi()`）。同名只保留第一次出现的那条，所以顺序天然是
 * 「公历 → 农历 → 节气」，同一个节日不会因为来源不同而换位置。
 *
 * - **不碰 `getOtherFestivals()`**：那里是国际日、纪念日，一天几十条，进来就是噪音（§一、§七）。
 * - 节气在非节气日给的是空串，这里按「空就丢」处理：空标签不占位（§七「节气只在当天有值」）。
 * - 本文件**不 import lunar-javascript**：调用库的地方在服务端 `today.ts`，
 *   这里保持纯函数，浏览器与测试都能安全引用（§七「农历库进浏览器包」）。
 */

export interface FestivalSources {
  /** 公历节日。 */
  solar?: readonly string[];
  /** 农历节日。 */
  lunar?: readonly string[];
  /** 当日节气；不是节气日时空串。 */
  jieQi?: string;
}

/** 三源合并去重，保持「公历 → 农历 → 节气」的顺序；全部为空时返回空数组。 */
export function mergeFestivals({
  solar = [],
  lunar = [],
  jieQi = "",
}: FestivalSources = {}): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const name of [...solar, ...lunar, jieQi]) {
    const label = name.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}
