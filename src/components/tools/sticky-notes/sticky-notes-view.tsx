"use client";

import { useState, useTransition } from "react";
import { Menu, Plus } from "lucide-react";
import { useAppShell } from "@/components/layout/app-shell";
import { ToolHeader } from "@/components/tools/tool-header";
import { findToolBySlug } from "@/components/tools/tool-catalog";
import {
  createNoteAction,
  deleteNoteAction,
  togglePinAction,
  updateNoteAction,
  type StickyNotesActionResult,
} from "@/lib/sticky-notes/actions";
import type { StickyNote } from "@/lib/sticky-notes/notes";
import { NoteCard } from "./note-card";
import { NoteDialog } from "./note-dialog";
import { StickyToolBar } from "./sticky-tool-bar";

/**
 * 便签工具页（《功能/便签》§2.1）。
 *
 * 列表是「统一缩略图」：卡片固定 80px、正文一行截断。
 * 新建与编辑走 `NoteDialog` 弹窗——不把编辑态塞进卡片里，
 * 避免长文本把某一张卡撑高、破坏整片网格的高度。
 *
 * 写操作统一走 `run()`：调用 Server Action、用返回的最新列表覆盖本地状态；
 * 排序与查询只有服务端一份，客户端不重复实现。
 */

interface StickyNotesViewProps {
  initialNotes: StickyNote[];
}

export function StickyNotesView({ initialNotes }: StickyNotesViewProps) {
  const [notes, setNotes] = useState<StickyNote[]>(initialNotes);
  const [creating, setCreating] = useState(false);
  const [editingNote, setEditingNote] = useState<StickyNote | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const tool = findToolBySlug("sticky-notes");
  const dialogOpen = creating || editingNote !== null;
  // 没有页头之后，手机端的汉堡按钮移到工具头部左上角——否则打不开侧栏导航
  const { openNav } = useAppShell();

  /** 统一跑一个写操作：成功用服务端返回的最新列表覆盖，失败留下错误文案。 */
  function run(
    action: () => Promise<StickyNotesActionResult>,
    onSuccess?: () => void,
  ) {
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (result.ok) {
        setNotes(result.notes);
        onSuccess?.();
      } else {
        setError(result.error);
      }
    });
  }

  function openCreate() {
    setEditingNote(null);
    setConfirmingDeleteId(null);
    setError(null);
    setCreating(true);
  }

  function openEdit(note: StickyNote) {
    setCreating(false);
    setConfirmingDeleteId(null);
    setError(null);
    setEditingNote(note);
  }

  function closeDialog() {
    setCreating(false);
    setEditingNote(null);
    setError(null);
  }

  // 顶部错误条只承载「弹窗之外」的失败（置顶 / 删除）
  const showTopError = error !== null && !dialogOpen;

  return (
    <>
      {/* 移动端顶部导航行：汉堡 + 新建（桌面由工具头部右侧承担，避免卡片内堆三层） */}
      <div className="flex items-center justify-between px-4 pt-3 md:hidden">
        <button
          type="button"
          onClick={openNav}
          aria-label="打开菜单"
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-[2px] text-[#1F1F1F] transition-colors hover:bg-[#E5E5E5]"
        >
          <Menu className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={openCreate}
          disabled={pending}
          className="flex h-8 cursor-pointer items-center gap-1.5 rounded-[2px] bg-[#000000] px-3 text-xs font-medium text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          新建便签
        </button>
      </div>

      <div className="space-y-4 px-4 py-4 md:px-6 md:py-6 xl:space-y-6">
        {tool ? (
          <ToolHeader
            tool={tool}
            actions={
              <>
                {/* ≥ md：文字按钮；< md：40×40 图标按钮（§7.3 主操作） */}
                <button
                  type="button"
                  onClick={openCreate}
                  disabled={pending}
                  className="hidden h-8 cursor-pointer items-center gap-1.5 rounded-[2px] bg-[#000000] px-3 text-xs font-medium text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:opacity-50 md:flex"
                >
                  <Plus className="h-3.5 w-3.5" />
                  新建便签
                </button>
                <button
                  type="button"
                  onClick={openCreate}
                  disabled={pending}
                  aria-label="新建便签"
                  className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-[2px] text-[#1F1F1F] transition-colors hover:bg-[#ECECEC] disabled:cursor-not-allowed disabled:opacity-50 md:hidden"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </>
            }
          />
        ) : null}

        {tool ? (
          <StickyToolBar
            name={tool.name}
            icon={tool.icon}
            onNew={openCreate}
          />
        ) : null}

        {showTopError ? (
          <p role="alert" className="text-xs text-[#B91C1C]">
            {error}
          </p>
        ) : null}

        {notes.length === 0 ? (
          <div className="rounded-[2px] border border-dashed border-[#D9D9D9] bg-white p-8 text-center md:p-12">
            <p className="text-sm text-[#A0A8B4]">还没有便签</p>
            <button
              type="button"
              onClick={openCreate}
              className="mt-3 h-8 cursor-pointer rounded-[2px] bg-[#000000] px-4 text-xs font-medium text-white transition-colors hover:bg-[#333333]"
            >
              新建便签
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                confirmingDelete={confirmingDeleteId === note.id}
                busy={pending}
                onEdit={() => openEdit(note)}
                onTogglePin={() =>
                  run(() => togglePinAction(note.id, !note.pinned))
                }
                onRequestDelete={() => {
                  setCreating(false);
                  setEditingNote(null);
                  setError(null);
                  setConfirmingDeleteId(note.id);
                }}
                onCancelDelete={() => setConfirmingDeleteId(null)}
                onConfirmDelete={() =>
                  run(
                    () => deleteNoteAction(note.id),
                    () => setConfirmingDeleteId(null),
                  )
                }
              />
            ))}
          </div>
        )}
      </div>

      <NoteDialog
        open={dialogOpen}
        mode={creating ? "create" : "edit"}
        initialValue={editingNote?.body ?? ""}
        busy={pending}
        error={error}
        onSave={(body) => {
          if (creating) {
            run(
              () => createNoteAction(body),
              () => setCreating(false),
            );
            return;
          }
          if (editingNote) {
            run(
              () => updateNoteAction(editingNote.id, body),
              () => setEditingNote(null),
            );
          }
        }}
        onCancel={closeDialog}
      />
    </>
  );
}
