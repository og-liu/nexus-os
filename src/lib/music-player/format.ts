/**
 * 播放器用的显示格式（《功能/音乐播放器》§2.1）。
 *
 * 时间是「秒」，不是毫秒：`<audio>` 的 `currentTime` / `duration` 本来就是秒，
 * 曲目表里存毫秒是为了跟项目其它时间戳一致；转换只在读取处做一次。
 */

/** `4:29`；超过一小时是 `1:02:33`；读不出时长（null / NaN / 负数）显示 `--:--`。 */
export function formatTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "--:--";
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

/** 进度条的可拖区间：0..1；时长未知时返回 0（滑块停在起点、不可拖）。 */
export function progressRatio(position: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const ratio = position / duration;
  if (!Number.isFinite(ratio)) return 0;
  return Math.min(1, Math.max(0, ratio));
}

/**
 * 上传日期 `2026/11/3`（北京时间）。
 *
 * **不用 `toLocaleDateString`**：它在服务端用 Node 的时区与 ICU 数据、在浏览器用用户系统的，
 * 同一个时间戳可能渲染出两种写法，React 会报 hydration 不匹配。这里手动按 UTC+8 算，
 * 两端得到同一个字符串。
 */
export function formatDay(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return "";
  const date = new Date(timestamp + 8 * 60 * 60 * 1000);
  return `${date.getUTCFullYear()}/${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}
