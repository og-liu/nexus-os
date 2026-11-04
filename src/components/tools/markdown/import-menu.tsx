"use client";

import { useEffect, useRef, useState } from "react";
import { FileUp, FolderOpen, Upload } from "lucide-react";
import {
  IMPORT_FILE_MAX_BYTES,
  importTitleFromFileName,
  isMarkdownFileName,
} from "@/lib/markdown/import";
import { BODY_MAX, charCount } from "@/lib/markdown/validate";

/**
 * 导入入口（《功能/Markdown编辑器》§2.8）。
 *
 * 只负责三件事：画出按钮与菜单、拉起系统选择器、把选中的文件**读成文本**。
 * 入库、进度、列表更新都在 `MarkdownEditorView` 里——那里才有文档列表和自动保存的
 * `flush()`，在这个组件里再留一份就是两份真相。
 *
 * **文件夹走两条路**（2026-11-04 联调改的）：
 * 1. 优先 `showDirectoryPicker()`（File System Access API）——原生目录选择器，
 *    **没有「将 N 个文件上传到此网站？」那个浏览器确认框**；
 * 2. Safari / Firefox 没有这个 API，或者调用被拒（非安全上下文 / iframe），
 *    退回 `<input webkitdirectory>`——那条路一定会有那个框，是浏览器的强制确认，
 *    网页改不了，只能接受。
 */

/** 一份待导入的文件（已读成文本）。`error` 非空 = 这份不导，只进结果的「跳过」栏。 */
export interface ImportCandidate {
  /** 原始文件名（失败提示里说「哪个文件」）。 */
  fileName: string;
  /** 文件名推出的标题（已截断、空名兜底）。 */
  title: string;
  body: string;
  /** 「文件太大」/「读取失败」/「超过 10 万字」。 */
  error?: string;
}

/** 选中的文件 + 它的相对路径（文件夹导入时排序用；多选就是文件名）。 */
interface PickedFile {
  file: File;
  path: string;
}

/**
 * File System Access API 的**最小**类型。
 *
 * TS 的 `lib.dom` 对这个 API 覆盖不全（`Window` 上没有 `showDirectoryPicker`），
 * 这里只声明真正用到的三个成员——补一层类型比给整块 API 写 polyfill 便宜。
 */
interface FileEntryHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
}

interface DirectoryEntryHandle {
  kind: "directory";
  name: string;
  values(): AsyncIterableIterator<FileEntryHandle | DirectoryEntryHandle>;
}

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    mode?: "read" | "readwrite";
  }) => Promise<DirectoryEntryHandle>;
};

interface ImportMenuProps {
  /** 导入进行中（含读取阶段）：按钮变灰，不能开第二次。 */
  disabled?: boolean;
  /** 选好文件、读完文本之后交给页面。空数组 = 一个 Markdown 都没选到。 */
  onFiles: (candidates: ImportCandidate[]) => void;
}

/** 回退路径（`webkitdirectory`）浏览器给的相对路径；多选文件没有它，退回文件名。 */
function relativePath(file: File): string {
  const withPath = file as File & { webkitRelativePath?: string };
  return withPath.webkitRelativePath || file.name;
}

/**
 * 递归收集目录里的 Markdown。
 *
 * 只对 md 调 `getFile()`（拿句柄、不读内容），非 md 直接跳过——一个满是 mp4 的
 * 文件夹不会因此把几百个文件对象塞进内存。
 */
async function collectMarkdown(
  handle: DirectoryEntryHandle,
  prefix = "",
): Promise<PickedFile[]> {
  const found: PickedFile[] = [];
  for await (const entry of handle.values()) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === "directory") {
      found.push(...(await collectMarkdown(entry, path)));
    } else if (isMarkdownFileName(entry.name)) {
      found.push({ file: await entry.getFile(), path });
    }
  }
  return found;
}

