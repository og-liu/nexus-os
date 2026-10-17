"use client";

import { NoteEditor } from "./note-editor";

/**
 * 新建便签的空卡（插入网格第一格，保存才落库、取消则整张消失）。
 *
 * 它是一张「还没有数据的卡片」：没有置顶 / 删除操作，只有一个空编辑器。
 */
interface NewNoteCardProps {
  busy: boolean;
  error: string | null;
  onSave: (body: string) => void;
  onCancel: () => void;
}

export function NewNoteCard({
  busy,
  error,
  onSave,
  onCancel,
}: NewNoteCardProps) {
  return (
    <article className="rounded-[2px] bg-white p-4">
      <NoteEditor
        busy={busy}
        error={error}
        onSave={onSave}
        onCancel={onCancel}
      />
    </article>
  );
}
