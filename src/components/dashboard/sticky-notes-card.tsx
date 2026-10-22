import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatNoteTime } from "@/lib/sticky-notes/format";
import type { StickyNote } from "@/lib/sticky-notes/notes";

/**
 * 首页主区（≥ xl 时占左 2 列）的便签常驻卡（《功能/便签》§2.2、《界面设计规范》§7.17）。
 *
 * 数据由首页（Server Component）查好传进来——与工具页共用 `listNotes`，只是 `limit: 3`。
 * 「管理 →」直指便签本身（`/tools/sticky-notes`），不是工具列表：管理的是便签，
 * 点进列表还得再找一次，那一跳是错的。
 *
 * 卡内分栏看**卡片自己的宽度**（容器查询），不看视口：
 * 容器 ≥ 448px（`@md`）排 2 列，否则单列。首页这张卡现在是固定宽（约 430px）→ 单列三行，
 * 和旧版参考图一致；将来卡片尺寸变宽（比如拼回主区 2/3）它会自动回到 2 列。
 * 用视口断点（原来的 `md:grid-cols-2`）会犯一个错：窗口宽、卡片窄时照样排 2 列，
 * 每条便签被挤到 ~200px、正文折两行——2026-10-22 联调就是在这里发现的。
 */
export function StickyNotesCard({ notes }: { notes: StickyNote[] }) {
  return (
    <section className="@container rounded-[2px] bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[#000000]">
          <span className="h-3.5 w-[3px] bg-[#000000]" />
          便签
        </h2>
        <Link
          href="/tools/sticky-notes"
          className="flex cursor-pointer items-center gap-0.5 text-xs text-[#8A8A8A] transition-colors hover:text-[#000000]"
        >
          管理
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {notes.length === 0 ? (
        <div className="mt-3 rounded-[2px] bg-[#F5F5F5] p-3">
          <p className="text-[13px] text-[#999999]">还没有便签</p>
          <Link
            href="/tools/sticky-notes"
            className="mt-1 inline-block text-[13px] text-[#000000] underline underline-offset-2"
          >
            写一条 →
          </Link>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-2 @md:grid-cols-2">
          {notes.map((note) => (
            <Link
              key={note.id}
              // 点到哪一条就打开哪一条：带 id 深链过去，工具页会直接弹出这条的编辑弹窗
              // （只跳列表的话，便签一多就找不到刚点的是哪条）
              href={`/tools/sticky-notes?note=${note.id}`}
              className="block cursor-pointer rounded-[2px] bg-[#F5F5F5] px-3 py-2.5 transition-colors hover:bg-[#ECECEC]"
            >
              {/* 一条一行：正文单行截断，时间（精确到分钟）挪到正文右侧——时间在下面会把每条撑成两行 */}
              <div className="flex items-baseline gap-3">
                <p className="min-w-0 flex-1 truncate text-[13px] text-[#000000]">
                  {note.body}
                </p>
                <span className="shrink-0 text-[10px] tabular-nums text-[#999999]">
                  {formatNoteTime(note.updatedAt)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