export function ImportMenu({ disabled = false, onFiles }: ImportMenuProps) {
  const [open, setOpen] = useState(false);
  /** 正在遍历目录 / 读文件（都是异步的）：这段时间按钮禁用，防止开第二次。 */
  const [working, setWorking] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  // 点菜单外面 / 按 Esc 关掉（与左栏的标签筛选同一套）
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const runImport = async (items: PickedFile[]) => {
    // 非 Markdown 静默忽略：文件夹里混着 .png / .DS_Store 是常态，不该报错
    const markdown = items.filter((item) => isMarkdownFileName(item.file.name));
    if (markdown.length === 0) {
      onFiles([]);
      return;
    }

    // 顺序随浏览器 / 系统变，自己排（文件夹按相对路径，多选就是文件名）。
    // `numeric` 让「压力2」排在「压力10」前面（默认是字典序，2 会跑到 19 后面）
    const collator = new Intl.Collator("zh-Hans-CN", { numeric: true });
    const ordered = [...markdown].sort((a, b) => collator.compare(a.path, b.path));

    const candidates: ImportCandidate[] = [];
    for (const { file } of ordered) {
      const fileName = file.name;
      const title = importTitleFromFileName(fileName);

      if (file.size > IMPORT_FILE_MAX_BYTES) {
        candidates.push({ fileName, title, body: "", error: "文件太大" });
        continue;
      }

      try {
        // `file.text()` 一律按 UTF-8 解码（GBK 的文件会读出乱码，见文档 §七）
        const body = await file.text();
        if (charCount(body) > BODY_MAX) {
          candidates.push({ fileName, title, body, error: "超过 10 万字" });
          continue;
        }
        candidates.push({ fileName, title, body });
      } catch {
        candidates.push({ fileName, title, body: "", error: "读取失败" });
      }
    }

    onFiles(candidates);
  };

  /** 统一管 loading：选中 → 遍历 / 读文本 → 交给页面，整个过程按钮禁用。 */
  const withWorking = async (task: () => Promise<void>) => {
    setWorking(true);
    try {
      await task();
    } finally {
      setWorking(false);
    }
  };

  const pickFiles = () => filesInputRef.current?.click();

  /**
   * 导入文件夹。
   *
   * `showDirectoryPicker()` **必须在点击的同步栈里调用**——浏览器只认「用户手势」
   * 那一下，先 `await` 别的东西再调会被拒（`SecurityError` / 手势已失效）。
   */
  const pickFolder = () => {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (typeof picker !== "function") {
      // Safari / Firefox：没有这个 API，走 webkitdirectory（会有浏览器确认框）
      folderInputRef.current?.click();
      return;
    }

    let pending: Promise<DirectoryEntryHandle>;
    try {
      pending = picker.call(window, { mode: "read" });
    } catch {
      folderInputRef.current?.click();
      return;
    }

    setWorking(true);
    void pending
      .then((handle) => collectMarkdown(handle))
      .then((items) => runImport(items))
      .catch((error: unknown) => {
        // 用户点了「取消」：什么都不做
        if ((error as DOMException | undefined)?.name === "AbortError") return;
        // 其它失败（被浏览器策略拒绝 / 权限）：退回 input，至少还能选
        folderInputRef.current?.click();
      })
      .finally(() => setWorking(false));
  };

  const disabledAll = disabled || working;

  const itemClass =
    "flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left text-[12px] text-[#1F1F1F] transition-colors hover:bg-[#F5F5F5]";

  return (
    <div ref={boxRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={disabledAll}
        aria-label="导入 Markdown"
        aria-haspopup="menu"
        aria-expanded={open}
        title="导入 Markdown"
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[2px] text-[#666666] transition-colors hover:bg-[#F5F5F5] hover:text-[#000000] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#666666]"
      >
        <Upload className="h-4 w-4" aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-36 overflow-hidden rounded-[2px] border border-[#E5E5E5] bg-white py-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              pickFiles();
            }}
            className={itemClass}
          >
            <FileUp className="h-3.5 w-3.5 text-[#666666]" aria-hidden="true" />
            导入文件
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              pickFolder();
            }}
            className={itemClass}
          >
            <FolderOpen className="h-3.5 w-3.5 text-[#666666]" aria-hidden="true" />
            导入文件夹
          </button>
        </div>
      ) : null}

      {/*
        两个隐藏 input：
        - 文件：`multiple`，选 1 个就是单篇、选 N 个就是批量；
        - 文件夹：`webkitdirectory`（不在 React 的类型里，用 spread 传），只在
          没有 `showDirectoryPicker` 的浏览器里用到；它不认 `accept`，筛选在
          `runImport` 里做。
        每次 onChange 之后必须把手动 value 清空，否则**再选同一批文件不触发**。
      */}
      <input
        ref={filesInputRef}
        type="file"
        accept=".md,.markdown"
        multiple
        className="hidden"
        onChange={(event) => {
          // **先拷成数组、再清空 value**：`event.target.files` 是活的引用，
          // value 一清它就变空，晚一步复制等于什么都没选（这个顺序踩过一次）
          const files = event.target.files ? [...event.target.files] : [];
          event.target.value = "";
          if (files.length === 0) return;
          void withWorking(() =>
            runImport(files.map((file) => ({ file, path: file.name }))),
          );
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        {...{ webkitdirectory: "" }}
        onChange={(event) => {
          const files = event.target.files ? [...event.target.files] : [];
          event.target.value = "";
          if (files.length === 0) return;
          void withWorking(() =>
            runImport(files.map((file) => ({ file, path: relativePath(file) }))),
          );
        }}
      />
    </div>
  );
}
