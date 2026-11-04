# HTML 编辑器

| 状态 | 开始日期 | 最近更新 |
|---|---|---|
| ✅ 已上线（v0.13.13） | 2026-11-04 | 2026-11-04 |

> 一句话：**和《功能/Markdown编辑器》一模一样**的多篇写作工具——左边文档列表、中间写源码、右边实时预览；只把载体从 Markdown 换成 HTML：预览渲染的是真 HTML，导出 / 导入的是 `.html`。

---

## 一、要什么

本工具是 **Markdown 编辑器换载体的完整克隆**，不是「类似的东西」。功能清单、交互、布局、样式、文案规则（除载体相关处）、空态、四档响应式全部照搬《功能/Markdown编辑器》§一，这里**只列与它不同的部分**：

**做：**

- 工具页 `/tools/html-editor`：三栏骨架、左栏文档列表、中栏源码、右栏实时预览；多篇 / 标题 / 自动保存 / 标签 / 批量删除 / 版式三档 / 拖拽分栏 / 四档响应式全部同 Markdown 版
- **落库**：三张独立新表 `html_documents` / `html_tags` / `html_document_tags`，按 `user_id` 隔离（不碰 Markdown 版的三张表）
- **预览**：`<iframe>` + `srcdoc` + `sandbox="allow-scripts"` 渲染用户写的真 HTML；用户文档里的 `<style>` / `<script>` 只作用于这个 iframe
- **格式工具栏**：仍是 9 个按钮、同样顺序与图标，动作从「插 Markdown 语法」换成「包 HTML 标签」（§2.4）
- **导入**：`.html` / `.htm`（大小写不敏感）；文件 / 文件夹、逐篇串行、逆序入库、标题取文件名、撞名补序号、60 字截断、10 万字与 5MB 上限——规则全同 Markdown 版 §2.8
- **导出 / 复制**：导出 `.html`（`text/html;charset=utf-8`，文件名取标题）；复制的是 HTML 源码
- **工具接入四处**：`tool-catalog` 新增 `html-editor`（分类「开发」、状态「可用」、图标 `Braces`）；`tab-routes` 的 `TOOL_TAB_SLUGS` 加同一个 slug；静态路由 `/tools/html-editor`

**主动放弃（Markdown 版已放弃的不重复列）：**

| 放弃项 | 原因 |
|---|---|
| 源码语法高亮 / 标签对高亮 / 自动补全 | textarea 是纯文本，正是「输入即输出」的简单；要这些就得引编辑器内核（CodeMirror / Monaco），为一个个人工具不值 |
| HTML 格式化 / 美化（prettier） | 会改写用户敲的排版；本工具负责「存和看」，不负责「替他排版」 |
| 预览的脚本沙箱再收紧（CSP 注入 / 资源白名单） | 内容是他自己写的，iframe 的 unique origin 已经隔离了本站 DOM / cookie；再收紧只会让正常的 `<img>` / 样式加载不到 |
| 预览滚动位置保持 | `srcdoc` 每次更新会重载文档、滚回顶部（机制见 §七）；要保住得往用户文档里注入通信脚本，第一版不值这个复杂度 |
| 预览里的链接改写 / 拦截 | 链接在 iframe 内按原样导航，不改 `target`、不做确认 |
| 渲染结果落库 | 同 Markdown 版：渲染是派生物，存下来就是两份真相 |
| 其它（图片粘贴、目录、滚动同步、全文搜索、版本历史、协同、导入查重、编码嗅探、断点续传……） | 与《功能/Markdown编辑器》§一 的放弃表逐条相同，理由不重复 |

**与 Markdown 版的对照（实现时按这张表逐项替换）：**

