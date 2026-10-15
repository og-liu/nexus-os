import type { Metadata } from "next";
import { logoutAction } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "首页",
};

/**
 * 受保护首页（《界面设计规范》§7.17）。
 *
 * 未登录访问这里直接跳登录页——**这个检查就是真正的门**：它贴着要保护的数据。
 * 不写在布局里（Next 16 文档明确：布局在客户端导航时不重新渲染，也拦不住子页面的渲染），
 * 也不靠 `proxy.ts`（跑在 Edge，读不了本地 SQLite，官方只当它做乐观检查）。
 *
 * 页面内容目前是应用第一屏的占位（Hello world）：**登录成功后应当直接看到应用本身**，
 * 而不是一张「你已登录」的说明卡。真正的首页设计出来之前，这一屏先占着位置。
 *
 * 右上角的「退出登录」是临时的——它最终属于应用外壳的页头（§5.1），外壳落地后从本页删掉。
 */
export default async function Home() {
  await requireUser();

  return (
    <main className="relative flex min-h-screen items-center justify-center">
      <form action={logoutAction} className="absolute right-4 top-4">
        <button
          type="submit"
          className="text-xs text-[#8A8A8A] underline-offset-2 hover:text-[#000000] hover:underline"
        >
          退出登录
        </button>
      </form>

      <h1 className="text-2xl font-medium tracking-tight">Hello world</h1>
    </main>
  );
}
