import type { Metadata } from "next";
import { VaultView } from "@/components/tools/vault/vault-view";
import { getDb } from "@/lib/auth/db";
import { requireUser } from "@/lib/auth/current-user";
import { listGroups, listItems } from "@/lib/vault/vault";

export const metadata: Metadata = {
  title: "保险库",
};

/**
 * 保险库工具页（《功能/保险库》§2.1）。受保护页面：未登录访问这里跳登录页。
 *
 * 页面只做接线：登录检查 + 取出这个人的全部群组与条目；
 * 视图、选中、批量、弹窗全部交给客户端视图 `VaultView`。
 */
export default async function VaultPage() {
  const user = await requireUser();
  const db = getDb();

  return (
    <VaultView
      initialSnapshot={{
        groups: listGroups(db, user.id),
        items: listItems(db, user.id),
      }}
    />
  );
}
