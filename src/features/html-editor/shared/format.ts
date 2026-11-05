/**
 * 格式工具栏的纯函数（features/html-editor/README.md §2.4、§六 验收 31–36）。
 *
 * `applyFormat(text, selection, kind)` 只做一件事：**算出新文本和新选区**，
 * 不碰 DOM、不碰 React，因此可以逐条单测（含「再点一次取消」「跨行选区」这种反向）。
 * 调用方负责把结果写回 textarea 并恢复选区。
 *
 * 与 Markdown 版的区别：动作从「插 Markdown 标记」换成「包 HTML 标签」——
 * 行内按钮包一对行内标签；标题 / 列表 / 引用是整块操作（选中行整块改写），
 * 完成后的选区覆盖改写后的整块；代码块与链接把光标 / 选区落在能继续输入的位置。
 *
 * 为什么不做成编辑器组件库：HTML 源码与输入框内容一一对应，一个纯函数改写 +
 * 原生 textarea 就够了；引 CodeMirror / Monaco 是几十万行依赖（同 §四「编辑控件」）。
 */

/** 9 个格式按钮对应的动作。 */
export type FormatKind =
  | "bold"
  | "italic"
  | "code"
  | "heading"
  | "bullet"
  | "ordered"
  | "quote"
  | "codeblock"
  | "link";

export interface TextSelection {
  start: number;
  end: number;
}

