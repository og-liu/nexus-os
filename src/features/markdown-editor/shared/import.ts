import { TITLE_MAX, UNTITLED } from "./validate";

/**
 * 导入的纯函数（features/markdown-editor/README.md §2.8）。
 *
 * 这里不碰文件、不碰数据库、不碰 React——只回答三个问题：
 * 1. 这个文件名算不算 Markdown？
 * 2. 它应该叫什么标题？
 * 3. 库里已经有同名标题时，下一个空的叫什么？
 *
 * 三件事都能单测，读文件的异步流程（`import-menu.tsx`）与入库（`actions.ts`）
 * 各自只管自己那一段。
 */

/** 认作 Markdown 的扩展名（统一小写比较）。 */
const MARKDOWN_EXTENSIONS = [".md", ".markdown"];

/**
 * 单文件硬上限：5MB。
 *
 * 正文的真实上限是 10 万**字符**（`BODY_MAX`），按 UTF-8 算最多也就几百 KB；
 * 5MB 已经只可能是「把别的文件改名成 .md」这类事故，读进内存前就挡掉。
 */
export const IMPORT_FILE_MAX_BYTES = 5 * 1024 * 1024;

/** 文件名是不是 Markdown：扩展名大小写不敏感（`.MD` 也算）。 */
export function isMarkdownFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return MARKDOWN_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/**
 * 文件名 → 标题：去掉**最后一个**扩展名、`trim()`、空名兜底「未命名文档」、
 * 超过 60 字截断。
 *
 * 截断而不是拒绝：标题是机器从文件名推出来的，丢几个字比整篇导不进来便宜；
 * 正文照样完整入库。
 */
export function importTitleFromFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  // `dot > 0`：`.md` 这种隐藏文件没有「名字部分」，整个当名字用（再去点会越界）
  const base = (dot > 0 ? name.slice(0, dot) : name).trim();
  if (base === "") return UNTITLED;
  return truncateTitle(base);
}

/**
 * 撞名补序号：`周报` → `周报 2` → `周报 3`……
 *
 * 与「新建」的 `nextUntitledTitle` 是两件事：那个只处理「未命名文档」这一种名字，
 * 而导入的文件名什么都有可能撞（两篇 `README.md`、两个目录里的 `周报.md`）。
 *
 * 补完**仍然守 60 字**：基础名先给序号留出位置再截断（`60 字的名字` + ` 2` 会变 62 字，
 * 而标题上限在服务端校验里是硬的，多一个字整篇就存不进去）。
 */
export function nextAvailableTitle(base: string, used: ReadonlySet<string>): string {
  const root = truncateTitle(base);
  if (!used.has(root)) return root;

  let suffix = 2;
  while (used.has(withSuffix(root, suffix))) suffix += 1;
  return withSuffix(root, suffix);
}

/** 按字符截断（一个 emoji 算 1，与字数的口径一致）。 */
function truncateTitle(value: string): string {
  const chars = Array.from(value);
  return chars.length > TITLE_MAX ? chars.slice(0, TITLE_MAX).join("") : value;
}

/** `基础名 + 空格 + 序号`，总长不超过 `TITLE_MAX`。 */
function withSuffix(root: string, suffix: number): string {
  const tail = ` ${suffix}`;
  const keep = TITLE_MAX - Array.from(tail).length;
  return `${Array.from(root).slice(0, keep).join("")}${tail}`;
}
