import type { Metadata } from "next";
import { ToolsView } from "@/components/tools/tools-view";
import { requireUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "工具",
};

/**
 * 工具中心（《功能/工具中心》）。受保护页面：未登录访问这里跳登录页。
 *
 * 页面只做「接线」：登录检查 + 取用户名，其余全部交给客户端视图
 * （搜索与分类的状态住在那儿，页头与内容区要共用同一份状态）。
 */
export default async function ToolsPage() {
  const user = await requireUser();

  return <ToolsView username={user.username} />;
}
