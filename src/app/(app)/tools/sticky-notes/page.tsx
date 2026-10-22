import type { Metadata } from "next";
import { StickyNotesView } from "@/components/tools/sticky-notes/sticky-notes-view";
import { getDb } from "@/lib/auth/db";
import { requireUser } from "@/lib/auth/current-user";
import { listNotes } from "@/lib/sticky-notes/notes";

export const metadata: Metadata = {
  title: "便签",
};

/**
 * 便签工具页（《功能/便签》§2.1）。受保护页面：未登录访问这里跳登录页。
 *
 * 页面只做接线：登录检查 + 取出当前用户全部便签，交互全部交给客户端视图。
 * `?note=<id>` 是首页便签卡的深链（点了哪条就打开哪条的编辑弹窗），在这里解析成数字往下传。
 */
interface StickyNotesPageProps {
  /** `?note=<id>`：从首页便签卡点某一条进来时，落地就打开那条的编辑弹窗。 */
  searchParams: Promise<{ note?: string | string[] }>;
}

export default async function StickyNotesPage({
  searchParams,
}: StickyNotesPageProps) {
  const user = await requireUser();
  const notes = listNotes(getDb(), user.id);
  const params = await searchParams;
  const raw = Array.isArray(params.note) ? params.note[0] : params.note;
  // 只认纯数字；非法值当没传，不做报错（用户看到的还是正常的便签列表）
  const initialNoteId = raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : null;

  return <StickyNotesView initialNotes={notes} initialNoteId={initialNoteId} />;
}
