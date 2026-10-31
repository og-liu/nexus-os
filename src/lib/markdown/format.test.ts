import { describe, expect, it } from "vitest";
import { applyFormat, type FormatKind, type TextSelection } from "./format";

/**
 * 格式工具栏纯函数的用例（《功能/Markdown编辑器》§六 验收 6–10、§六 验收 30）。
 *
 * 每个用例都拿「操作前的文本 + 选区」进来，断言「操作后的文本 + 选区」出去——
 * 选区一起断言，是因为「选区仍包住原来那几个字」和「光标落在 url 上」都是需求的一部分，
 * 只断言文本会漏掉一半的行为。
 */

function format(
  text: string,
  selection: TextSelection,
  kind: FormatKind,
): { text: string; selected: string; start: number; end: number } {
  const result = applyFormat(text, selection, kind);
  return {
    text: result.text,
    selected: result.text.slice(result.start, result.end),
    start: result.start,
    end: result.end,
  };
}

describe("行内标记：粗体 / 斜体 / 行内代码", () => {
  it("粗体包住选区，新选区仍包住原来那几个字", () => {
    const result = format("hello world", { start: 6, end: 11 }, "bold");
    expect(result.text).toBe("hello **world**");
    expect(result.selected).toBe("world");
  });

  it("已有粗体再点一次取消（选区里外各去掉两颗星）", () => {
    const result = format("hello **world**", { start: 8, end: 13 }, "bold");
    expect(result.text).toBe("hello world");
    expect(result.selected).toBe("world");
  });

  it("斜体用一颗星；**粗体** 里的字点斜体不会被当成「已有斜体」拆掉粗体", () => {
    const plain = format("hello world", { start: 6, end: 11 }, "italic");
    expect(plain.text).toBe("hello *world*");
    expect(plain.selected).toBe("world");

    // 选区在 **粗体** 内部：斜体是「套一层」，不是「取消」
    const inside = format("**bold**", { start: 2, end: 6 }, "italic");
    expect(inside.text).toBe("***bold***");
    expect(inside.selected).toBe("bold");
  });

  it("行内代码用反引号包住，再点取消", () => {
    const wrap = format("run ls now", { start: 4, end: 6 }, "code");
    expect(wrap.text).toBe("run `ls` now");
    expect(wrap.selected).toBe("ls");

    const unwrap = format("run `ls` now", { start: 5, end: 7 }, "code");
    expect(unwrap.text).toBe("run ls now");
    expect(unwrap.selected).toBe("ls");
  });

  it("选区为空时插入一对标记，光标落在中间（接着打字就是内容）", () => {
    const bold = applyFormat("ab", { start: 1, end: 1 }, "bold");
    expect(bold.text).toBe("a****b");
    expect(bold.start).toBe(3);
    expect(bold.end).toBe(3);

    const code = applyFormat("", { start: 0, end: 0 }, "code");
    expect(code.text).toBe("``");
    expect(code.start).toBe(1);
  });

  it("跨行选区：整段被包住，换行原样保留", () => {
    const result = format("line1\nline2", { start: 0, end: 11 }, "bold");
    expect(result.text).toBe("**line1\nline2**");
    expect(result.selected).toBe("line1\nline2");
  });
});

describe("标题：行首 # 循环", () => {
  it("空行连点四次：`# ` → `## ` → `### ` → 去掉", () => {
    let text = "";
    let cursor = 0;

    for (const expected of ["# ", "## ", "### ", ""]) {
      const result = applyFormat(text, { start: cursor, end: cursor }, "heading");
      text = result.text;
      cursor = result.start;
      expect(text).toBe(expected);
    }
    // 光标始终在新前缀之后（点了之后直接打字就是标题内容）
    expect(cursor).toBe(0);
  });

  it("光标停在有内容的行首时补 `# `，光标落在前缀之后", () => {
    const result = applyFormat("标题", { start: 0, end: 0 }, "heading");
    expect(result.text).toBe("# 标题");
    expect(result.start).toBe(2);
  });

  it("已经是四级标题时按「去掉」处理，不会叠成 `# #### x`", () => {
    const result = applyFormat("#### 深一层", { start: 0, end: 0 }, "heading");
    expect(result.text).toBe("深一层");
  });

  it("跨行选区：每一行都套同一级标题", () => {
    const result = format("一\n二", { start: 0, end: 3 }, "heading");
    expect(result.text).toBe("# 一\n# 二");
  });
});

