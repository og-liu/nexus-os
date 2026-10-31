/**
 * 格式工具栏的纯函数（《功能/Markdown编辑器》§四、§六 验收 6–10）。
 *
 * `applyFormat(text, selection, kind)` 只做一件事：**算出新文本和新选区**，
 * 不碰 DOM、不碰 React，因此可以逐条单测（含「已加粗再点一次取消」「跨行选区」这种反向）。
 * 调用方负责把结果写回 textarea 并恢复选区。
 *
 * 为什么不做成编辑器组件库：Markdown 原文与输入框内容本来就一一对应，
 * 一个纯函数改写 + 原生 textarea 就够了；引 CodeMirror / Monaco 是几十万行依赖，
 * 为一个个人写作工具不值（同 §四「编辑控件」）。
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

/** 行内包裹的标记：粗体两颗星、斜体一颗、行内代码一个反引号。 */
const INLINE_MARKERS: Partial<Record<FormatKind, string>> = {
  bold: "**",
  italic: "*",
  code: "`",
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/** 选区外面是不是已经被同一对标记包着（再点一次就取消）。 */
function hasWrapper(text: string, start: number, end: number, marker: string): boolean {
  if (start < marker.length || text.length - end < marker.length) return false;
  if (text.slice(start - marker.length, start) !== marker) return false;
  if (text.slice(end, end + marker.length) !== marker) return false;
  // 单颗 `*` 不能把 `**粗体**` 的两颗星拆成一颗，否则点斜体会把粗体改坏
  if (marker === "*" && (text[start - 2] === "*" || text[end + 1] === "*")) return false;
  return true;
}

/** 粗体 / 斜体 / 行内代码：包住选区；已包住就取消；空选区时插入标记并把光标放中间。 */
function wrapInline(
  text: string,
  start: number,
  end: number,
  marker: string,
): FormatResult {
  const selected = text.slice(start, end);

  if (hasWrapper(text, start, end, marker)) {
    const nextText =
      text.slice(0, start - marker.length) + selected + text.slice(end + marker.length);
    return {
      text: nextText,
      start: start - marker.length,
      end: end - marker.length,
    };
  }

  const nextText = text.slice(0, start) + marker + selected + marker + text.slice(end);
  // 空选区：光标落在两个标记之间，接着打字就是被包住的内容
  if (selected === "") {
    const cursor = start + marker.length;
    return { text: nextText, start: cursor, end: cursor };
  }
  // 有选区：新选区仍然包住原来那几个字（不改变用户选中的东西）
  return {
    text: nextText,
    start: start + marker.length,
    end: end + marker.length,
  };
}

/** 链接：有选中 → `[选中](url)`；没选中 → `[](url)`。光标落在 `url` 上，直接打字即替换。 */
function insertLink(text: string, start: number, end: number): FormatResult {
  const selected = text.slice(start, end);
  const nextText = `${text.slice(0, start)}[${selected}](url)${text.slice(end)}`;
  const urlStart = start + selected.length + 3; // `[` + 选中 + `](`
  return { text: nextText, start: urlStart, end: urlStart + "url".length };
}

/**
 * 代码块：插入 / 包住三行围栏，**光标落在中间那行**（直接打字就是在代码块里写）。
 *
 * 围栏必须独占整行，否则 Markdown 不认（` ```abc ` 不是闭合围栏，后面的正文会被吞掉）。
 * 所以光标不在行首 / 行尾时补换行，让代码块落在自己的三行上。
 */
function insertCodeBlock(text: string, start: number, end: number): FormatResult {
  const selected = text.slice(start, end);
  const needsLeadingNewline = start > 0 && text[start - 1] !== "\n";
  const needsTrailingNewline = end < text.length && text[end] !== "\n";

  const openPrefix = needsLeadingNewline ? "\n" : "";
  const closeSuffix = needsTrailingNewline ? "\n" : "";
  const block = `${openPrefix}\`\`\`\n${selected}\n\`\`\`${closeSuffix}`;
  const nextText = text.slice(0, start) + block + text.slice(end);

  // 空选区 → 光标在空的中间行；有选区 → 光标落在内容末尾
  const cursor = start + openPrefix.length + 4 + selected.length;
  return { text: nextText, start: cursor, end: cursor };
}

/**
 * 行级改写：只动选区覆盖到的那几行，光标 / 选区按每行的位移换算回去。
 *
 * 行级按钮（标题 / 列表 / 引用）都是「行首加一段前缀」或「去掉一段前缀」，
 * 前缀只出现在行首，所以同一行内的相对位置不变——按行换算即可。
 */
function transformLines(
  text: string,
  start: number,
  end: number,
  transform: (lines: string[]) => string[],
): FormatResult {
  const lineStart = start === 0 ? 0 : text.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = text.indexOf("\n", end);
  const blockEnd = nextBreak === -1 ? text.length : nextBreak;

  const lines = text.slice(lineStart, blockEnd).split("\n");
  const nextLines = transform(lines);
  const nextBlock = nextLines.join("\n");
  const nextText = text.slice(0, lineStart) + nextBlock + text.slice(blockEnd);

  const mapPosition = (position: number): number => {
    let oldOffset = 0;
    let newOffset = 0;
    for (let index = 0; index < lines.length; index += 1) {
      const oldLength = lines[index].length;
      const newLength = nextLines[index].length;
      if (position - lineStart <= oldOffset + oldLength) {
        // 行内相对位置不变，整行的位移（前缀加了 / 去掉了几个字）平移到这一行上：
        // 光标在行首 → 落在新前缀之后；光标在行尾 → 落在行尾（含前缀删掉的情况）
        const within = Math.min(Math.max(position - lineStart - oldOffset, 0), oldLength);
        const mapped = lineStart + newOffset + within + (newLength - oldLength);
        return Math.min(Math.max(mapped, lineStart + newOffset), lineStart + newOffset + newLength);
      }
      oldOffset += oldLength + 1;
      newOffset += newLength + 1;
    }
    return lineStart + nextBlock.length;
  };

  return { text: nextText, start: mapPosition(start), end: mapPosition(end) };
}

/**
 * 标题：行首 `# ` 循环 → `## ` → `### ` → 去掉。
 * 已经是更高级别的（`#### `）按「去掉」处理，不会叠成 `# #### x`。
 */
function toggleHeading(text: string, start: number, end: number): FormatResult {
  return transformLines(text, start, end, (lines) => {
    const match = /^(#{1,6}) /.exec(lines[0] ?? "");
    const level = match ? match[1].length : 0;
    const target = level >= 3 ? 0 : level + 1;

    return lines.map((line) => {
      const stripped = line.replace(/^#{1,6} /, "");
      return target === 0 ? stripped : `${"#".repeat(target)} ${stripped}`;
    });
  });
}

/** 无序列表 / 引用：所有行都已经带前缀 → 去掉；否则补上（已有的那行不动）。 */
function toggleLinePrefix(
  text: string,
  start: number,
  end: number,
  marker: string,
): FormatResult {
  return transformLines(text, start, end, (lines) => {
    const allPresent = lines.every((line) => line.startsWith(marker));
    if (allPresent) return lines.map((line) => line.slice(marker.length));
    return lines.map((line) => (line.startsWith(marker) ? line : `${marker}${line}`));
  });
}

/** 有序列表：多行时按 1. 2. 3. 编号；已经全是编号 → 去掉编号。 */
function toggleOrdered(text: string, start: number, end: number): FormatResult {
  return transformLines(text, start, end, (lines) => {
    const allPresent = lines.every((line) => /^\d+\. /.test(line));
    if (allPresent) return lines.map((line) => line.replace(/^\d+\. /, ""));

    let counter = 0;
    return lines.map((line) => {
      counter += 1;
      return `${counter}. ${line.replace(/^\d+\. /, "")}`;
    });
  });
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

  const marker = INLINE_MARKERS[kind];
  if (marker) return wrapInline(text, start, end, marker);

  switch (kind) {
    case "link":
      return insertLink(text, start, end);
    case "codeblock":
      return insertCodeBlock(text, start, end);
    case "heading":
      return toggleHeading(text, start, end);
    case "bullet":
      return toggleLinePrefix(text, start, end, "- ");
    case "quote":
      return toggleLinePrefix(text, start, end, "> ");
    case "ordered":
      return toggleOrdered(text, start, end);
    default:
      return { text, start, end };
  }
}