| Markdown 版 | HTML 版 |
|---|---|
| 正文是 Markdown 原文（`#`、`-`、`**`） | 正文是 HTML 源码 |
| 预览用 `react-markdown` 解析，**刻意不渲染原始 HTML** | 预览用沙箱 iframe 渲染真 HTML |
| 工具栏插 `**` / `# ` / `- ` 等标记 | 工具栏包 `<strong>` / `<h1>` / `<ul>` 等标签 |
| 导入 `.md` / `.markdown` | 导入 `.html` / `.htm` |
| 导出 `.md`（`text/markdown`） | 导出 `.html`（`text/html`） |
| 状态栏「复制」「导出 .md」 | 状态栏「复制」「导出 .html」 |
| 表 `md_documents` / `md_tags` / `md_document_tags` | 表 `html_documents` / `html_tags` / `html_document_tags` |
| `lib/markdown` + `components/tools/markdown` | `lib/html` + `components/tools/html` |
| slug `markdown-editor` | slug `html-editor` |

---

## 二、界面

### 2.1 整体骨架

与《功能/Markdown编辑器》§2.1 逐条相同：**应用型页面**、三栏各自滚动、整页不滚；左栏整列到底，右侧先一条横跨「编辑 + 预览」的标题行；**没有 `ToolHeader`**；手机汉堡按钮住在标题行最左；`min-h-0` 的规矩照旧。

唯一区别是页签栏显示的名字：`HTML 编辑器`。

### 2.2 左栏 / 2.3 标题行

与《功能/Markdown编辑器》§2.2 / §2.3 完全相同（新建 / 导入菜单 / 批量选择 / 搜索 / 标签筛选 / 行尾删除 / 空态；标题输入框 / 版式开关 / 左栏开关 / 新建）。文案里的「未命名文档」「删除文档」等一律沿用。

### 2.4 中栏：编辑区

**工具栏**（`h-9`，`bg-[#FAFAFA]`，一行横向滚动不换行）——9 个按钮的图标、顺序、`onMouseDown` 里 `preventDefault()` 的规矩与 Markdown 版相同，只是动作换成 HTML：

| 顺序 | 图标 | 作用 | 结果 |
|---|---|---|---|
| 1 | `Bold` | 粗体 | `<strong>选中</strong>`；再点一次拆掉 |
| 2 | `Italic` | 斜体 | `<em>选中</em>`；再点一次拆掉 |
| 3 | `Code` | 行内代码 | `<code>选中</code>`；再点一次拆掉 |
| 4 | `Heading` | 标题 | 选中行包 `<h1>…</h1>` → 再点 `<h2>` → `<h3>` → 去掉标签 |
| 5 | `List` | 无序列表 | 选中行整块变成 `<ul>` + 每行 `  <li>…</li>`；再点一次拆掉外层与 `<li>` |
| 6 | `ListOrdered` | 有序列表 | 同上，外层是 `<ol>` |
| 7 | `Quote` | 引用 | 选中行整块变成 `<blockquote>` + 每行缩进两格；再点一次拆掉 |
| 8 | `Code2` | 代码块 | 插入 `<pre><code>`、空行、`</code></pre>` 三行，光标落在空行 |
| 9 | `Link` | 链接 | 有选中 → `<a href="url">选中</a>`；无选中 → `<a href="url"></a>`；`url` 被选中，直接打字即替换 |

- **选区规则**：行内按钮（粗体 / 斜体 / 行内代码）完成后选区仍包住原来那几个字；整块按钮（标题 / 列表 / 引用）完成后选区覆盖改写后的整块；代码块与链接把光标 / 选区落在可继续输入的位置（与 Markdown 版的承诺一致）
- 空选区时行内按钮插入一对空标签并把光标放中间
- 没有按钮的写法（`<div>`、`<table>`、注释等）手打，预览照样渲染
- 工具栏最右端常驻的「预览」开关（`Eye`）与 Markdown 版相同
- **标签条、正文输入区、状态栏**与《功能/Markdown编辑器》§2.4 相同，只换两处文案：
  - textarea 占位：「在这里写 HTML…」
  - 状态栏右侧：「复制」「导出 .html」（`aria-label` / `title` 同步；< sm 收成图标）
- 正文仍然是**原生 `<textarea>`**、无行号、Tab 插两个空格、手机 16px——理由同 Markdown 版

### 2.5 右栏：实时预览

