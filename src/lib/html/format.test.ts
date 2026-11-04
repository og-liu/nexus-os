import { describe, expect, it } from "vitest";
import { applyFormat, type FormatKind } from "./format";

/**
 * HTML 编辑器工具栏的纯函数（《功能/HTML编辑器》§六 验收 31–36）。
 *
 * 断言方式是「文本 + 选区包住哪几个字」两件一起看：只比文本会漏掉
 * 「格式打到了光标处而不是选中的字上」这类错误（那正是项目里踩过的坑）。
 */

function selected(text: string, start: number, end: number): string {
  return text.slice(start, end);
}

describe("applyFormat：行内标签（粗体 / 斜体 / 行内代码）", () => {
  it("粗体：包住选区，选区仍包住原来那几个字", () => {
    const result = applyFormat("你好文字世界", { start: 2, end: 4 }, "bold");
    expect(result.text).toBe("你好<strong>文字</strong>世界");
    expect(selected(result.text, result.start, result.end)).toBe("文字");
  });

  it("粗体再点一次取消，选区回到原处", () => {
    const wrapped = "你好<strong>文字</strong>世界";
    const result = applyFormat(wrapped, { start: 10, end: 12 }, "bold");
    expect(result.text).toBe("你好文字世界");
    expect(selected(result.text, result.start, result.end)).toBe("文字");
  });

  it("斜体 / 行内代码各用自己的一对标签", () => {
    expect(applyFormat("abc", { start: 0, end: 1 }, "italic").text).toBe("<em>a</em>bc");
    expect(applyFormat("abc", { start: 0, end: 1 }, "code").text).toBe("<code>a</code>bc");
  });

  it("空选区：插入一对空标签，光标落在两个标签中间", () => {
    const result = applyFormat("", { start: 0, end: 0 }, "bold");
    expect(result.text).toBe("<strong></strong>");
    expect(result.start).toBe(8);
    expect(result.end).toBe(8);
  });

  it("选中范围越界时自动夹回文本范围", () => {
    const result = applyFormat("abc", { start: -5, end: 99 }, "bold");
    expect(result.text).toBe("<strong>abc</strong>");
  });
});

describe("applyFormat：标题", () => {
  it("<h1> → <h2> → <h3> → 去掉标签，选区始终包住原标题字", () => {
    let result = applyFormat("标题", { start: 0, end: 2 }, "heading");
    expect(result.text).toBe("<h1>标题</h1>");
    expect(selected(result.text, result.start, result.end)).toBe("标题");

    result = applyFormat(result.text, { start: result.start, end: result.end }, "heading");
    expect(result.text).toBe("<h2>标题</h2>");
    expect(selected(result.text, result.start, result.end)).toBe("标题");

    result = applyFormat(result.text, { start: result.start, end: result.end }, "heading");
    expect(result.text).toBe("<h3>标题</h3>");

    result = applyFormat(result.text, { start: result.start, end: result.end }, "heading");
    expect(result.text).toBe("标题");
    expect(selected(result.text, result.start, result.end)).toBe("标题");
  });

  it("已经是 <h4> 及以上时按「去掉」处理，不会越套越深", () => {
    const result = applyFormat("<h4>标题</h4>", { start: 4, end: 6 }, "heading");
    expect(result.text).toBe("标题");
  });

  it("多行：每一行各自包一层，行数与顺序不变", () => {
    const result = applyFormat("一\n二", { start: 0, end: 3 }, "heading");
    expect(result.text).toBe("<h1>一</h1>\n<h1>二</h1>");
  });
});

describe("applyFormat：列表", () => {
  it("无序列表：整块变成 <ul> + 每行一个 <li>，选区覆盖整块", () => {
    const result = applyFormat("一\n二", { start: 0, end: 3 }, "bullet");
    expect(result.text).toBe("<ul>\n  <li>一</li>\n  <li>二</li>\n</ul>");
    expect(selected(result.text, result.start, result.end)).toBe(result.text);
  });

  it("无序列表再点一次拆回纯文本行", () => {
    const wrapped = "<ul>\n  <li>一</li>\n  <li>二</li>\n</ul>";
    const result = applyFormat(wrapped, { start: 0, end: wrapped.length }, "bullet");
    expect(result.text).toBe("一\n二");
    expect(selected(result.text, result.start, result.end)).toBe("一\n二");
  });

  it("有序列表用 <ol>，同样可来回切换", () => {
    const result = applyFormat("一\n二", { start: 0, end: 3 }, "ordered");
    expect(result.text).toBe("<ol>\n  <li>一</li>\n  <li>二</li>\n</ol>");

    const back = applyFormat(result.text, { start: result.start, end: result.end }, "ordered");
    expect(back.text).toBe("一\n二");
  });
});

describe("applyFormat：引用", () => {
  it("整块包成 <blockquote>，再点一次拆掉", () => {
    const result = applyFormat("引用", { start: 0, end: 2 }, "quote");
    expect(result.text).toBe("<blockquote>\n  引用\n</blockquote>");
    expect(selected(result.text, result.start, result.end)).toBe(result.text);

    const back = applyFormat(result.text, { start: result.start, end: result.end }, "quote");
    expect(back.text).toBe("引用");
  });

  it("多行引用每行都缩进两格", () => {
    const result = applyFormat("一\n二", { start: 0, end: 3 }, "quote");
    expect(result.text).toBe("<blockquote>\n  一\n  二\n</blockquote>");
  });
});

describe("applyFormat：代码块与链接", () => {
  it("代码块：插入三行，光标落在中间空行", () => {
    const result = applyFormat("", { start: 0, end: 0 }, "codeblock");
    expect(result.text).toBe("<pre><code>\n\n</code></pre>");
    expect(result.start).toBe("<pre><code>\n".length);
  });

  it("代码块：有选中内容时包住它，光标落在内容末尾", () => {
    const result = applyFormat("x", { start: 0, end: 1 }, "codeblock");
    expect(result.text).toBe("<pre><code>\nx\n</code></pre>");
    expect(result.text[result.start - 1]).toBe("x");
  });

  it("代码块：光标不在行首时补一个前置换行", () => {
    const result = applyFormat("a", { start: 1, end: 1 }, "codeblock");
    expect(result.text.startsWith("a\n<pre><code>")).toBe(true);
  });

  it("链接：有选中 → <a href=\"url\">选中</a>，url 被选中", () => {
    const result = applyFormat("链接文字", { start: 0, end: 4 }, "link");
    expect(result.text).toBe('<a href="url">链接文字</a>');
    expect(selected(result.text, result.start, result.end)).toBe("url");
  });

  it("链接：无选中时生成空壳，url 仍被选中", () => {
    const result = applyFormat("ab", { start: 1, end: 1 }, "link");
    expect(result.text).toBe('a<a href="url"></a>b');
    expect(selected(result.text, result.start, result.end)).toBe("url");
  });
});

describe("applyFormat：边界", () => {
  const KINDS: FormatKind[] = [
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

  it("9 个按钮都不会抛错：空文本 + 空选区逐个跑一遍", () => {
    for (const kind of KINDS) {
      expect(() => applyFormat("", { start: 0, end: 0 }, kind)).not.toThrow();
    }
  });

  it("多行选区的列表操作不会动到选区外的行", () => {
    const text = "上\n一\n二\n下";
    const result = applyFormat(text, { start: 2, end: 5 }, "bullet");
    expect(result.text.startsWith("上\n<ul>")).toBe(true);
    expect(result.text.endsWith("</ul>\n下")).toBe(true);
  });
});
