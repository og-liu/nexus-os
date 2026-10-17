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
 */
export default async function StickyNotesPage() {
  const user = await requireUser();
  const notes = listNotes(getDb(), user.id);

  return <StickyNotesView initialNotes={notes} />;
}