- 一个撑满右栏的 `<iframe>`：`className="h-full w-full border-0 bg-white"`、`title="HTML 预览"`、`srcDoc={deferredBody}`、`sandbox="allow-scripts"`
- `deferredBody` 用 `useDeferredValue` 取快照——10 万字文档不能每敲一个字就重载整篇
- 空正文（`trim() === ""`）时不渲染 iframe，显示灰字「预览会显示在这里」（`text-[13px] italic text-[#C4C4C4]`）
- **不注入任何基础样式**：预览就是浏览器对这个 HTML 的原样渲染（用户自己写 `<style>` 控制外观）；本工具不替它加字体、边距或 reset
- 不做滚动同步、不做目录、不做格式化、不做语法校验

### 2.6 版式开关 / 2.7 响应式

与《功能/Markdown编辑器》§2.6 / §2.7 完全相同：三档版式（仅编辑器 / 编辑器 + 预览 / 仅预览，**默认编辑器 + 预览**）、可拖拽分割条（比例不持久化、边界 360 / 320px）、手机两档（仅编辑 / 仅预览）、四档断点（≥1280 / 1024–1279 / 768–1023 / <768）与抽屉 / chip 条的两级侧边栏行为。

### 2.8 导入

入口、菜单、两个选择器（`showDirectoryPicker` 优先 + `webkitdirectory` 回退）、排序、串行入库、进度条、逆序入库、标题规则、跳过规则全部同《功能/Markdown编辑器》§2.8，只换扩展名：

- 过滤只认 `.html` / `.htm`（大小写不敏感），其它文件静默忽略
- 空批 toast：「没有可导入的 .html 文件」
- 多选文件的 `accept=".html,.htm"`

---

## 三、数据模型

```sql
CREATE TABLE IF NOT EXISTS html_documents (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  body       TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_html_documents_user_id ON html_documents(user_id);

CREATE TABLE IF NOT EXISTS html_tags (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  name_key   TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, name_key)
);

CREATE INDEX IF NOT EXISTS idx_html_tags_user_id ON html_tags(user_id);

CREATE TABLE IF NOT EXISTS html_document_tags (
  document_id INTEGER NOT NULL REFERENCES html_documents(id) ON DELETE CASCADE,
  tag_id      INTEGER NOT NULL REFERENCES html_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, tag_id)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_html_document_tags_tag ON html_document_tags(tag_id);
```

设计要点：

- **`body` 存 HTML 源码，不存渲染结果**：渲染是打开页面时现算的派生物（同 Markdown 版 §三）
- **三张表独立、不给 Markdown 表加 `kind` 列**：两个工具的生命周期互不牵连——Markdown 版已在线上，任何对它的改动都是白捡的回归风险；将来两边分叉（工具栏、预览、导入规则）也不会把一份数据模型拧成两套语义。代价是结构重复，见 §四
- 其余字段约定同 Markdown 版：`title` 独立一列、硬删 + 二次确认、`updated_at` 是排序唯一依据、`ORDER BY updated_at DESC, id DESC`、长度上限只在校验层（标题 60 / 正文 100000）

---

## 四、关键决策

