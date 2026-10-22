/**
 * `lunar-javascript` 1.7.x 的**最小类型声明**。
 *
 * 这个包是单文件 CJS（`lunar.js` 约 436KB），既没有 ESM 也没有 `.d.ts`
 * （《功能/日期时间面板》§七「农历库是 CJS 单文件」）。
 * 这里只声明本项目用到的那几个成员——不写 `any`，也不假装覆盖整个库；
 * 以后要用新方法就在这儿补一行，比在调用处塞 `any` 更容易被看见。
 */
declare module "lunar-javascript" {
  /** 公历（阳历）的某一天。 */
  export class Solar {
    static fromYmd(year: number, month: number, day: number): Solar;
    /** 对应的农历日期。 */
    getLunar(): Lunar;
    /** 公历节日，如 `["国庆节"]`；没有则空数组。 */
    getFestivals(): string[];
  }

  /** 农历日期。 */
  export class Lunar {
    /** 农历月的中文数字；闰月带「闰」字（如「闰二」）。 */
    getMonthInChinese(): string;
    /** 农历日的中文数字（如「十三」「廿一」「初一」）。 */
    getDayInChinese(): string;
    /** 农历节日，如 `["中秋节"]`；没有则空数组。 */
    getFestivals(): string[];
    /** 节气名，如「立春」；**不是节气日返回空串**（§七「节气只在当天有值」）。 */
    getJieQi(): string;
  }
}
