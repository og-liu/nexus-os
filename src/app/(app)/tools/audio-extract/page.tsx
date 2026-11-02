import type { Metadata } from "next";
import { ExtractView } from "@/components/tools/audio-extract/extract-view";
import { requireUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "音频提取",
};

/**
 * 音频提取工具页（《功能/音频提取》§2.1）。受保护页面：未登录访问跳登录页。
 *
 * 页面只做接线：`requireUser()` + 渲染客户端视图。
 * 真正的处理在 `/api/tools/audio-extract` 这条 Route Handler 里（服务器端 ffmpeg），
 * 那里**会再验一次登录**——页面这层拦不住直接 POST 接口的人。
 */
export default async function AudioExtractPage() {
  await requireUser();

  return <ExtractView />;
}