| 决策点 | 选择 | 理由 | 否决的备选 |
|---|---|---|---|
| 功能与界面的来源 | **完整克隆 Markdown 编辑器**（文档引用 + 代码并列复制） | 主人明确要求「除了载体从 md 变成 html，其他全部一模一样」；照搬已被联调打磨过的交互，不重新设计 | 重新设计一套 HTML 专用界面（违背需求、白丢已有体验） |
| 代码组织 | **新开 `lib/html` + `components/tools/html`，与 markdown 版并列** | 已上线工具零改动、零回归风险；两份代码同名同构，读者一眼能对上 | 把 `components/tools/markdown` 抽成「通用编辑器组件 + 配置」（要动线上工具，回归面覆盖整个 Markdown 编辑器）；共用 `lib` 数据层传表名（SQL 拼接、类型参数化，两边互相牵连） |
| 数据表 | **三张独立表 `html_*`** | 两个工具的标签体系互相独立（Markdown 的「工作」标签不该出现在 HTML 工具里）；不动老表就不用迁移 | 共用 `md_documents` 加 `kind` 列（改老表 + 老查询全要带 `kind`，任何漏写都是串数据）；只有文档共用、标签分开（两套语义混在一张表里） |
| 预览渲染 | **`<iframe srcdoc sandbox="allow-scripts">`** | 预览必须渲染真 HTML；iframe 是独立文档，用户的 `<style>` 不会污染全站，脚本在 unique origin 里拿不到本站 DOM / cookie | `dangerouslySetInnerHTML`（同文档：用户 CSS 能改整个应用、脚本能读登录态）；DOMPurify 消毒（会删掉用户想写的 `<script>` / `style`，预览就不忠实）；Shadow DOM（CSS 能隔离，但内联事件处理器仍在页面上下文里执行，不是安全边界） |
| 预览里的脚本 | **允许执行（`allow-scripts`），绝不给 `allow-same-origin`** | 自己写的页面要能跑交互（按钮、`document.write` 之类）；不给 same-origin 时 iframe 是 opaque origin，`parent.document` 访问会报错，安全边界成立 | 完全禁脚本（HTML 里的交互永远看不到效果）；`allow-scripts` + `allow-same-origin`（等于没沙箱，脚本可直接操作父页面——**永久禁止**） |
| 工具栏语义 | **图标与顺序不变，动作改成包标签**；整块操作完成后选区覆盖整块 | 保留「点一下改选区、再点取消」的肌肉记忆；输出的是合法 HTML 片段 | 插入空模板（`<ul><li></li></ul>`）（与原工具栏「改写选中内容」的语义不符，选中的文字还得手动搬） |
| 导入扩展名 | **`.html` / `.htm`** | `.htm` 是同一格式的 Windows 老写法，用户确认要一起认 | 只认 `.html`（从旧 Windows 备份搬文件时会漏） |
| 正文上限 | **100000 字符，照搬** | 主人明确「10 万字上限照搬」；HTML 比 Markdown 啰嗦，真不够用再单独调 | 按 HTML 特点放宽（没有实际数据支撑，先不动） |
| 总览「常用工具」 | **不加 HTML 编辑器** | 主人明确「先不加」；新工具还没被用成常用，那格 5 张正好 | 加第 6 张（只是填满网格，不是需求） |
| 工具目录图标 | `Braces` | 与 Markdown 版的 `FileCode` 区分开，又表达「源码」；该图标项目里未用过 | 复用 `FileCode`（两个工具卡长得太像）；`Code2`（工具栏里已用于「代码块」，含义会串） |

---

## 五、文件落点

```
src/lib/html/
├── documents.ts        文档数据访问（表名 html_documents）
├── tags.ts             标签数据访问（html_tags / html_document_tags）
├── validate.ts         服务端校验（与 Markdown 版同值：60 / 100000）
├── format.ts           工具栏纯函数 applyFormat(text, selection, kind)（HTML 标签版）
├── export-name.ts      导出文件名清洗（逻辑与 Markdown 版相同）
├── import.ts           导入纯函数（.html / .htm、标题推导、撞名补序号）
├── actions.ts          Server Actions（文档 6 个 + 标签 5 个，每个都先 requireUser）
└── *.test.ts           对应单测（format 重写；documents / tags / validate / export-name / import 换表名与扩展名）

src/components/tools/html/
├── html-editor-view.tsx      页面主视图（状态中枢）
├── editor-top-bar.tsx        贯穿「编辑 + 预览」的标题行
├── view-mode-switch.tsx      版式三档开关
├── split-divider.tsx         可拖拽分割条
├── document-list.tsx         左栏
├── import-menu.tsx           导入按钮 + 菜单 + 读文件
├── document-list-overlays.tsx 抽屉 / 手机全屏列表
├── document-chips.tsx        手机文档 chip 条
├── editor-pane.tsx           中栏（工具栏 + textarea + 标签条 + 状态栏）
├── format-toolbar.tsx        9 个格式按钮
├── preview-pane.tsx          右栏（沙箱 iframe）
├── tag-bar.tsx               编辑区标签条
├── tag-filter-select.tsx     左栏标签下拉
├── tag-manager.tsx           标签管理面板
├── use-autosave.ts           自动保存 hook
├── use-document-tags.ts      标签状态与动作
└── split-divider.test.ts     分割条夹取单测

src/app/(app)/tools/html-editor/page.tsx   路由（requireUser + 取列表 + 传初值）
src/lib/auth/db.ts                         initSchema() 里加**三张表**（html_*）
src/components/tools/tool-catalog.ts       新增一条工具记录（9 → 10）
src/components/layout/tab-routes.ts        TOOL_TAB_SLUGS 加 "html-editor"
```

