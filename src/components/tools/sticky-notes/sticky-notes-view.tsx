"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { ToolBar } from "@/components/tools/tool-bar";
import { ToolHeader } from "@/components/tools/tool-header";
import { ToolMobileBar } from "@/components/tools/tool-mobile-bar";
import { findToolBySlug } from "@/components/tools/tool-catalog";
import { useToast } from "@/components/ui/toast";
import { formatDeletedMessage } from "@/lib/toast/format";
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
  /**
   * 深链要打开的便签 id（`?note=123`，来自首页便签卡的某一条）。
   * 没有该参数、或 id 找不到（已被删掉）时为 `null`。
   */
  initialNoteId?: number | null;
}

export function StickyNotesView({
  initialNotes,
  initialNoteId = null,
}: StickyNotesViewProps) {
  const router = useRouter();
  const toast = useToast();
  const [notes, setNotes] = useState<StickyNote[]>(initialNotes);
  const [creating, setCreating] = useState(false);
  /**
   * 深链（首页点了某一条便签）时**首帧就打开编辑弹窗**，不靠 useEffect 再补一次——
   * 否则会先闪一下列表、再弹出弹窗。找不到对应便签就当没这个参数（可能已被删掉）。
   */
  const [editingNote, setEditingNote] = useState<StickyNote | null>(() =>
    initialNoteId === null
      ? null
      : (initialNotes.find((note) => note.id === initialNoteId) ?? null),
  );
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 打开之后把 `?note=` 从地址栏抹掉：否则关掉弹窗再刷新，它又弹回来
  useEffect(() => {
    if (initialNoteId === null) return;
    router.replace("/tools/sticky-notes", { scroll: false });
  }, [initialNoteId, router]);

  const tool = findToolBySlug("sticky-notes");
  const dialogOpen = creating || editingNote !== null;

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

  /** 弹窗里的「置顶保存」：保存（新建或编辑）+ 置顶一次完成。 */
  function saveWithPin(body: string) {
    if (creating) {
      run(() => createNoteAction(body, true), () => setCreating(false));
      return;
    }
    if (editingNote) {
      run(
        () => updateNoteAction(editingNote.id, body, true),
        () => setEditingNote(null),
      );
    }
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
      <ToolMobileBar
        newLabel="新建便签"
        onNew={openCreate}
        disabled={pending}
      />

      <div className="px-4 py-4 md:px-6 md:py-6">
        {tool ? (
          <ToolHeader
            tool={tool}
            actions={
              /* ≥ lg：文字按钮（< lg 的入口在顶部导航行里，避免同屏出现两个「新建」） */
              <button
                type="button"
                onClick={openCreate}
                disabled={pending}
                className="flex h-8 cursor-pointer items-center gap-1.5 rounded-[2px] bg-[#000000] px-3 text-xs font-medium text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed"
              >
                <Plus className="h-3.5 w-3.5" />
                新建便签
              </button>
            }
          />
        ) : null}

        {tool ? (
          <ToolBar name={tool.name} icon={tool.icon} onNew={openCreate} />
        ) : null}

        {showTopError ? (
          <p role="alert" className="mt-3 text-xs text-[#B91C1C]">
            {error}
          </p>
        ) : null}

        <div className="mt-4 xl:mt-6">
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
            <section className="space-y-3">
              <div className="flex min-h-7 items-center gap-2">
                <span className="h-3.5 w-[3px] bg-[#000000]" />
                <h2 className="text-sm font-semibold text-[#000000]">
                  全部便签
                </h2>
                <span className="text-xs tabular-nums text-[#999999]">
                  {notes.length}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 [@media(min-width:1400px)]:grid-cols-7">
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
                        () => {
                          setConfirmingDeleteId(null);
                          toast.success(formatDeletedMessage("便签", note.body));
                        },
                      )
                    }
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <NoteDialog
        open={dialogOpen}
        mode={creating ? "create" : "edit"}
        initialValue={editingNote?.body ?? ""}
        createdAt={editingNote?.createdAt}
        busy={pending}
        error={error}
        onSavePinned={saveWithPin}
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
        onDelete={
          // 编辑态才有删除：直接删掉当前这条并关掉弹窗（没有二次确认，2026-10-22 联调要求）
          editingNote
            ? () =>
                run(
                  () => deleteNoteAction(editingNote.id),
                  () => {
                    setEditingNote(null);
                    toast.success(
                      formatDeletedMessage("便签", editingNote.body),
                    );
                  },
                )
            : undefined
        }
        onCancel={closeDialog}
      />
    </>
  );
}
