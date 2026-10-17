"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { findToolBySlug } from "@/components/tools/tool-catalog";
import {
  createNoteAction,
  deleteNoteAction,
  togglePinAction,
  updateNoteAction,
  type StickyNotesActionResult,
} from "@/lib/sticky-notes/actions";
import type { StickyNote } from "@/lib/sticky-notes/notes";
import { NewNoteCard } from "./new-note-card";
import { NoteCard } from "./note-card";
import { ToolInfoBar } from "./tool-info-bar";

/**
 * 便签工具页（《功能/便签》§2.1）。
 *
 * 三个受控状态住在这里：哪张卡在编辑（`editingId`）、哪张卡在确认删除
 * （`confirmingDeleteId`）、是否插着一张新建空卡（`creating`）——同一时间只允许一个。
 *
 * 写操作统一走 `run()`：调用 Server Action、用返回的最新列表覆盖本地状态。
 * 排序与查询只有服务端一份，客户端不重复实现。
 */

interface StickyNotesViewProps {
  initialNotes: StickyNote[];
}

export function StickyNotesView({ initialNotes }: StickyNotesViewProps) {
  const [notes, setNotes] = useState<StickyNote[]>(initialNotes);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const tool = findToolBySlug("sticky-notes");

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
    setEditingId(null);
    setConfirmingDeleteId(null);
    setError(null);
    setCreating(true);
  }

  function closeCreate() {
    setCreating(false);
    setError(null);
  }

  // 顶部错误条只承载「不在编辑器里」的失败（置顶 / 删除）
  const showTopError = error !== null && editingId === null && !creating;

  return (
    <>
      <PageHeader title="工具" description="便签" backHref="/tools">
        {/* ≥ md：文字按钮；< md：40×40 图标按钮（§7.3 主操作） */}
        <button
          type="button"
          onClick={openCreate}
          disabled={pending || creating}
          className="hidden h-8 cursor-pointer items-center gap-1.5 rounded-[2px] bg-[#000000] px-3 text-xs font-medium text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:opacity-50 md:flex"
        >
          <Plus className="h-3.5 w-3.5" />
          新建便签
        </button>
        <button
          type="button"
          onClick={openCreate}
          disabled={pending || creating}
          aria-label="新建便签"
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-[2px] text-[#1F1F1F] transition-colors hover:bg-[#ECECEC] disabled:cursor-not-allowed disabled:opacity-50 md:hidden"
        >
          <Plus className="h-5 w-5" />
        </button>
      </PageHeader>

      <div className="space-y-4 px-4 py-4 md:px-6 md:py-6 xl:space-y-6">
        {tool ? <ToolInfoBar tool={tool} /> : null}

        {showTopError ? (
          <p role="alert" className="text-xs text-[#B91C1C]">
            {error}
          </p>
        ) : null}

        {notes.length === 0 && !creating ? (
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
            {creating ? (
              <NewNoteCard
                busy={pending}
                error={error}
                onSave={(body) =>
                  run(
                    () => createNoteAction(body),
                    () => setCreating(false),
                  )
                }
                onCancel={closeCreate}
              />
            ) : null}

            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                editing={editingId === note.id}
                confirmingDelete={confirmingDeleteId === note.id}
                busy={pending}
                error={editingId === note.id ? error : null}
                onStartEdit={() => {
                  setCreating(false);
                  setConfirmingDeleteId(null);
                  setError(null);
                  setEditingId(note.id);
                }}
                onCancelEdit={() => {
                  setEditingId(null);
                  setError(null);
                }}
                onSave={(body) =>
                  run(
                    () => updateNoteAction(note.id, body),
                    () => setEditingId(null),
                  )
                }
                onTogglePin={() =>
                  run(() => togglePinAction(note.id, !note.pinned))
                }
                onRequestDelete={() => {
                  setEditingId(null);
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
    </>
  );
}
