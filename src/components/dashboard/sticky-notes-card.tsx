import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatNoteTime } from "@/lib/sticky-notes/format";
import type { StickyNote } from "@/lib/sticky-notes/notes";

/**
 * 首页右栏的便签常驻卡（《功能/便签》§2.2、《界面设计规范》§7.17）。
 *
 * 数据由首页（Server Component）查好传进来——与工具页共用 `listNotes`，只是 `limit: 3`。
 * 「管理 →」直指便签本身（`/tools/sticky-notes`），不是工具列表：管理的是便签，
 * 点进列表还得再找一次，那一跳是错的。
 */
export function StickyNotesCard({ notes }: { notes: StickyNote[] }) {
  return (
    <section className="rounded-[2px] bg-white p-5">
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
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {notes.map((note) => (
            <Link
              key={note.id}
              href="/tools/sticky-notes"
              className="block cursor-pointer rounded-[2px] bg-[#F5F5F5] p-3 transition-colors hover:bg-[#ECECEC]"
            >
              <p className="line-clamp-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[#000000]">
                {note.body}
              </p>
              <p className="mt-1.5 text-[10px] text-[#999999]">
                {formatNoteTime(note.updatedAt)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