约束（沿用项目规矩）：

1. `src/lib/` 下不 import React 组件；数据访问与 Server Action 可以，视图不行
2. 表结构唯一权威仍是 `initSchema()`
3. 路由必须落在 `src/app/(app)/tools/html-editor/`
4. 预览只 import 原生 iframe，**不引入任何 Markdown 渲染依赖**；`react-markdown` / `remark-gfm` 不在本工具使用

---

## 六、验收标准

**通用清单**：《功能/Markdown编辑器》§六 的 **1–16、16a–16i、17–23b、24–28a、29–30** 逐条适用，只做三处替换：

1. 正文里的 Markdown 语法换成 HTML 标签（例如第 4 条改成「输入 `<h1>标题</h1>` → 预览里出现大号标题」）
2. `.md` / `.markdown` 换成 `.html` / `.htm`（导入、导出、文件名）
3. 「复制 Markdown」「导出 .md」换成「复制」「导出 .html」

**HTML 特有的验收：**

31. 工具栏 9 钮：选中「文字」点 B → 正文变 `<strong>文字</strong>`、选区仍包住「文字」；再点 B → 恢复「文字」。（斜体 / 行内代码同理）
32. 标题：光标在「标题」行点 H → `<h1>标题</h1>`；连点依次 `<h2>`、`<h3>`；第四次回到「标题」。多行选中时每行各自包一层。
33. 无序列表：选中两行点列表 → 变成 `<ul>` + 两条 `  <li>…</li>` + `</ul>`；再点一次拆回两行纯文本。有序列表同理（`<ol>`）。
34. 引用：选中一行点引用 → 包成 `<blockquote>`；再点拆掉。
35. 代码块：光标在空行点 `Code2` → 插入 `<pre><code>` / 空行 / `</code></pre>`，光标落在空行（直接打字就在代码块里）。
36. 链接：选中「链接文字」点链接 → `<a href="url">链接文字</a>`，`url` 被选中（直接打字即替换）。
37. 预览真渲染：输入 `<h1>标题</h1>` → 预览区出现浏览器默认样式的大号标题（不是字面量文本）。
38. 用户样式生效且不外泄：输入 `<style>body{background:#F5F5F5}</style><p>hi</p>` → 预览区背景变浅灰；**应用本身（左栏 / 标题行）的背景不变**。
39. 脚本执行：输入 `<script>document.body.dataset.ran="1"</script><p>ok</p>` → 在 iframe 的文档上下文里 `document.body.dataset.ran === "1"`（DevTools 选中 iframe 查看）。
40. 沙箱隔离：输入 `<script>parent.document.body.style.display="none"</script>` → 应用界面**不消失**，iframe 内控制台报跨域 / 权限错误；再输入 `<script>alert(1)</script>` → 不弹窗（`allow-modals` 未开）。
41. 空态：正文清空后预览区回到「预览会显示在这里」，不出现一块空白 iframe。
42. 复制：点「复制」→ 剪贴板是 HTML 源码逐字一致（含标签）。
43. 导出：点「导出 .html」→ 下载 `<标题>.html`，内容与正文逐字一致；标题为空时文件名「未命名文档.html」。
44. 导入 `.htm`：一个 `.htm` 文件能进库，标题为文件名去扩展名；同一批里混入 `.md` / `.png` → 静默忽略，toast 只报导入篇数。
45. 导入扩展名过滤：一批只有 `.md` 的文件 → toast「没有可导入的 .html 文件」，列表一篇没多。
46. 数据隔离：A 用户建两篇 HTML 文档、B 用户查列表 → 0 篇；B 用 A 的 id 保存 / 删除 → 影响 0 行（单测 + 手工各一遍）。
47. 未登录访问 `/tools/html-editor` → 跳 `/login`。
48. 正文 100001 字符 / 标题 61 字 → 服务端拒绝、状态栏「保存失败，重试」、输入不被清空；改短后能存。
49. 页签栏：打开工具后出现「HTML 编辑器」页签，能切走、能关；`/tools` 卡片可点。
50. 门禁：`pnpm exec next typegen` / `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm build` 全过。

