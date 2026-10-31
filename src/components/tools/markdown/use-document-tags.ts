"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import {
  createTagAction,
  deleteTagAction,
  deleteTagsAction,
  renameTagAction,
  setDocumentTagsAction,
} from "@/lib/markdown/actions";
import type { MdDocumentSummary } from "@/lib/markdown/documents";
import { tagKey, type MdTag } from "@/lib/markdown/tags";
import { UNTAGGED_KEY } from "./tag-filter-select";

/**
 * 标签相关的状态与动作（《功能/Markdown编辑器》§2.2 / §2.4），从页面主组件里拆出来。
 *
 * 拆的理由：这一摊有「全部标签 / 当前筛选 / 管理面板开关」三个状态和五个动作，
 * 全是围绕标签自己的，跟文档的保存、切换、批量删除没有交集；留在主组件里只会让那个文件
 * 又长又难改。
 *
 * 一条约定：**标签变了就只回传这一篇的标签 + 全部标签**，文档列表按 id 对齐——
 * 不重新拉整份列表（那会让正在编辑的行重挂，丢焦点与滚动位置）。
 */

interface UseDocumentTagsArgs {
  /** 判断某篇的标签 / 「无标签」有多少篇要用。 */
  documents: MdDocumentSummary[];
  setDocuments: React.Dispatch<React.SetStateAction<MdDocumentSummary[]>>;
  /** 当前打开的文档（打标签的目标）；`null` = 没打开。 */
  activeId: number | null;
  initialTags: MdTag[];
  onError: (message: string) => void;
  onCreated: (name: string) => void;
  onDeleted: (name: string) => void;
}

export function useDocumentTags({
  documents,
  setDocuments,
  activeId,
  initialTags,
  onError,
  onCreated,
  onDeleted,
}: UseDocumentTagsArgs) {
  const [allTags, setAllTags] = useState<MdTag[]>(initialTags);
  /** 左栏筛选：`null` = 全部；`UNTAGGED_KEY` = 无标签；否则是标签的归一化 key。 */
  const [filter, setFilter] = useState<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  /** 当前打开那篇的标签。 */
  const activeTags = useMemo(
    () => documents.find((row) => row.id === activeId)?.tags ?? [],
    [documents, activeId],
  );

  /** 「无标签」有多少篇（筛选下拉里显示）。 */
  const untaggedCount = useMemo(
    () => documents.filter((row) => row.tags.length === 0).length,
    [documents],
  );

  /** 标签改名 / 删除之后，把本地文档上的标签按最新名字对齐（删掉的直接摘掉）。 */
  const reconcile = useCallback(
    (nextTags: MdTag[]) => {
      setAllTags(nextTags);
      const byId = new Map(nextTags.map((tag) => [tag.id, tag.name]));
      setDocuments((rows) =>
        rows.map((row) => {
          const tags = row.tags
            .filter((tag) => byId.has(tag.id))
            .map((tag) => ({ id: tag.id, name: byId.get(tag.id) ?? tag.name }));
          const same =
            tags.length === row.tags.length &&
            tags.every((tag, index) => tag.name === row.tags[index].name);
          return same ? row : { ...row, tags };
        }),
      );
    },
    [setDocuments],
  );

  /** 标签条提交：整批名字直接落库（空数组 = 清空标签，文档不动）。 */
  const apply = useCallback(
    (names: string[]) => {
      if (activeId === null) return;
      startTransition(async () => {
        const result = await setDocumentTagsAction(activeId, names);
        if (!result.ok) {
          onError(result.error);
          return;
        }
        setDocuments((rows) =>
          rows.map((row) => (row.id === activeId ? { ...row, tags: result.tags } : row)),
        );
        setAllTags(result.allTags);
      });
    },
    [activeId, onError, setDocuments],
  );

  const rename = useCallback(
    (tag: MdTag, name: string) => {
      startTransition(async () => {
        const result = await renameTagAction(tag.id, name);
        if (!result.ok) {
          onError(result.error);
          return;
        }
        reconcile(result.allTags);
        // 改完名字，按旧名字筛的话会筛不到东西——退回「全部」
        setFilter(null);
      });
    },
    [onError, reconcile],
  );

  const remove = useCallback(
    (tag: MdTag) => {
      startTransition(async () => {
        const result = await deleteTagAction(tag.id);
        if (!result.ok) {
          onError(result.error);
          return;
        }
        reconcile(result.allTags);
        setFilter((current) => (current === tagKey(tag.name) ? null : current));
        onDeleted(tag.name);
      });
    },
    [onDeleted, onError, reconcile],
  );

  const create = useCallback(
    (name: string) => {
      startTransition(async () => {
        const result = await createTagAction(name);
        if (!result.ok) {
          onError(result.error);
          return;
        }
        setAllTags(result.allTags);
        onCreated(name.trim());
      });
    },
    [onCreated, onError],
  );

  const removeMany = useCallback(
    (ids: number[]) => {
      startTransition(async () => {
        const result = await deleteTagsAction(ids);
        if (!result.ok) {
          onError(result.error);
          return;
        }
        reconcile(result.allTags);
        // 被删的标签里正好包含当前筛选项时，退回「全部」
        const deletedKeys = new Set(
          allTags.filter((tag) => ids.includes(tag.id)).map((tag) => tagKey(tag.name)),
        );
        setFilter((current) => (current !== null && deletedKeys.has(current) ? null : current));
        onDeleted(`${result.count} 个标签`);
      });
    },
    [allTags, onDeleted, onError, reconcile],
  );

  return {
    allTags,
    filter,
    setFilter,
    managerOpen,
    setManagerOpen,
    activeTags,
    untaggedCount,
    pending,
    apply,
    rename,
    remove,
    create,
    removeMany,
  };
}

export { UNTAGGED_KEY };
