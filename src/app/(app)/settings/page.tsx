import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { SecretsCard } from "@/components/settings/secrets-card";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/auth/db";
import { resolveGroup } from "@/lib/secrets/providers";
import { listConfiguredProviders } from "@/lib/secrets/store";

export const metadata: Metadata = {
  title: "设置",
};

/**
 * 设置页（《功能/用户密钥》§2.1）。
 *
 * 本版只有卡「API 密钥」。页面是服务端组件：只查「这个用户配了哪些 Key」，
 * 明文与密文都不进渲染结果——客户端拿到的只有布尔值。
 *
 * 分组状态放在 URL（`?tab=model` / `?tab=tool`）而不是组件 state：
 * 刷新不丢、后退能用、链接可直接分享；也省掉一个客户端边界。
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const params = await searchParams;
  const activeGroup = resolveGroup(params.tab);

  const user = await requireUser();
  const configured = listConfiguredProviders(getDb(), user.id);

  return (
    <>
      <PageHeader title="设置" description="配置 AI 模型、工具目录、系统偏好等" />
      <div className="px-4 py-4 md:px-6 md:py-6">
        <div className="space-y-4 xl:space-y-6">
          <SecretsCard configured={configured} activeGroup={activeGroup} />
        </div>
      </div>
    </>
  );
}