---

## 七、已知的坑

| 坑 | 机制 | 对策 |
|---|---|---|
| 预览每次更新滚回顶部 | 改 `srcdoc` = 让 iframe 重新加载文档，滚动位置必然重置；父页面又读不到 iframe 内部（unique origin），没法保存 / 恢复 | **接受这个行为**（已写进放弃表）；要修得往用户文档里注入 postMessage 脚本，第一版不做 |
| `allow-scripts` + `allow-same-origin` 一起给 = 沙箱失效 | 同源 + 脚本意味着可以 `parent.document...`，等于没有隔离 | **永远不要加 `allow-same-origin`**；父页面读不到 iframe 文档是安全边界的正常代价 |
| `alert()` 在预览里不弹 | `sandbox` 默认没有 `allow-modals` | 预期行为，不是 bug；需要弹窗就开 `allow-modals`（目前不做） |
| React 的 iframe 属性名是 `srcDoc` | React 对 DOM 属性用 camelCase | 写 `srcDoc={<body>}`；写成 `srcdoc` 会被当成未知属性透传，更新不生效 |
| 预览里的相对链接 / 图片以父页面 URL 为基准 | `srcdoc` 文档的 base URL 继承父文档 | 预期行为；要绝对路径就写绝对 URL |
| 文档最开头写 `<script>` 时 `document.body` 是 null | HTML 解析规则：文档开头的 `<script>` 会被放进 `<head>`，此时 `<body>` 还没创建（验收时踩到：脚本静默不生效） | 脚本放在正文元素之后（如 `<p>…</p><script>…</script>`），或用 `DOMContentLoaded` 包住 |
| 长文档每次更新都重载 iframe | `srcdoc` 变化触发整篇重新解析 | 用 `useDeferredValue` 取快照，和 Markdown 版同一套；不做更细的增量更新 |
| 用户样式里的 `body{overflow:hidden}` 等只影响 iframe | iframe 是独立文档 | 正常；预览区自己的滚动条始终可用 |
| 导入的 HTML 里有 `<script>` 会执行 | 预览允许脚本（自己的内容） | 已知且接受；不要打开来源不明的 HTML 文件。要收紧就删掉 `allow-scripts`，但那样预览不了交互 |
| 剩下的坑与 Markdown 版相同 | `FileList` 清空顺序、`showDirectoryPicker` 手势、`webkitdirectory` 类型、1MB 请求体、iOS 16px 缩放、输入法拼字、保存乱序…… | 见《功能/Markdown编辑器》§七，本工具照同样方式实现 |

---

## 八、依赖变更

**不新增依赖。** 预览用原生 `<iframe>`，不引入 `react-markdown` / `remark-gfm`（那是 Markdown 工具专用的），也不引入编辑器内核与消毒库。

---

## 更新记录

| 日期 | 改动 |
|---|---|
| 2026-11-04 | **默认版式改为「编辑器 + 预览」**（与 Markdown 版统一）；总览「常用工具」卡加入 HTML 编辑器（6 张，2 列三行排满） |
| 2026-11-04 | **v0.13.13 上线**（工具目录 9 → 10）；真机验收 1440 / 1100 / 375 三档全过 |
| 2026-11-04 | 初版：Markdown 编辑器的 HTML 载体克隆。三张独立表 `html_*`；预览用沙箱 iframe（`allow-scripts`、不给 `allow-same-origin`）；工具栏 9 钮改为包 HTML 标签；导入 `.html` / `.htm`、导出 `.html`；代码并列复制（`lib/html` + `components/tools/html`），Markdown 版零改动；总览「常用工具」不加、正文上限照搬 100000 字符 |
