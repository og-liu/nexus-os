/**
 * 悬浮球里的那个「N」标记（《功能/音乐播放器》§2.4）。
 *
 * **整段 SVG 原样注入**，不经过 JSX 属性转写：来源是 Next.js 开发指示器
 * `button#next-logo` 里那颗 svg 的 `outerHTML`（2026-11-03 从 shadow DOM 抄的）。
 * 之前几版是我把它「翻译」成 JSX 再手写属性，每翻译一次就漏一点东西
 * （先是漏了 `mask` 把左上角的尖放出来了，再是把 `stroke-dashoffset` 写成了 0
 * 而没注意原版靠 CSS 类的覆盖），所以这里改成字符串直出。
 *
 * 只改了两处，且都只是**换名字**、不动数值：
 * - 三个 id 换成 `orb-` 前缀（同一页出现第二份同样的渐变 id 会互相抢，标记会消失）；
 * - `class="paused"` 保留，配套样式 `.orb-mark .paused { stroke-dashoffset: 0 }`
 *   写在 `globals.css` 里——原版就是这样用类把行内 `stroke-dashoffset="29.6"`
 *   覆盖成 0 的，我们照做，不用自己改行内值。
 *
 * 那个 `5×1.5` 的 `mask` **不能删**：它压在 path 的转折点 `(2.34, 1)` 上，
 * 把斜线与左竖线衔接处那个直角尖切掉。
 *
 * 播放状态：整段在 opacity 0.7 ↔ 1 之间缓慢呼吸，2.8 秒一轮。不用旋转——
 * 转一个字母认不出是什么字。
 */

const MARK_SVG = `<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><g transform="translate(8.5, 13)"><path class="paused" d="M13.3 15.2 L2.34 1 V12.6" fill="none" stroke="url(#orb-paint0)" stroke-width="1.86" stroke-dasharray="29.6" stroke-dashoffset="29.6" mask="url(#orb-mask0)"></path><path class="paused" d="M11.825 1.5 V13.1" stroke-width="1.86" stroke="url(#orb-paint1)" stroke-dasharray="11.6" stroke-dashoffset="11.6"></path></g><defs><linearGradient id="orb-paint0" x1="9.95555" y1="11.1226" x2="15.4778" y2="17.9671" gradientUnits="userSpaceOnUse"><stop stop-color="white"></stop><stop offset="0.604072" stop-color="white" stop-opacity="0"></stop><stop offset="1" stop-color="white" stop-opacity="0"></stop></linearGradient><linearGradient id="orb-paint1" x1="11.8222" y1="1.40039" x2="11.791" y2="9.62542" gradientUnits="userSpaceOnUse"><stop stop-color="white"></stop><stop offset="1" stop-color="white"></stop></linearGradient><mask id="orb-mask0"><rect width="100%" height="100%" fill="white"></rect><rect width="5" height="1.5" fill="black"></rect></mask></defs></svg>`;

export function OrbMark({ playing = false }: { playing?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`orb-mark flex-shrink-0 ${
        playing ? "animate-[orb-breathe_2.8s_ease-in-out_infinite]" : ""
      }`}
      dangerouslySetInnerHTML={{ __html: MARK_SVG }}
    />
  );
}
