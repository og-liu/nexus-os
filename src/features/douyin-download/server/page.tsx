import type { Metadata } from "next";
import { DouyinDownloadView } from "../client/download-view";
import { requireUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "抖音下载",
};

/**
 * 抖音下载工具页（features/douyin-download/README.md §2.1）。受保护页面：未登录访问跳登录页。
 *
 * 页面只做接线：`requireUser()` + 渲染客户端视图。
 * 解析与下载在 `/api/tools/douyin-download` 与 `/api/tools/douyin-download/file`
 * 这两条 Route Handler 里，那里**会再验一次登录**——页面这层拦不住直接 POST 接口的人。
 */
export default async function DouyinDownloadPage() {
  await requireUser();

  return <DouyinDownloadView />;
}
