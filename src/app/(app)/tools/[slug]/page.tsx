import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolDetail } from "@/components/tools/tool-detail";
import { findToolBySlug } from "@/components/tools/tool-catalog";
import { requireUser } from "@/lib/auth/current-user";

interface ToolDetailPageProps {
  params: Promise<{ slug: string }>;
}

/** 标题跟工具名走；未知 slug 由页面里的 notFound() 负责 404。 */
export async function generateMetadata({
  params,
}: ToolDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tool = findToolBySlug(slug);
  return { title: tool ? `${tool.name} - 工具` : "工具" };
}

/**
 * 工具详情页地基：按 slug 精确查目录，查不到就 404。
 *
 * 真实工具（便签 / 待办 / 工作日历 / 保险库）都有**自己的静态路由**，
 * Next 的路由匹配里静态段优先于动态段，所以工具卡指向 `/tools/vault` 时
 * 直接命中真页面，根本走不到这里。这里只负责「还没有实现的工具」的占位。
 */
export default async function ToolDetailPage({
  params,
}: ToolDetailPageProps) {
  await requireUser();

  const { slug } = await params;
  const tool = findToolBySlug(slug);
  if (!tool) notFound();

  return <ToolDetail tool={tool} />;
}
