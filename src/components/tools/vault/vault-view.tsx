"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  createGroupAction,
  createItemAction,
  deleteGroupAction,
  deleteItemAction,
  deleteItemsAction,
  moveItemsAction,
  renameGroupAction,
  updateItemAction,
  type VaultActionResult,
  type VaultSnapshot,
} from "@/lib/vault/actions";
import { collectFieldKeys, type VaultGroup, type VaultItem } from "@/lib/vault/vault";
import type { VaultField } from "@/lib/vault/vault";
import { GroupNav, type VaultView } from "./group-nav";
import { ItemList } from "./item-list";
import { ItemDetail } from "./item-detail";
import { ItemDialog } from "./item-dialog";
import { ConfirmDialog, GroupDialog } from "./dialogs";

/**
 * 保险库工具页（《功能/保险库》§二）。
 *
 * 这个组件是整页的**状态中枢**：当前视图（所有条目 / 某个群组）、选中哪一条、
 * 搜索词、勾选了哪几条、哪个弹窗开着。子组件都是纯展示 + 回调——
 * 左栏与中栏各自留着「选中态」的话，两处状态迟早对不上（比如切换群组后右栏还显示着旧条目）。
 *
 * 写操作统一走 `mutate()`：调 Server Action → 用返回的整份快照覆盖本地状态。
 * 排序、过滤、字段并集都只有服务端一份规则，客户端不重复实现。
 */

interface DialogState {
  kind:
    | "create-item"
    | "edit-item"
    | "create-group"
    | "rename-group"
    | "delete-item"
    | "delete-group"
    | "delete-batch";
  item?: VaultItem;
  group?: VaultGroup;
}

interface VaultViewProps {
  initialSnapshot: VaultSnapshot;
}

/** 视图过滤：`all` 是全部（含未分组），数字是某个群组。 */
function filterByView(items: VaultItem[], view: VaultView): VaultItem[] {
  return view === "all" ? items : items.filter((item) => item.groupId === view);
}

function filterByQuery(items: VaultItem[], query: string): VaultItem[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return items;
  return items.filter((item) => item.title.toLowerCase().includes(keyword));
}

