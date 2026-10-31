"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import {
  createDocumentAction,
  deleteDocumentAction,
  deleteDocumentsAction,
  openDocumentAction,
} from "@/lib/markdown/actions";
import type { MdDocument, MdDocumentSummary } from "@/lib/markdown/documents";
import { tagKey, tagMatchesPrefix, type MdTag } from "@/lib/markdown/tags";
import { exportFileName } from "@/lib/markdown/export-name";
import { DocumentChips } from "./document-chips";
import { DocumentList } from "./document-list";
import { DocumentListOverlays } from "./document-list-overlays";
import { EditorPane } from "./editor-pane";
import { EditorTopBar } from "./editor-top-bar";
import { PreviewPane } from "./preview-pane";
import { TagBar } from "./tag-bar";
import { UNTAGGED_KEY } from "./tag-filter-select";
import { useDocumentTags } from "./use-document-tags";
import { TagManager } from "./tag-manager";
import { SplitDivider, clampRatio } from "./split-divider";
import type { ViewMode } from "./view-mode-switch";
import { useAutosave } from "./use-autosave";

/**
 * Markdown 编辑器工具页（《功能/Markdown编辑器》§二）。
 *
 * 这个组件是整页的**状态中枢**：当前打开哪一篇、标题与正文、搜索词、抽屉开没开、
 * 版式是「仅编辑器 / 编辑器 + 预览 / 仅预览」。各块都是纯展示 + 回调——各自留一份
 * 「当前文档」的话，两处迟早对不上（切走之后预览还显示上一篇）。
 *
 * 版式开关与标题住在**贯穿整页的标题行**里，不在编辑区内：选「仅预览」时编辑区整块
 * 让位，开关跟着它一起消失就没法切回来了（《功能/Markdown编辑器》§2.3）。
 *
 * 保存走 `useAutosave`：防抖 + 串行 + `flush()`。**切换文档 / 删除 / 卸载前先 flush**，
 * 否则最后不到 0.8 秒的输入直接丢（§四「切换文档」）。
 */

interface MarkdownEditorViewProps {
  /** 左栏列表（按 `updated_at DESC, id DESC` 排好，服务端算的）。 */
  initialDocuments: MdDocumentSummary[];
  /** 首屏默认打开的那一篇（列表第一条）；一篇都没有时是 `null`。 */
  initialDocument: MdDocument | null;
  /** 这个人用过的全部标签（左栏筛选 + 输入建议）。 */
  initialTags: MdTag[];
}

