/**
 * 图片压缩的参数常量（《功能/图片压缩》§一 / §二）。
 *
 * 界面与纯逻辑共用同一份：滑杆的 `min/max/step` 与体积上限都从这里取，
 * 避免组件里再抄一遍数字导致「滑杆能拖到 1.0 但校验按 0.95」这类错位。
 *
 * **没有「最大边长」**：2026-10-30 联调把这项参数整个去掉了——只做原尺寸压缩。
 */

/** 单张图片的体积上限：20 MB（1024 进制）。超过立刻拒绝，不进入解码。 */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** 质量滑杆：0.5–0.95，步长 0.05，默认 0.8。 */
export const QUALITY_MIN = 0.5;
export const QUALITY_MAX = 0.95;
export const QUALITY_STEP = 0.05;
export const DEFAULT_QUALITY = 0.8;