export interface FormatResult {
  text: string;
  start: number;
  end: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/** 行内包裹的标签对：粗体 / 斜体 / 行内代码。 */
const INLINE_TAGS: Partial<Record<FormatKind, { open: string; close: string }>> = {
  bold: { open: "<strong>", close: "</strong>" },
  italic: { open: "<em>", close: "</em>" },
  code: { open: "<code>", close: "</code>" },
};

/** 选区外面是不是已经被同一对标签包着（再点一次就取消）。 */
function hasWrapper(
  text: string,
  start: number,
  end: number,
  open: string,
  close: string,
): boolean {
  if (start < open.length || text.length - end < close.length) return false;
  if (text.slice(start - open.length, start) !== open) return false;
  return text.slice(end, end + close.length) === close;
}

/** 粗体 / 斜体 / 行内代码：包住选区；已包住就取消；空选区时插入标签对并把光标放中间。 */
function wrapInline(
  text: string,
  start: number,
  end: number,
  open: string,
  close: string,
): FormatResult {
  const selected = text.slice(start, end);

  if (hasWrapper(text, start, end, open, close)) {
    const nextText =
      text.slice(0, start - open.length) + selected + text.slice(end + close.length);
    return {
      text: nextText,
      start: start - open.length,
      end: end - open.length,
    };
  }

  const nextText = text.slice(0, start) + open + selected + close + text.slice(end);
  // 空选区：光标落在两个标签之间，接着打字就是被包住的内容
  if (selected === "") {
    const cursor = start + open.length;
    return { text: nextText, start: cursor, end: cursor };
  }
  // 有选区：新选区仍然包住原来那几个字（不改变用户选中的东西）
  return {
    text: nextText,
    start: start + open.length,
    end: end + open.length,
  };
}

/**
 * 链接：有选中 → `<a href="url">选中</a>`；没选中 → `<a href="url"></a>`。
 * `url` 三个字被选中，直接打字即替换（与 Markdown 版同一套手感）。
 */
function insertLink(text: string, start: number, end: number): FormatResult {
  const selected = text.slice(start, end);
  const open = '<a href="url">';
  const nextText = `${text.slice(0, start)}${open}${selected}</a>${text.slice(end)}`;
  const urlStart = start + '<a href="'.length;
  return { text: nextText, start: urlStart, end: urlStart + "url".length };
}

/**
 * 代码块：插入 `<pre><code>` / 空行 / `</code></pre>`，**光标落在中间空行**。
 *
 * 光标不在行首 / 行尾时补换行，让代码块块级标签落在自己的行上（否则紧贴上一行正文，
 * 读源码时很难看）。
 */
function insertCodeBlock(text: string, start: number, end: number): FormatResult {
  const selected = text.slice(start, end);
  const needsLeadingNewline = start > 0 && text[start - 1] !== "\n";
  const needsTrailingNewline = end < text.length && text[end] !== "\n";

  const openPrefix = needsLeadingNewline ? "\n" : "";
  const closeSuffix = needsTrailingNewline ? "\n" : "";
  const openTag = "<pre><code>\n";
  const block = `${openPrefix}${openTag}${selected}\n</code></pre>${closeSuffix}`;
  const nextText = text.slice(0, start) + block + text.slice(end);

  // 空选区 → 光标在空的中间行；有选区 → 光标落在内容末尾
  const cursor = start + openPrefix.length + openTag.length + selected.length;
  return { text: nextText, start: cursor, end: cursor };
}

/** 选区覆盖到的那几行（含行首 / 行尾，不含换行符）。 */
function blockOf(text: string, start: number, end: number) {
  const lineStart = start === 0 ? 0 : text.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = text.indexOf("\n", end);
  const blockEnd = nextBreak === -1 ? text.length : nextBreak;
  return { lineStart, blockEnd, lines: text.slice(lineStart, blockEnd).split("\n") };
}

/**
 * 行级改写：每一行给一个「旧前缀 / 旧后缀 / 新前缀 / 新后缀」，行内内容原样平移。
 *
 * 位置映射按行算：光标在旧行标签外面时夹到内容开头；在内容里时保持相对位置；
 * 在行尾时落到新行尾。标题按钮用它把「`<h1>x</h1>` → `<h2>x</h2>`」的位移算回去。
 */
interface LineRewrite {
  next: string;
  oldPrefix: number;
  oldSuffix: number;
  newPrefix: number;
  newSuffix: number;
}

function rewriteBlock(
  text: string,
  lineStart: number,
  blockEnd: number,
  lines: string[],
  rewrites: LineRewrite[],
  start: number,
  end: number,
): FormatResult {
  const nextBlock = rewrites.map((item) => item.next).join("\n");
  const nextText = text.slice(0, lineStart) + nextBlock + text.slice(blockEnd);

  const map = (position: number): number => {
    let oldOffset = 0;
    let newOffset = 0;
    for (let index = 0; index < lines.length; index += 1) {
      const oldLength = lines[index].length;
      const newLength = rewrites[index].next.length;
      const within = position - lineStart - oldOffset;
      if (within <= oldLength) {
        const innerLength = Math.max(
          oldLength - rewrites[index].oldPrefix - rewrites[index].oldSuffix,
          0,
        );
        const innerOffset = Math.min(
          Math.max(within - rewrites[index].oldPrefix, 0),
          innerLength,
        );
        return Math.min(
          Math.max(
            lineStart + newOffset + rewrites[index].newPrefix + innerOffset,
            lineStart + newOffset,
          ),
          lineStart + newOffset + newLength,
        );
      }
      oldOffset += oldLength + 1;
      newOffset += newLength + 1;
    }
    return lineStart + nextBlock.length;
  };

  return { text: nextText, start: map(start), end: map(end) };
}

/**
 * 标题：选中行包 `<h1>…</h1>` 循环 → `<h2>` → `<h3>` → 去掉标签。
 * 已经是更高级别的（`<h4>` 及以上）按「去掉」处理，不会越套越深。
 */
function toggleHeading(text: string, start: number, end: number): FormatResult {
  const { lineStart, blockEnd, lines } = blockOf(text, start, end);
  const HEADING = /^<h([1-6])>(.*)<\/h\1>$/;

  const rewrites: LineRewrite[] = lines.map((line) => {
    const match = HEADING.exec(line);
    const level = match ? Number(match[1]) : 0;
    const inner = match ? match[2] : line;
    const target = level >= 3 ? 0 : level + 1;

    const oldPrefix = level === 0 ? 0 : `<h${level}>`.length;
    const oldSuffix = level === 0 ? 0 : `</h${level}>`.length;

    if (target === 0) {
      return { next: inner, oldPrefix, oldSuffix, newPrefix: 0, newSuffix: 0 };
    }
    const open = `<h${target}>`;
    const close = `</h${target}>`;
    return {
      next: `${open}${inner}${close}`,
      oldPrefix,
      oldSuffix,
      newPrefix: open.length,
      newSuffix: close.length,
    };
  });

  return rewriteBlock(text, lineStart, blockEnd, lines, rewrites, start, end);
}

const LIST_ITEM = /^\s*<li>([\s\S]*)<\/li>\s*$/;

/**
 * 无序 / 有序列表：选中行整块包成 `<ul>` / `<ol>`，每行一个 `<li>`。
 *
 * 已经是这样一个完整块（首行 `<ul>`、末行 `</ul>`、中间每行都是 `<li>`）时，
 * 再点一次就拆回纯文本行。整块操作的完成后选区覆盖改写后的整块。
 */
function toggleList(text: string, start: number, end: number, tag: "ul" | "ol"): FormatResult {
  const { lineStart, blockEnd, lines } = blockOf(text, start, end);
  const open = `<${tag}>`;
  const close = `</${tag}>`;

  const wrapped =
    lines.length >= 3 &&
    lines[0] === open &&
    lines[lines.length - 1] === close &&
    lines.slice(1, -1).every((line) => LIST_ITEM.test(line));

  if (wrapped) {
    const inner = lines.slice(1, -1).map((line) => LIST_ITEM.exec(line)?.[1] ?? line);
    const nextBlock = inner.join("\n");
    const nextText = text.slice(0, lineStart) + nextBlock + text.slice(blockEnd);
    return { text: nextText, start: lineStart, end: lineStart + nextBlock.length };
  }

  const nextBlock = `${open}\n${lines.map((line) => `  <li>${line}</li>`).join("\n")}\n${close}`;
  const nextText = text.slice(0, lineStart) + nextBlock + text.slice(blockEnd);
  return { text: nextText, start: lineStart, end: lineStart + nextBlock.length };
}

/**
 * 引用：选中行整块包成 `<blockquote>`（每行缩进两格）；已经是这个块就拆掉。
 */
function toggleQuote(text: string, start: number, end: number): FormatResult {
  const { lineStart, blockEnd, lines } = blockOf(text, start, end);

  const wrapped =
    lines.length >= 3 &&
    lines[0] === "<blockquote>" &&
    lines[lines.length - 1] === "</blockquote>" &&
    lines.slice(1, -1).every((line) => line.startsWith("  "));

  if (wrapped) {
    const inner = lines.slice(1, -1).map((line) => line.slice(2));
    const nextBlock = inner.join("\n");
    const nextText = text.slice(0, lineStart) + nextBlock + text.slice(blockEnd);
    return { text: nextText, start: lineStart, end: lineStart + nextBlock.length };
  }

  const nextBlock = `<blockquote>\n${lines.map((line) => `  ${line}`).join("\n")}\n</blockquote>`;
  const nextText = text.slice(0, lineStart) + nextBlock + text.slice(blockEnd);
  return { text: nextText, start: lineStart, end: lineStart + nextBlock.length };
}

/**
 * 工具栏的入口：把「一段文本 + 一个选区 + 一个按钮」算成新的文本和选区。
 *
 * 选区越界会自动夹回文本范围（textarea 的 `selectionStart` 永远在范围内，
 * 但纯函数不该假设调用方守规矩——测试与将来的快捷键都会直接调它）。
 */
export function applyFormat(
  text: string,
  selection: TextSelection,
  kind: FormatKind,
): FormatResult {
  const start = clamp(selection.start, 0, text.length);
  const end = clamp(selection.end, start, text.length);

  const inline = INLINE_TAGS[kind];
  if (inline) return wrapInline(text, start, end, inline.open, inline.close);

  switch (kind) {
    case "link":
      return insertLink(text, start, end);
    case "codeblock":
      return insertCodeBlock(text, start, end);
    case "heading":
      return toggleHeading(text, start, end);
    case "bullet":
      return toggleList(text, start, end, "ul");
    case "ordered":
      return toggleList(text, start, end, "ol");
    case "quote":
      return toggleQuote(text, start, end);
    default:
      return { text, start, end };
  }
}
