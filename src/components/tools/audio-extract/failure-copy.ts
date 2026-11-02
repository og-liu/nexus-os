"use client";

import type { ExtractErrorCode } from "@/lib/audio-extract/constants";

/**
 * 失败文案（《功能/音频提取》§2.3）：一句主句 + 一句该干什么。
 *
 * 单文件卡与批量列表共用这一份——同一个失败在两处说两种话，用户会以为是两个问题。
 */

export interface Failure {
  code: ExtractErrorCode;
  title: string;
  detail: string;
}

export const FAILURE_COPY: Record<ExtractErrorCode, { title: string; detail: string }> = {
  "too-large": { title: "文件超过 500 MB", detail: "先裁剪一下，或者换一个短一点的视频。" },
  "not-video": { title: "只支持视频文件", detail: "MP4 / MOV / MKV / AVI / WEBM / TS 等。" },
  "no-audio": { title: "这个视频没有声音", detail: "文件里没有音轨，换一个试试。" },
  unreadable: {
    title: "这个视频打不开",
    detail: "文件可能损坏，或者编码 ffmpeg 认不出来。",
  },
  unauthorized: { title: "登录状态过期了", detail: "刷新页面重新登录一次。" },
  "extract-failed": { title: "提取失败了", detail: "换一个视频试试；一直失败就说一声。" },
};

export function failureOf(code: ExtractErrorCode): Failure {
  return { code, ...FAILURE_COPY[code] };
}