export function MarkdownEditorView({
  initialDocuments,
  initialDocument,
  initialTags,
}: MarkdownEditorViewProps) {
  const toast = useToast();
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  /** 新建之后要把光标送进标题框：「直接打字就是起名」。 */
  const focusTitleRef = useRef(false);

  const [documents, setDocuments] = useState<MdDocumentSummary[]>(initialDocuments);
  const [activeId, setActiveId] = useState<number | null>(initialDocument?.id ?? null);
  const [title, setTitle] = useState(initialDocument?.title ?? "");
  const [body, setBody] = useState(initialDocument?.body ?? "");
  const [query, setQuery] = useState("");
  /**
   * 左栏的两个开合状态。拆成两个而不是一个，是因为默认值相反：
   * - `columnOpen`：≥ xl 时布局里那一列，**默认展开**（这个工具平时的样子）；
   * - `overlayOpen`：< xl 的抽屉 / 手机全屏列表，**默认关闭**——浮层一进页面就盖住正文，
   *   那不叫「默认展开」。
   *
   * 点标题行那枚图标时，在事件里读一次断点决定切哪个（事件里读窗口宽度不参与渲染，
   * 不会 SSR / 水合不一致；布局本身仍然只用 CSS 断点）。
   */
  const [columnOpen, setColumnOpen] = useState(true);
  const [overlayOpen, setOverlayOpen] = useState(false);

  const toggleList = useCallback(() => {
    const wide = window.matchMedia("(min-width: 1280px)").matches;
    if (wide) setColumnOpen((open) => !open);
    else setOverlayOpen((open) => !open);
  }, []);
  /** 版式：仅编辑器 / 编辑器 + 预览 / 仅预览。**默认「仅编辑器」**（联调定：一进来先给写作面）。 */
  const [viewMode, setViewMode] = useState<ViewMode>("editor");
  /** 「编辑器 + 预览」里编辑区占的比例（拖动分割条改它）。不持久化，刷新回 1:1。 */
  const [splitRatio, setSplitRatio] = useState(0.5);
  /** 两栏那一行：分割条靠它量宽度、算指针位置。 */
  const splitRowRef = useRef<HTMLDivElement | null>(null);
  /** 待删除的那一篇（行尾垃圾桶点出来；`null` = 确认框关着）。 */
  const [deleteTarget, setDeleteTarget] = useState<MdDocumentSummary | null>(null);
  /** 批量选择模式：左栏行内出现复选框，顶部换成批量条。 */
  const [selectionMode, setSelectionMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(() => new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [busy, startTransition] = useTransition();

  const tags = useDocumentTags({
    documents,
    setDocuments,
    activeId,
    initialTags,
    onError: toast.error,
    onCreated: (name) => toast.success(`标签「${name}」已创建`),
    onDeleted: (name) => toast.success(`标签「${name}」已删除`),
  });

  /**
   * 窗口（或左栏）变窄时把分栏比例重新夹回允许范围。
   * 不这么做的话：在 1440 拖到 7:3，再把窗口缩到 900，预览会掉到 320px 以下。
   */
  useEffect(() => {
    const row = splitRowRef.current;
    if (!row) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width <= 0) return;
      setSplitRatio((current) => {
        const next = clampRatio(current, width);
        return Math.abs(next - current) < 0.001 ? current : next;
      });
    });
    observer.observe(row);
    return () => observer.disconnect();
  }, []);
  const { allTags, filter: tagFilter } = tags;

  /** 保存成功后只更新列表里那一行并提到最前：重拉整个列表会让正在编辑的行重挂（§七）。 */
  const handleSaved = useCallback((document: MdDocument) => {
    const summary: MdDocumentSummary = {
      id: document.id,
      title: document.title,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      tags: document.tags,
    };
    setDocuments((current) => [summary, ...current.filter((row) => row.id !== document.id)]);
  }, []);

  const autosave = useAutosave({ documentId: activeId, title, body, onSaved: handleSaved });

  // 首屏那一篇是「已经保存过的」：不建立这个基准，挂载后会立刻反手存一遍、把时间改掉
  const baselineReadyRef = useRef(false);
  useEffect(() => {
    if (baselineReadyRef.current || !initialDocument) return;
    baselineReadyRef.current = true;
    autosave.syncBaseline(initialDocument);
  }, [initialDocument, autosave]);

  // 新建后焦点落到标题框：输入框原来是 disabled，必须等这次提交之后才聚焦得到
  useEffect(() => {
    if (!focusTitleRef.current || activeId === null) return;
    focusTitleRef.current = false;
    titleInputRef.current?.focus();
  }, [activeId]);

  /** 把服务端那一篇装进编辑区（调用方负责先 flush 旧的那篇）。 */
  const loadDocument = useCallback(
    (document: MdDocument) => {
      setActiveId(document.id);
      setTitle(document.title);
      setBody(document.body);
      autosave.syncBaseline(document);
    },
    [autosave],
  );

  const selectDocument = useCallback(
    (summary: MdDocumentSummary) => {
      if (summary.id === activeId) return;

      // 切换前先补存：防抖计时器还没到就走，最后不到 0.8 秒的输入会丢
      void autosave.flush().then(() => {
        startTransition(async () => {
          const result = await openDocumentAction(summary.id);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          loadDocument(result.document);
        });
      });
    },
    [activeId, autosave, loadDocument, toast],
  );

  const createDocument = useCallback(() => {
    void autosave.flush().then(() => {
      startTransition(async () => {
        const result = await createDocumentAction();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        const created = result.document;
        setDocuments((current) => [
          {
            id: created.id,
            title: created.title,
            createdAt: created.createdAt,
            updatedAt: created.updatedAt,
            tags: created.tags,
          },
          ...current,
        ]);
        setActiveId(created.id);
        // 标题框留空（占位就是「未命名文档」）：直接打字就是起名
        setTitle("");
        setBody("");
        autosave.syncBaseline({ id: created.id, title: "", body: "" });
        // 真的聚焦要等 React 把新状态提交到 DOM（这时标题框才从 disabled 变回可编辑）：
        // 在 rAF 里直接 focus 会落在「还没启用的输入框」上，静默失败
        focusTitleRef.current = true;
      });
    });
  }, [autosave, toast]);

  const confirmDelete = useCallback(() => {
    const target = deleteTarget;
    if (!target) return;
    const wasActive = target.id === activeId;

    void autosave.flush().then(() => {
      startTransition(async () => {
        const result = await deleteDocumentAction(target.id);
        if (!result.ok) {
          toast.error(result.error);
          setDeleteTarget(null);
          return;
        }

        const remaining = documents.filter((row) => row.id !== target.id);
        setDocuments(remaining);
        setDeleteTarget(null);
        toast.success(`「${target.title}」已删除`);

        // 删的不是当前打开那篇：编辑区一个字都不该动
        if (!wasActive) return;

        const next = remaining[0];
        if (!next) {
          setActiveId(null);
          setTitle("");
          setBody("");
          autosave.resetBaseline();
          return;
        }
        // 选中落到列表第一条（最近改过的那篇）
        const opened = await openDocumentAction(next.id);
        if (opened.ok) {
          loadDocument(opened.document);
        } else {
          toast.error(opened.error);
        }
      });
    });
  }, [activeId, autosave, deleteTarget, documents, loadDocument, toast]);

  const copyMarkdown = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(body);
      toast.success("已复制");
    } catch {
      // 非安全上下文（HTTP）或浏览器拒绝权限：不能静默失败
      toast.error("复制失败，请手动选中");
    }
  }, [body, toast]);

  /** 导出 `.md`：文件名取标题（非法字符换成 `-`），内容是原文逐字。 */
  const exportMarkdown = useCallback(() => {
    const blob = new Blob([body], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${exportFileName(title)}.md`;
    // 挂到文档上再点：部分浏览器对游离节点的 `click()` 不触发下载
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [body, title]);

  /** 过滤后为空时的两句文案：搜不到 / 这个标签下没有，说法不一样。 */
  const emptyCopy = useMemo(() => {
    const keyword = query.trim();
    if (keyword) return { title: `没有标题包含「${keyword}」的文档`, hint: "换个词试试" };
    if (tagFilter === UNTAGGED_KEY) {
      return { title: "没有未归类的文档", hint: "每篇都已经打了标签" };
    }
    if (tagFilter !== null) {
      const label = allTags.find((tag) => tagKey(tag.name) === tagFilter)?.name ?? "这个标签";
      return { title: `「${label}」下还没有文档`, hint: "在正文上方的标签条里给它打上这个标签" };
    }
    return { title: undefined, hint: undefined };
  }, [query, tagFilter, allTags]);

  const untaggedCount = tags.untaggedCount;

  const hasDocument = activeId !== null;

  const activeTags = tags.activeTags;

  /**
   * 列表里到底显示哪几篇：先按标签筛选，再按搜索词过滤。
   * 在父组件算，是因为批量条的「已选 / 全选」必须和列表里看到的同一份范围。
   */
  const visibleDocuments = useMemo(() => {
    let rows = documents;

    if (tagFilter === UNTAGGED_KEY) {
      rows = rows.filter((row) => row.tags.length === 0);
    } else if (tagFilter !== null) {
      // 选「工作」时「工作/周报」也算命中（层级靠名字表达，见 tags.ts）
      rows = rows.filter((row) =>
        row.tags.some((tag) => tagMatchesPrefix(tagKey(tag.name), tagFilter)),
      );
    }

    const keyword = query.trim();
    if (keyword) rows = rows.filter((row) => row.title.includes(keyword));
    return rows;
  }, [documents, query, tagFilter]);

  /**
   * 真正要统计 / 删除的选中项 = 「选中集合」∩「当前可见范围」。
   *
   * 不去改写 `checkedIds` 本身（在 effect 里 setState 会被 lint 拦、也会多一轮渲染）：
   * 搜窄之后落到视野外的选中项就自然不算数了，清空搜索它们又回来——和「全选只作用于
   * 可见项」是同一套语义，也就不会出现「已选 5 / 1」这种自相矛盾的数字。
   */
  const checkedVisible = useMemo(() => {
    const set = new Set<number>();
    for (const row of visibleDocuments) {
      if (checkedIds.has(row.id)) set.add(row.id);
    }
    return set;
  }, [visibleDocuments, checkedIds]);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setCheckedIds(new Set());
  }, []);

  const toggleCheck = useCallback((id: number) => {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** 全选只作用于**当前搜索结果**（搜了词就只选看得见的那几篇）。 */
  const toggleAll = useCallback(() => {
    setCheckedIds((current) => {
      const allChecked =
        visibleDocuments.length > 0 && visibleDocuments.every((row) => current.has(row.id));
      return allChecked ? new Set() : new Set(visibleDocuments.map((row) => row.id));
    });
  }, [visibleDocuments]);

  /** 批量删除：一次进一个事务式 SQL，回来把选中的从列表移除。 */
  const confirmBulkDelete = useCallback(() => {
    const ids = [...checkedVisible];
    if (ids.length === 0) return;
    const removed = new Set(ids);
    const removesActive = activeId !== null && removed.has(activeId);

    void autosave.flush().then(() => {
      startTransition(async () => {
        const result = await deleteDocumentsAction(ids);
        setBulkDeleteOpen(false);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }

        const remaining = documents.filter((row) => !removed.has(row.id));
        setDocuments(remaining);
        exitSelection();
        toast.success(`已删除 ${result.count} 篇`);

        if (!removesActive) return;

        // 删到了正在编辑的那篇：打开剩余列表的第一篇；一篇不剩就回空态
        const next = remaining[0];
        if (!next) {
          setActiveId(null);
          setTitle("");
          setBody("");
          autosave.resetBaseline();
          return;
        }
        const opened = await openDocumentAction(next.id);
        if (opened.ok) loadDocument(opened.document);
        else toast.error(opened.error);
      });
    });
  }, [activeId, autosave, checkedVisible, documents, exitSelection, loadDocument, toast]);

  return (
    <>
      {/* `relative`：左栏的浮层（抽屉 / 手机全屏列表）用 `absolute` 贴着这个盒子，起点与左栏一致 */}
      <div className="relative flex h-full overflow-hidden">
        {/* 左栏：≥ 1280（xl）作为布局里的一列，可收起；更窄时由浮层承担 */}
        <aside
          className={cn(
            "w-60 shrink-0 border-r border-[#F0F0F0]",
            columnOpen ? "hidden xl:flex" : "hidden",
          )}
        >
          <DocumentList
            documents={visibleDocuments}
            totalCount={documents.length}
            tags={allTags}
            activeTagKey={tagFilter}
            untaggedCount={untaggedCount}
            onSelectTagFilter={tags.setFilter}
            onOpenTagManager={() => tags.setManagerOpen(true)}
            emptyTitle={emptyCopy.title}
            emptyHint={emptyCopy.hint}
            activeId={activeId}
            query={query}
            onQueryChange={setQuery}
            onSelect={selectDocument}
            onDelete={setDeleteTarget}
            onCreate={createDocument}
            selectionMode={selectionMode}
            checkedIds={checkedVisible}
            onEnterSelection={() => setSelectionMode(true)}
            onExitSelection={exitSelection}
            onToggleCheck={toggleCheck}
            onToggleAll={toggleAll}
            onDeleteChecked={() => setBulkDeleteOpen(true)}
            busy={busy}
          />
        </aside>

        {/* 右侧：上面一条横跨「编辑 + 预览」的标题行，下面才是这两栏 */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <EditorTopBar
            title={title}
            onTitleChange={setTitle}
            hasDocument={hasDocument}
            titleInputRef={titleInputRef}
            onCreate={createDocument}
            onToggleList={toggleList}
            listOpen={columnOpen || overlayOpen}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            busy={busy}
          />

          <div ref={splitRowRef} className="flex min-h-0 flex-1 overflow-hidden">
            {/*
              编辑区：「仅预览」时整块让位（`hidden`，不是卸载——重挂会丢焦点与滚动位置）。
              手机两枚按钮里没有「编辑器 + 预览」，那一档由 CSS 落成「只显示编辑」。
              「编辑器 + 预览」时宽度由分割条拖出来的比例决定（`flex-basis`），其余两档吃满。
            */}
            <EditorPane
              style={viewMode === "split" ? { flexBasis: `${splitRatio * 100}%` } : undefined}
              className={
                viewMode === "preview"
                  ? "hidden"
                  : viewMode === "split"
                    ? "flex shrink-0 grow-0"
                    : "flex flex-1"
              }
              body={body}
              onBodyChange={setBody}
              hasDocument={hasDocument}
              status={autosave.status}
              onRetry={autosave.retry}
              onCopy={copyMarkdown}
              onExport={exportMarkdown}
              onComposingChange={autosave.setComposing}
              tagBar={
                <TagBar
                  tags={activeTags}
                  allTags={allTags}
                  disabled={!hasDocument}
                  onChange={tags.apply}
                />
              }
              mobileDocNav={
                <DocumentChips
                  documents={documents}
                  activeId={activeId}
                  onSelect={selectDocument}
                  className="md:hidden"
                />
              }
            />

            {/* 分割条：只在「编辑器 + 预览」且 ≥ md 时出现（手机上不存在并排那一档） */}
            <SplitDivider
              containerRef={splitRowRef}
              onRatioChange={setSplitRatio}
              className={viewMode === "split" ? "hidden md:flex" : "hidden"}
            />

            {/*
              预览栏（同一个 DOM 元素管三档，不复制——预览要解析整篇 Markdown）：
              - < md：只有「仅预览」时显示（手机上不存在并排那一档）；
              - ≥ md：打开「编辑器 + 预览」与「仅预览」都显示；「仅编辑器」时隐藏。
              split 时左边框由分割条承担，这里不再画一条。
            */}
            <aside
              className={cn(
                "min-w-0 flex-1 flex-col bg-white",
                viewMode === "split" ? "" : "md:border-l md:border-[#F0F0F0]",
                viewMode === "preview" ? "flex" : "hidden",
                viewMode === "editor" ? "md:hidden" : "md:flex",
              )}
            >
              <PreviewPane body={body} className="min-h-0 flex-1" />
            </aside>
          </div>
        </div>

        {/* 浮层贴着页面根（`relative`）：起点与左栏一致，不从浏览器窗口最顶上滑出来 */}
        <DocumentListOverlays
          open={overlayOpen}
          onClose={() => setOverlayOpen(false)}
          documents={visibleDocuments}
          totalCount={documents.length}
          tags={allTags}
          activeTagKey={tagFilter}
          untaggedCount={untaggedCount}
          onSelectTagFilter={tags.setFilter}
          onOpenTagManager={() => tags.setManagerOpen(true)}
          emptyTitle={emptyCopy.title}
          emptyHint={emptyCopy.hint}
          activeId={activeId}
          query={query}
          onQueryChange={setQuery}
          onSelect={selectDocument}
          onDelete={setDeleteTarget}
          onCreate={createDocument}
          selectionMode={selectionMode}
          checkedIds={checkedVisible}
          onEnterSelection={() => setSelectionMode(true)}
          onExitSelection={exitSelection}
          onToggleCheck={toggleCheck}
          onToggleAll={toggleAll}
          onDeleteChecked={() => setBulkDeleteOpen(true)}
          busy={busy}
        />
      </div>

      <TagManager
        open={tags.managerOpen}
        tags={allTags}
        busy={busy}
        onClose={() => tags.setManagerOpen(false)}
        onRename={tags.rename}
        onDelete={tags.remove}
        onCreate={tags.create}
        onDeleteMany={tags.removeMany}
      />

      {bulkDeleteOpen ? (
        <ConfirmDialog
          title="批量删除"
          description={`删除选中的 ${checkedVisible.size} 篇文档？删除后无法恢复。`}
          busy={busy}
          onConfirm={confirmBulkDelete}
          onClose={() => setBulkDeleteOpen(false)}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          title="删除文档"
          description={`删除「${deleteTarget.title}」？删除后无法恢复。`}
          busy={busy}
          onConfirm={confirmDelete}
          onClose={() => setDeleteTarget(null)}
        />
      ) : null}
    </>
  );
}
