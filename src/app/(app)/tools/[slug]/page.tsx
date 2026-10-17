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

/** 工具详情页地基：按 slug 精确查目录，查不到就 404。 */
export default async function ToolDetailPage({
  params,
}: ToolDetailPageProps) {
  await requireUser();

  const { slug } = await params;
  const tool = findToolBySlug(slug);
  if (!tool) notFound();

  return <ToolDetail tool={tool} />;
}
