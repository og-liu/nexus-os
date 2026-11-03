/**
 * 从一段分享文案里抠出抖音链接（《功能/抖音下载》§一、§七第 2 条）。
 *
 * 真实形态不是一条干净的 URL，而是这样一坨：
 *
 *   7.43 pda:/ 复制此链接，打开抖音搜索，直接观看视频！
 *   https://v.douyin.com/53daiZW3xXc/ 复制此链接
 *
 * 所以既不能把整段当 URL，也不能只切第一个空格——文案里带空格、表情和中文。
 * 用正则只认抖音自己的两种形态，别的站点一律认不出来（B 站链接会被判成「不是抖音链接」）。
 */

export interface DouyinShareLink {
  /** 能直接交给解析接口的链接 */
  url: string;
  /** 链接里如果已经带了作品 id 就直接拿出来；短链拿不到，要等上游重定向 */
  awemeId: string | null;
}

/** `douyin.com/video/<id>` 与 `iesdouyin.com/share/video/<id>` 两种长链，id 是 15 位以上纯数字。 */
const VIDEO_URL = /https?:\/\/(?:www\.)?(?:ies)?douyin\.com\/(?:share\/)?video\/(\d{15,})\/?/i;

/** `v.douyin.com/<短码>/`——短码是大小写字母、数字、下划线和连字符。 */
const SHORT_URL = /https?:\/\/v\.douyin\.com\/[A-Za-z0-9_-]+\/?/i;

/**
 * 从任意文本里找出第一个抖音链接；找不到返回 `null`。
 *
 * 先长长链再找短链：长链自带 id，能省掉一次上游重定向；两者都有时优先长链。
 */
export function parseShareText(text: string): DouyinShareLink | null {
  const raw = text.trim();
  if (!raw) return null;

  const video = raw.match(VIDEO_URL);
  if (video) return { url: video[0], awemeId: video[1] };

  const short = raw.match(SHORT_URL);
  if (short) return { url: short[0], awemeId: null };

  return null;
}
