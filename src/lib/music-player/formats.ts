/**
 * 音乐文件的格式规则（《功能/音乐播放器》§三、§四第 2 条）。
 *
 * 两件事在这里定死：
 * 1. **哪些文件能进**——入口只看扩展名，因为上传时只有文件名可看；
 * 2. **落盘叫什么、以什么 MIME 吐回去**——由 ffmpeg 探出的**真实编码**决定，不看扩展名。
 *
 * 为什么要分开：`.mp3` 改名成 `.m4a` 上传时扩展名撒谎、编码不会。入口用扩展名是为了
 * 挡掉一眼就不对的文件（图片、文档），落盘用它是因为浏览器的播放能力跟的是编码——
 * 一个「扩展名叫 mp3、内容其实是 AAC」的文件，存成 `.m4a` 反而能正常播。
 */

/**
 * 允许上传的扩展名（小写，不含点）。
 *
 * 只收浏览器原生能解码的容器：mp3 / m4a / aac / wav / flac / ogg 系。
 * **不收 .wma / .ape / .dsf / .webm**：前者浏览器解不了，后者少见且容器与编码
 * 不一定对得上（Opus 在 webm 与 ogg 里是两种写法）。
 */
export const AUDIO_EXTENSIONS = [
  "mp3",
  "m4a",
  "aac",
  "wav",
  "flac",
  "ogg",
  "oga",
  "opus",
] as const;

/** 单文件上限：200 MB。一张无损专辑单曲 30–60 MB，留足余量。 */
export const MAX_TRACK_BYTES = 200 * 1024 * 1024;

/** 每人曲库总配额：5 GB。线上磁盘 40 GB（已用 5.3 GB），按真实多用户留的余量。 */
export const USER_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;

/** 从文件名里取小写扩展名；没有扩展名返回空串。 */
export function extensionOf(fileName: string): string {
  const base = baseNameOf(fileName);
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

/**
 * 取文件名本身，丢掉任何目录部分。
 *
 * 上传时浏览器给的是裸文件名，但这个值来自请求头，可以是任何东西：
 * `../../etc/passwd`、`C:\Users\x\a.mp3`、`a/b.mp3`。所有使用点都先过这里。
 */
export function baseNameOf(fileName: string): string {
  const normalized = fileName.replace(/\\/g, "/");
  const last = normalized.slice(normalized.lastIndexOf("/") + 1);
  return last.trim();
}

/** 这个扩展名能不能进。 */
export function isAcceptedExtension(ext: string): boolean {
  return (AUDIO_EXTENSIONS as readonly string[]).includes(ext);
}

/** 一种编码落盘时的容器与 MIME。 */
export interface Container {
  ext: string;
  mime: string;
}

/**
 * ffmpeg 探出的编码 → 落盘容器与 MIME。
 *
 * 表里没有的编码一律视为「浏览器放不了」，上传时拒掉。宁可拒一个能放的不常见的编码，
 * 也不要收进来一个列表里点开没声音的文件——后者看起来像功能坏了。
 *
 * PCM 系一律进 `.wav`：多种位深的 wav 在某些环境会被拒，但它们是音频提取与
 * 别的工具最常产出的格式，收进来比拒掉有用。
 */
const CONTAINERS: Record<string, Container> = {
  mp3: { ext: "mp3", mime: "audio/mpeg" },
  aac: { ext: "m4a", mime: "audio/mp4" },
  alac: { ext: "m4a", mime: "audio/mp4" },
  flac: { ext: "flac", mime: "audio/flac" },
  vorbis: { ext: "ogg", mime: "audio/ogg" },
  opus: { ext: "ogg", mime: "audio/ogg" },
  pcm_s16le: { ext: "wav", mime: "audio/wav" },
  pcm_s24le: { ext: "wav", mime: "audio/wav" },
  pcm_s32le: { ext: "wav", mime: "audio/wav" },
  pcm_u8: { ext: "wav", mime: "audio/wav" },
  pcm_f32le: { ext: "wav", mime: "audio/wav" },
};

/** 编码对应的容器；浏览器放不了的编码返回 null。 */
export function containerFor(codec: string): Container | null {
  return CONTAINERS[codec.toLowerCase()] ?? null;
}

/** 列表上显示的格式标签：`mp3` → `MP3`，`pcm_s16le` → `WAV`。 */
export function formatLabel(codec: string): string {
  const container = containerFor(codec);
  if (!container) return codec.toUpperCase();
  return container.ext.toUpperCase();
}

/**
 * 展示用歌名：去掉目录、去掉扩展名、压掉多余空白、限长。
 *
 * 空名兜底成「未命名」——文件名是 `.mp3` 这种只有扩展名的情况真实存在。
 */
export function cleanTitle(fileName: string, maxLength = 120): string {
  const base = baseNameOf(fileName);
  const dot = base.lastIndexOf(".");
  // dot === 0 是「.mp3」这种只有扩展名的名字，去掉吧，剩下空串
  const withoutExt = dot > 0 ? base.slice(0, dot) : dot === 0 ? "" : base;
  const collapsed = withoutExt.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return "未命名";
  return collapsed.length > maxLength ? collapsed.slice(0, maxLength).trimEnd() : collapsed;
}

/**
 * 清洗 ffmpeg 读出来的标签文本。
 *
 * 标签编码不对时（GBK 标签按 UTF-8 解）会出现成串的替换字符 `U+FFFD`，
 * 与其在界面上显示一串「����」，不如当它没有、回退到文件名。
 */
export function cleanTag(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0 || trimmed.includes("\uFFFD")) return null;
  return trimmed.length > 120 ? trimmed.slice(0, 120).trimEnd() : trimmed;
}
