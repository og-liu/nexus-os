/**
 * 体积格式化（《功能/图片压缩》§四「体积单位」）。
 *
 * 一律按 **1024 进制**：1 KB = 1024 B，1 MB = 1024 KB。
 * 理由：和技术口径一致——`ls -l`、`file`、开发者工具看到的是同一串字节数，
 * 验收时换算得回去。macOS Finder 用的是 1000 进制，同一个文件会差约 5%，
 * 所以界面上**只显示这一套单位**，不并列两套数字。
 *
 * 精度：数值 < 10 时保留一位小数（`3.0 MB`、`1.5 KB`），≥ 10 时取整
 * （`620 KB`、`12 MB`）——大数的小数位没有意义，小数没有小数位会变成 `1 MB` 这种糊弄。
 */

const UNITS = ["B", "KB", "MB", "GB"] as const;

/** 把字节数格式化成 `B` / `KB` / `MB` / `GB`（1024 进制）。 */
export function formatBytes(bytes: number): string {
  // 0 字节、负数、NaN 都落到「0 B」：界面上不该出现 `-1 B` 或 `NaN MB`
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  // 字节本身没有小数（不可能有 1024.5 个字节）
  if (unitIndex === 0) return `${Math.round(value)} B`;

  const digits = value < 10 ? 1 : 0;
  return `${value.toFixed(digits)} ${UNITS[unitIndex]}`;
}

/**
 * 压缩省下的百分比（四舍五入成整数）。
 *
 * 正数 = 省下（结果更小），负数 = 反而变大了（JS 结果区会显示 `+N%` 并给建议）。
 * 原体积为 0 或非法时返回 0，避免除零得出 `Infinity`。
 */
export function percentSaved(originalBytes: number, compressedBytes: number): number {
  if (!Number.isFinite(originalBytes) || originalBytes <= 0) return 0;
  if (!Number.isFinite(compressedBytes) || compressedBytes < 0) return 0;
  return Math.round((1 - compressedBytes / originalBytes) * 100);
}
