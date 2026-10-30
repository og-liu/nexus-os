import type { Metadata } from "next";
import { CompressView } from "@/components/tools/image-compress/compress-view";
import { requireUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "图片压缩",
};

/**
 * 图片压缩工具页（《功能/图片压缩》§2.1）。受保护页面：未登录访问这里跳登录页。
 *
 * 页面只做接线：`requireUser()` + 渲染客户端视图。
 * **没有后端**：图片不进数据库、不上传、不落服务器文件，压缩全部在浏览器里完成
 * （文档 §三）。所以这里既不取数据，也没有 Server Action。
 */
export default async function ImageCompressPage() {
  await requireUser();

  return <CompressView />;
}
