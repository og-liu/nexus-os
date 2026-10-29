/**
 * 随机密码生成（《功能/保险库》§二 弹窗的 🎲 按钮）。
 *
 * 三条要求决定了实现：
 * 1. **必须用 `crypto.getRandomValues`**，不能用 `Math.random()`——后者是可预测的
 *    伪随机（同一进程里前几个输出可以从状态反推），拿来生成密码等于没生成。
 * 2. **不用取模取字符**：`value % 字符集长度` 会让靠前的字符出现概率略高。
 *    这里用拒绝采样（丢掉落在尾部不成整份的那一小段的随机数），把偏差归零。
 * 3. **去掉易混字符** `0 O o 1 l I`：这几个在纸上抄写、在别的字体里看，几乎分不清；
 *    保险库的值经常要被人抄到别的地方去。
 *
 * 这个文件要在**浏览器**里跑（弹窗里点按钮生成），所以不能用 `node:crypto`，
 * 只能用标准 Web Crypto（Node 19+ 也内置了同一个 `crypto` 全局，单测里直接用）。
 */

/** 大写：去掉 `I`（与 `l` `1` 混淆）和 `O`（与 `0` 混淆）。 */
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
/** 小写：去掉 `l` 和 `o`，理由同上。 */
const LOWER = "abcdefghijkmnpqrstuvwxyz";
/** 数字：去掉 `0` 和 `1`。 */
const DIGITS = "23456789";
/** 符号：只留一批在各家系统里都合法的字符（避免某些站点不接受引号、反斜杠）。 */
const SYMBOLS = "!@#$%^&*";

const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

/** 默认长度。20 位 + 四类字符，暴力破解的成本远超个人账号需要。 */
export const PASSWORD_LENGTH = 20;
/** 能生成的最短长度：四类字符各一个才叫「混合」。 */
const MIN_LENGTH = 4;

/**
 * 无偏随机下标（拒绝采样）。
 *
 * `0x1_0000_0000` 是 Uint32 的取值范围；把它切成 `bound` 份会剩下一小段不够一份的，
 * 落在那一段就重抽。这样每个下标概率完全相等。
 */
function randomIndex(bound: number): number {
  const limit = Math.floor(0x1_0000_0000 / bound) * bound;
  const buffer = new Uint32Array(1);
  let value = 0;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return value % bound;
}

/**
 * 生成一个随机密码。
 *
 * 前四步先各类取一个（保证「四类字符都有」不是一个靠运气的期望，而是硬保证），
 * 剩余位置从全集里抽，最后洗牌——不洗牌的话前四位永远是「大写、小写、数字、符号」，
 * 攻击者能直接跳过这部分搜索空间。
 */
export function generatePassword(length = PASSWORD_LENGTH): string {
  const size = Math.max(MIN_LENGTH, Math.floor(length));

  const chars = [
    UPPER[randomIndex(UPPER.length)],
    LOWER[randomIndex(LOWER.length)],
    DIGITS[randomIndex(DIGITS.length)],
    SYMBOLS[randomIndex(SYMBOLS.length)],
  ];

  while (chars.length < size) {
    chars.push(ALL[randomIndex(ALL.length)]);
  }

  // Fisher–Yates 洗牌
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}