describe("行前缀：无序列表 / 有序列表 / 引用", () => {
  it("无序列表补 `- `，再点一次去掉", () => {
    const add = format("一\n二", { start: 0, end: 3 }, "bullet");
    expect(add.text).toBe("- 一\n- 二");

    const remove = format(add.text, { start: 0, end: 7 }, "bullet");
    expect(remove.text).toBe("一\n二");
  });

  it("有序列表多行按 1. 2. 编号，再点去掉编号", () => {
    const add = format("一\n二\n三", { start: 0, end: 5 }, "ordered");
    expect(add.text).toBe("1. 一\n2. 二\n3. 三");

    const remove = format(add.text, { start: 0, end: 14 }, "ordered");
    expect(remove.text).toBe("一\n二\n三");
  });

  it("引用补 `> `，位于空行时也有前缀", () => {
    expect(format("", { start: 0, end: 0 }, "quote").text).toBe("> ");
    expect(format("说句话", { start: 0, end: 0 }, "quote").text).toBe("> 说句话");
    expect(format("> 说句话", { start: 0, end: 0 }, "quote").text).toBe("说句话");
  });

  it("只动选区覆盖到的行，别的行一个字符都不变", () => {
    const text = "第一行\n第二行\n第三行";
    const result = format(text, { start: 4, end: 7 }, "bullet");
    expect(result.text).toBe("第一行\n- 第二行\n第三行");
  });
});

describe("代码块 / 链接", () => {
  it("代码块插入三行，光标落在中间那行", () => {
    const result = applyFormat("", { start: 0, end: 0 }, "codeblock");
    expect(result.text).toBe("```\n\n```");
    expect(result.start).toBe(4);
    expect(result.text.slice(0, result.start).endsWith("\n")).toBe(true);
  });

  it("光标在行中时补换行：围栏独占整行（否则 Markdown 不认闭合围栏）", () => {
    const result = applyFormat("abc", { start: 3, end: 3 }, "codeblock");
    expect(result.text).toBe("abc\n```\n\n```");
    expect(result.start).toBe(8);
  });

  it("有选区：把选中的内容整段包进代码块", () => {
    const result = applyFormat("abc", { start: 0, end: 3 }, "codeblock");
    expect(result.text).toBe("```\nabc\n```");
    expect(result.start).toBe(7);
  });

  it("链接：选中文字变成 `[文字](url)`，光标落在 url 上", () => {
    const result = format("see here now", { start: 4, end: 8 }, "link");
    expect(result.text).toBe("see [here](url) now");
    expect(result.selected).toBe("url");
    expect(result.start).toBeGreaterThan(result.text.indexOf("("));
  });

  it("链接：没有选中时得到 `[](url)`，光标同样落在 url 上", () => {
    const result = format("", { start: 0, end: 0 }, "link");
    expect(result.text).toBe("[](url)");
    expect(result.selected).toBe("url");
  });
});

describe("选区越界", () => {
  it("起点 / 终点超出文本范围时夹回边界，不抛异常", () => {
    const result = format("abc", { start: -5, end: 99 }, "bold");
    expect(result.text).toBe("**abc**");
    expect(result.selected).toBe("abc");
  });

  it("终点小于起点时按「空选区」处理（不产生负长度选区）", () => {
    const result = applyFormat("abc", { start: 2, end: 0 }, "bullet");
    expect(result.text).toBe("- abc");
    expect(result.start).toBeLessThanOrEqual(result.end);
  });

  it("9 个按钮都不会抛错：空文本 + 空选区逐个跑一遍", () => {
    const kinds: FormatKind[] = [
      "bold",
      "italic",
      "code",
      "heading",
      "bullet",
      "ordered",
      "quote",
      "codeblock",
      "link",
    ];
    for (const kind of kinds) {
      const result = applyFormat("", { start: 0, end: 0 }, kind);
      expect(typeof result.text).toBe("string");
      expect(result.start).toBeGreaterThanOrEqual(0);
      expect(result.end).toBeGreaterThanOrEqual(result.start);
      expect(result.end).toBeLessThanOrEqual(result.text.length);
    }
  });
});