export function VaultView({ initialSnapshot }: VaultViewProps) {
  const toast = useToast();

  const [groups, setGroups] = useState<VaultGroup[]>(initialSnapshot.groups);
  const [items, setItems] = useState<VaultItem[]>(initialSnapshot.items);

  const [view, setView] = useState<VaultView>("all");
  // 首屏就选中最新的一条：右栏空着会让人以为坏了（列表有序，第一条就是「最近动过的」）
  const [selectedId, setSelectedId] = useState<number | null>(
    initialSnapshot.items[0]?.id ?? null,
  );
  const [query, setQuery] = useState("");
  const [checkedIds, setCheckedIds] = useState<Set<number>>(() => new Set());

  const [groupsOpen, setGroupsOpen] = useState(false);
  /** 手机（< md）上「点条目进详情页」——详情整页替换列表，不是抽屉。 */
  const [detailOpen, setDetailOpen] = useState(false);

  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // ---------------------------------------------------------------- 派生

  const viewItems = useMemo(() => filterByView(items, view), [items, view]);
  const visibleItems = useMemo(() => filterByQuery(viewItems, query), [viewItems, query]);
  const fieldKeys = useMemo(() => collectFieldKeys(visibleItems), [visibleItems]);
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  const activeGroup = view === "all" ? null : groups.find((group) => group.id === view) ?? null;
  const emptyText = activeGroup
    ? `「${activeGroup.name}」里还没有记录`
    : "这里还没有记录";

  // ---------------------------------------------------------------- 写操作

  /**
   * 所有写操作的唯一入口。
   *
   * 成功时：用新快照覆盖本地状态 → 交给 `onOk` 决定选中谁；
   * 失败时：如果弹窗开着就把错误显示在弹窗里（不关窗，输入不丢），否则走 toast。
   */
  const mutate = useCallback(
    (
      task: () => Promise<VaultActionResult>,
      options: {
        successMessage?: string;
        onOk?: (snapshot: VaultSnapshot, createdId?: number) => void;
      } = {},
    ) => {
      setDialogError(null);
      startTransition(async () => {
        const result = await task();
        if (!result.ok) {
          if (dialog) {
            setDialogError(result.error);
          } else {
            toast.error(result.error);
          }
          return;
        }

        setGroups(result.snapshot.groups);
        setItems(result.snapshot.items);
        // 选中项可能已经不存在（被删掉 / 移走了），先兜住再让 onOk 覆盖
        setSelectedId((current) =>
          current !== null && result.snapshot.items.some((item) => item.id === current)
            ? current
            : null,
        );
        options.onOk?.(result.snapshot, result.createdId);
        if (options.successMessage) toast.success(options.successMessage);
      });
    },
    [dialog, toast],
  );

  /** 改完 / 删完之后，按当前视图重新选第一条（规则只写这一处）。 */
  const reselectFirst = useCallback(
    (snapshot: VaultSnapshot) => {
      const nextVisible = filterByQuery(filterByView(snapshot.items, view), query);
      setSelectedId(nextVisible[0]?.id ?? null);
    },
    [view, query],
  );

  // ---------------------------------------------------------------- 视图与选择

  const selectView = useCallback(
    (next: VaultView) => {
      setView(next);
      setQuery("");
      setCheckedIds(new Set());
      // 需求：切群组默认选中该群组的第一条
      const nextVisible = filterByView(items, next);
      setSelectedId(nextVisible[0]?.id ?? null);
      setGroupsOpen(false);
      setDetailOpen(false);
    },
    [items],
  );

  const selectItem = useCallback((item: VaultItem) => {
    setSelectedId(item.id);
    setDetailOpen(true);
  }, []);

  const handleQueryChange = useCallback(
    (next: string) => {
      setQuery(next);
      // 选中项不在新结果里就退到结果的第一条（全空则清掉选中）。
      // 不这样处理的话，搜完再清空搜索会停在空态——用户明明有数据却看不到。
      const nextVisible = filterByQuery(filterByView(items, view), next);
      if (selectedId === null || !nextVisible.some((item) => item.id === selectedId)) {
        setSelectedId(nextVisible[0]?.id ?? null);
      }
    },
    [items, view, selectedId],
  );

  const toggleCheck = useCallback((id: number) => {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setCheckedIds((current) => {
      const allChecked =
        visibleItems.length > 0 && visibleItems.every((item) => current.has(item.id));
      return allChecked ? new Set() : new Set(visibleItems.map((item) => item.id));
    });
  }, [visibleItems]);

  const clearChecks = useCallback(() => setCheckedIds(new Set()), []);

  const copyValue = useCallback(
    async (value: string) => {
      if (!value) {
        toast.info("这一行没有值");
        return;
      }
      try {
        await navigator.clipboard.writeText(value);
        toast.success("已复制");
      } catch {
        // 非安全上下文（HTTP）或浏览器拒绝权限时走这里：不能静默失败
        toast.error("复制失败，请手动选中");
      }
    },
    [toast],
  );

  // ---------------------------------------------------------------- 弹窗提交

  const openDialog = useCallback((next: DialogState) => {
    setDialogError(null);
    setDialog(next);
  }, []);

  const closeDialog = useCallback(() => {
    setDialog(null);
    setDialogError(null);
  }, []);

  const submitItem = useCallback(
    (input: { title: string; groupId: number | null; fields: VaultField[] }) => {
      if (!dialog) return;

      if (dialog.kind === "create-item") {
        mutate(() => createItemAction(input), {
          onOk: (snapshot, createdId) => {
            // 新建的那条直接选中（服务端把新 id 放在 createdId 上，不用猜）
            setDialog(null);
            setSelectedId(createdId ?? null);
            setDetailOpen(false);
            // 提示带上标题：服务端可能把「未命名」补成「未命名 2」，所以从快照里取真标题
            const created = snapshot.items.find((row) => row.id === createdId);
            toast.success(`「${created?.title ?? input.title}」已保存`);
          },
        });
        return;
      }

      const item = dialog.item;
      if (!item) return;
      mutate(() => updateItemAction(item.id, input), {
        onOk: (snapshot) => {
          setDialog(null);
          setSelectedId(item.id);
          const saved = snapshot.items.find((row) => row.id === item.id);
          toast.success(`「${saved?.title ?? input.title}」已保存`);
        },
      });
    },
    [dialog, mutate, toast],
  );

  const submitGroup = useCallback(
    (name: string) => {
      if (!dialog) return;

      if (dialog.kind === "create-group") {
        mutate(() => createGroupAction(name), {
          successMessage: "群组已创建",
          onOk: () => setDialog(null),
        });
        return;
      }

      const group = dialog.group;
      if (!group) return;
      mutate(() => renameGroupAction(group.id, name), {
        successMessage: "群组已重命名",
        onOk: () => setDialog(null),
      });
    },
    [dialog, mutate],
  );

  const confirmDelete = useCallback(() => {
    if (!dialog) return;

    if (dialog.kind === "delete-item" && dialog.item) {
      const target = dialog.item;
      mutate(() => deleteItemAction(target.id), {
        successMessage: `「${target.title}」已删除`,
        onOk: (snapshot) => {
          setDialog(null);
          reselectFirst(snapshot);
          setDetailOpen(false);
        },
      });
      return;
    }

    if (dialog.kind === "delete-group" && dialog.group) {
      const target = dialog.group;
      mutate(() => deleteGroupAction(target.id), {
        successMessage: `群组「${target.name}」已删除`,
        onOk: (snapshot) => {
          setDialog(null);
          // 正在看的群组被删了 → 退回「所有条目」，否则中栏会停在一个不存在的视图
          if (view === target.id) {
            setView("all");
            const nextVisible = snapshot.items;
            setSelectedId(nextVisible[0]?.id ?? null);
          }
        },
      });
      return;
    }

    if (dialog.kind === "delete-batch") {
      const ids = [...checkedIds];
      mutate(() => deleteItemsAction(ids), {
        successMessage: `已删除 ${ids.length} 条`,
        onOk: (snapshot) => {
          setDialog(null);
          setCheckedIds(new Set());
          reselectFirst(snapshot);
        },
      });
    }
  }, [dialog, checkedIds, mutate, reselectFirst, view]);

  const moveChecked = useCallback(
    (groupId: number | null) => {
      const ids = [...checkedIds];
      if (ids.length === 0) return;
      mutate(() => moveItemsAction(ids, groupId), {
        successMessage: `已移动 ${ids.length} 条`,
        onOk: (snapshot) => {
          setCheckedIds(new Set());
          reselectFirst(snapshot);
        },
      });
    },
    [checkedIds, mutate, reselectFirst],
  );

  // ---------------------------------------------------------------- 渲染

  return (
    <>
      <div className="flex h-full overflow-hidden">
        {/* 左栏：≥ xl 常驻；更窄时收进抽屉（内容区只有 80px 侧栏让位，三栏会挤） */}
        <aside className="hidden w-52 shrink-0 border-r border-[#E8E8E8] xl:flex">
          <GroupNav
            groups={groups}
            totalCount={items.length}
            activeView={view}
            onSelect={selectView}
            onCreate={() => openDialog({ kind: "create-group" })}
            onRename={(group) => openDialog({ kind: "rename-group", group })}
            onDelete={(group) => openDialog({ kind: "delete-group", group })}
          />
        </aside>

        {/* 中栏 */}
        <ItemList
          items={visibleItems}
          fieldKeys={fieldKeys}
          groups={groups}
          query={query}
          onQueryChange={handleQueryChange}
          selectedId={selectedId}
          onSelect={selectItem}
          checkedIds={checkedIds}
          onToggleCheck={toggleCheck}
          onToggleAll={toggleAll}
          onClearChecks={clearChecks}
          onCreate={() => openDialog({ kind: "create-item" })}
          onMoveChecked={moveChecked}
          onDeleteChecked={() => openDialog({ kind: "delete-batch" })}
          onOpenGroups={() => setGroupsOpen(true)}
          activeView={view}
          onSelectView={selectView}
          onEditItem={(item) => openDialog({ kind: "edit-item", item })}
          emptyText={emptyText}
          busy={pending}
          className={cn(
            "flex-1 border-r border-[#E8E8E8]",
            detailOpen && "hidden md:flex",
          )}
        />

        {/* 右栏：≥ md 常驻；手机上作为整页（点条目进入、点返回退出） */}
        <ItemDetail
          item={selectedItem}
          groups={groups}
          onEdit={() => {
            if (selectedItem) openDialog({ kind: "edit-item", item: selectedItem });
          }}
          onDelete={() => {
            if (selectedItem) openDialog({ kind: "delete-item", item: selectedItem });
          }}
          onCopy={copyValue}
          onBack={() => setDetailOpen(false)}
          className={cn(
            "w-full md:w-[340px] md:shrink-0 xl:w-96",
            !detailOpen && "hidden md:flex",
          )}
        />
      </div>

      {/* 窄屏群组抽屉（< xl）：面板 + 遮罩，与 AppShell 的导航抽屉同一套观感 */}
      <div
        className={cn(
          "fixed inset-0 z-40 xl:hidden",
          groupsOpen ? "" : "pointer-events-none",
        )}
      >
        <div
          onClick={() => setGroupsOpen(false)}
          aria-hidden="true"
          className={cn(
            "absolute inset-0 bg-black/25 backdrop-blur-sm transition-opacity duration-300",
            groupsOpen ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          className={cn(
            "absolute left-0 top-0 h-full w-60 bg-white shadow-xl transition-transform duration-300",
            groupsOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <GroupNav
            groups={groups}
            totalCount={items.length}
            activeView={view}
            onSelect={selectView}
            onCreate={() => {
              setGroupsOpen(false);
              openDialog({ kind: "create-group" });
            }}
            onRename={(group) => {
              setGroupsOpen(false);
              openDialog({ kind: "rename-group", group });
            }}
            onDelete={(group) => {
              setGroupsOpen(false);
              openDialog({ kind: "delete-group", group });
            }}
          />
        </div>
      </div>

      {/* 弹窗：每个弹窗用 key 强制重建，打开即是干净的初始值（不用 useEffect 同步） */}
      {dialog?.kind === "create-item" || dialog?.kind === "edit-item" ? (
        <ItemDialog
          key={dialog.kind === "edit-item" ? `edit-${dialog.item?.id}` : "create"}
          item={dialog.kind === "edit-item" ? (dialog.item ?? null) : null}
          groups={groups}
          defaultGroupId={view === "all" ? null : view}
          busy={pending}
          error={dialogError}
          onSubmit={submitItem}
          onClose={closeDialog}
        />
      ) : null}

      {dialog?.kind === "create-group" || dialog?.kind === "rename-group" ? (
        <GroupDialog
          key={dialog.kind === "rename-group" ? `rename-${dialog.group?.id}` : "create-group"}
          mode={dialog.kind === "create-group" ? "create" : "rename"}
          initialName={dialog.group?.name ?? ""}
          busy={pending}
          error={dialogError}
          onSubmit={submitGroup}
          onClose={closeDialog}
        />
      ) : null}

      {dialog?.kind === "delete-item" && dialog.item ? (
        <ConfirmDialog
          title="删除记录"
          description={`删除「${dialog.item.title}」？删除后无法恢复。`}
          busy={pending}
          error={dialogError}
          onConfirm={confirmDelete}
          onClose={closeDialog}
        />
      ) : null}

      {dialog?.kind === "delete-group" && dialog.group ? (
        <ConfirmDialog
          title="删除群组"
          description={
            dialog.group.itemCount > 0
              ? `删除群组「${dialog.group.name}」？该群组还有 ${dialog.group.itemCount} 条记录，删除后它们会变成未分组，记录本身不会丢失。`
              : `删除群组「${dialog.group.name}」？这个群组里没有记录。`
          }
          busy={pending}
          error={dialogError}
          onConfirm={confirmDelete}
          onClose={closeDialog}
        />
      ) : null}

      {dialog?.kind === "delete-batch" ? (
        <ConfirmDialog
          title="批量删除"
          description={`删除选中的 ${checkedIds.size} 条记录？删除后无法恢复。`}
          busy={pending}
          error={dialogError}
          onConfirm={confirmDelete}
          onClose={closeDialog}
        />
      ) : null}
    </>
  );
}
