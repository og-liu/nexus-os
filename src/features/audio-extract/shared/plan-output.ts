/**
 * 源音轨编码 → 输出容器与处理方式（features/audio-extract/README.md §一 那张表）。
 *
 * 这是整个工具的核心判断，所以它是一支纯函数：输入源编码、输出计划，
 * 不碰 ffmpeg、不碰文件系统，单元测试逐格钉住。
 *
 * **为什么按编码而不是按输入扩展名**：.mp4 里可以装 AAC，也可以装 Opus、AC3；
 * 扩展名只说明「盒子」，不说明「里面装的是什么」。容器必须和编码配对——
 * AAC 塞进 .mp3 会写不了头，Opus 塞进 .m4a 大多数播放器不认。
 */

export type OutputMode = "copy" | "transcode";

export interface OutputPlan {
  /** 输出扩展名，带点：`.m4a` */
  extension: string;
  /** 响应头用的 MIME */
  mime: string;
  /** copy = 流拷贝（一次解码都不做）；transcode = 转成 AAC 再装进 .m4a */
  mode: OutputMode;
  /** 界面标注：`无损提取` 或 `已转为 AAC` */
  label: string;
}

/** 能直接装进播放友好容器的无损编码：编码 → 容器。 */
const COPY_PLAN: Record<string, { extension: string; mime: string }> = {
  // AAC：mp4/m4a 是它的原生容器
  aac: { extension: ".m4a", mime: "audio/mp4" },
  // ALAC：苹果无损，同样住在 m4a 里
  alac: { extension: ".m4a", mime: "audio/mp4" },
  mp3: { extension: ".mp3", mime: "audio/mpeg" },
  flac: { extension: ".flac", mime: "audio/flac" },
};

const TRANSCODE_PLAN: OutputPlan = {
  extension: ".m4a",
  mime: "audio/mp4",
  mode: "transcode",
  label: "已转为 AAC",
};

/**
 * 按源音轨编码给出输出计划。
 *
 * 认不出来的编码（DTS、AMR、PCM…）一律走转码：原样输出一个多数设备打不开的
 * 容器，用户会以为文件坏了——「拿回去能听」比「一字节不改」更重要。
 */
export function planOutput(sourceCodec: string | null | undefined): OutputPlan {
  const codec = (sourceCodec ?? "").trim().toLowerCase();
  const copy = COPY_PLAN[codec];
  if (copy) {
    return { ...copy, mode: "copy", label: "无损提取" };
  }
  return TRANSCODE_PLAN;
}
