# HTML 编辑器

> **和 Markdown 编辑器一模一样的**多篇写作工具——左边文档列表、中间写源码、右边实时预览；
> 只把载体从 Markdown 换成 HTML：预览渲染的是真 HTML，导出 / 导入的是 `.html`。

| | |
|---|---|
| 入口 | `app/(app)/tools/html-editor/page.tsx`（一行薄壳）→ 实现住在本目录 `server/page.tsx` |
| 接口 | 无 HTTP 接口，数据入口是 Server Action（`server/actions.ts`） |
| 数据表 | `html_documents`（`docs/数据库/HTML文档表.md`）、`html_tags` / `html_document_tags`（`docs/数据库/HTML标签表.md`） |
| 状态 | ✅ 已上线（v0.13.13，2026-11-04 起） |

**这份 README 是这个工具唯一的文档**。它是 `features/markdown-editor/` 的**完整克隆**，所以只写与那份不同的部分；
界面骨架、左栏、标题行、标签条、版式开关、响应式、导入流程这些**逐条相同**的地方，直接看
`features/markdown-editor/README.md`（下面写作《Markdown 版》）——**改动本工具前先读那一份**。
原来的 `docs/功能/HTML编辑器.md` 已于 2026-11-05 并入本文件，章节编号保持不变。

---

## 一、要什么

本工具是 **Markdown 编辑器换载体的完整克隆**，不是「类似的东西」：功能清单、交互、布局、样式、文案规则
（除载体相关处）、空态、四档响应式全部照搬《Markdown 版》§一。这里**只列与它不同的部分**。

**做**

- 工具页 `/tools/html-editor`：三栏骨架、多篇 / 标题 / 自动保存 / 标签 / 批量删除 / 版式三档 / 拖拽分栏 / 四档响应式——全部同 Markdown 版。
- **落库**：三张独立新表 `html_documents` / `html_tags` / `html_document_tags`，按 `user_id` 隔离（**不碰** Markdown 版的三张表）。
- **预览**：`<iframe srcDoc sandbox="allow-scripts">` 渲染用户写的真 HTML；文档里的 `<style>` / `<script>` 只作用于这个 iframe。
- **格式工具栏**：仍是 9 个按钮、同样顺序与图标，动作从「插 Markdown 语法」换成「包 HTML 标签」（§2.4）。
- **导入**：`.html` / `.htm`（大小写不敏感）；文件 / 文件夹、逐篇串行、逆序入库、标题取文件名、撞名补序号、60 字截断、10 万字与 5MB 上限——规则全同《Markdown 版》§2.8。
- **导出 / 复制**：导出 `.html`（`text/html;charset=utf-8`，文件名取标题）；复制的是 HTML 源码。
- **工具接入四处**：`tool-catalog` 新增 `html-editor`（分类「开发」、图标 `Braces`）、`TOOL_TAB_SLUGS` 加同一个 slug、静态路由薄壳。

**主动放弃（Markdown 版已放弃的不重复列）**

| 放弃项 | 原因 |
|---|---|
| 源码语法高亮 / 标签对高亮 / 自动补全 | textarea 是纯文本，正是「输入即输出」的简单；要这些就得引编辑器内核（CodeMirror / Monaco） |
| HTML 格式化 / 美化（prettier） | 会改写用户敲的排版；本工具负责「存和看」，不负责「替他排版」 |
| 预览沙箱再收紧（CSP 注入 / 资源白名单） | 内容是他自己写的，iframe 的 unique origin 已经隔离了本站 DOM / cookie；再收紧只会让正常的 `<img>` / 样式加载不到 |
| 预览滚动位置保持 | `srcdoc` 每次更新会重载文档、滚回顶部（机制见 §七）；要保住得往用户文档注入通信脚本，第一版不值 |
| 预览里的链接改写 / 拦截 | 链接在 iframe 内按原样导航，不改 `target`、不做确认 |
| 渲染结果落库 | 同 Markdown 版：渲染是派生物，存下来就是两份真相 |
| 图片粘贴 / 目录 / 滚动同步 / 全文搜索 / 版本历史 / 协同 / 导入查重 / 编码嗅探 / 断点续传 | 与《Markdown 版》§一 放弃表逐条相同，理由不重复 |

**与 Markdown 版的对照（实现时按这张表逐项替换）**

| Markdown 版 | HTML 版 |
|---|---|
| 正文是 Markdown 原文（`#`、`-`、`**`） | 正文是 HTML 源码 |
| 预览用 `react-markdown` 解析，**刻意不渲染原始 HTML** | 预览用沙箱 iframe 渲染真 HTML |
| 工具栏插 `**` / `# ` / `- ` 等标记 | 工具栏包 `<strong>` / `<h1>` / `<ul>` 等标签 |
| 导入 `.md` / `.markdown` | 导入 `.html` / `.htm` |
| 导出 `.md`（`text/markdown`） | 导出 `.html`（`text/html`） |
| 表 `md_*` | 表 `html_*` |
| slug `markdown-editor` | slug `html-editor` |

---

## 二、界面

### 2.1 整体骨架

**逐条相同**：应用型页面、三栏各自滚动、整页不滚；左栏整列到底，右侧先一条横跨「编辑 + 预览」的标题行；
**没有 `ToolHeader`**；手机汉堡按钮住在标题行最左；`min-h-0` 的规矩照旧。
唯一区别是页签栏显示的名字：`HTML 编辑器`。

### 2.2 左栏（文档列表）

与 Markdown 版 §2.2 完全相同：新建 / 导入菜单 / 批量选择 / 搜索 / 标签筛选 / 行尾删除 / 空态，
包括「行尾删除常显」「批量选中范围 = 当前搜索结果」这些细节。

### 2.3 标题行

与 Markdown 版 §2.3 完全相同：汉堡 / 左栏开关（`FolderTree`）/ 标题输入框 / 三枚版式按钮 /
最右「新建」；删除不住在这一行（它跟着「哪一篇」走，在左栏行尾）。

### 2.4 中栏：编辑区

**工具栏**——9 个按钮的图标、顺序、`onMouseDown` 里 `preventDefault()` 的规矩与 Markdown 版相同，只是动作换成 HTML：

| # | 图标 | 作用 | 结果 |
|---|---|---|---|
| 1 | `Bold` | 粗体 | `<strong>选中</strong>`；再点一次拆掉 |
| 2 | `Italic` | 斜体 | `<em>选中</em>`；再点一次拆掉 |
| 3 | `Code` | 行内代码 | `<code>选中</code>`；再点一次拆掉 |
| 4 | `Heading` | 标题 | 选中行包 `<h1>…</h1>` → 再点 `<h2>` → `<h3>` → 去掉 |
| 5 | `List` | 无序列表 | 选中行整块变成 `<ul>` + 每行 `  <li>…</li>`；再点拆掉 |
| 6 | `ListOrdered` | 有序列表 | 同上，外层是 `<ol>` |
| 7 | `Quote` | 引用 | 选中行整块变成 `<blockquote>` + 每行缩进两格；再点拆掉 |
| 8 | `Code2` | 代码块 | 插入 `<pre><code>` / 空行 / `</code></pre>`，光标落在空行 |
| 9 | `Link` | 链接 | 有选中 → `<a href="url">选中</a>`；无选中 → `<a href="url"></a>`；`url` 被选中，直接打字即替换 |

- **选区规则**：行内按钮完成后选区仍包住原来那几个字；整块按钮完成后选区覆盖改写后的整块；代码块与链接把光标 / 选区落在可继续输入的位置。
- 空选区时行内按钮插入一对空标签并把光标放中间；没有按钮的写法（`<div>` / `<table>` / 注释）手打，预览照样渲染。
- **标签条、正文输入区、状态栏**同《Markdown 版》§2.4，只换两处文案：textarea 占位「在这里写 HTML…」；状态栏右侧「复制」「导出 .html」。
- 正文仍是原生 `<textarea>`、无行号、Tab 插两个空格、手机 16px。

### 2.5 右栏：实时预览

- 一个撑满右栏的 `<iframe>`：`className="h-full w-full border-0 bg-white"`、`title="HTML 预览"`、`srcDoc={deferredBody}`、`sandbox="allow-scripts"`。
- `deferredBody` 用 `useDeferredValue` 取快照——10 万字文档不能每敲一个字就重载整篇。
- 空正文（`trim() === ""`）时不渲染 iframe，显示灰字「预览会显示在这里」。
- **不注入任何基础样式**：预览就是浏览器对这个 HTML 的原样渲染（用户自己写 `<style>` 控制外观），本工具不替它加字体、边距或 reset。
- 不做滚动同步、不做目录、不做格式化、不做语法校验。

### 2.6 版式开关与分割条

与 Markdown 版 §2.6 完全相同：三档版式（仅编辑器 / 编辑器 + 预览 / **默认编辑器 + 预览**）、
可拖拽分割条（Pointer 事件 + 百分比 + 边界 360 / 320px、比例不持久化）、手机两档（仅编辑 / 仅预览）。

### 2.7 响应式

与 Markdown 版 §2.7 完全相同：四档断点（≥ 1280 / 1024–1279 / 768–1023 / < 768）、两级侧边栏的
展开方式（一级 `lg` 常驻 / `< lg` 汉堡抽屉；二级 `xl` 常驻 / `md–xl` 抽屉 / `< md` chip 条）、
浮层用 `absolute` 而不是 `fixed`（否则会盖住页签栏）。

### 2.8 导入

入口、菜单、两个选择器（`showDirectoryPicker` 优先 + `webkitdirectory` 回退）、排序、串行入库、
进度条、逆序入库、标题规则、跳过规则全部同 Markdown 版 §2.8，只换扩展名：

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

CREATE TABLE IF NOT EXISTS html_tags (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  name_key   TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, name_key)
);

CREATE TABLE IF NOT EXISTS html_document_tags (
  document_id INTEGER NOT NULL REFERENCES html_documents(id) ON DELETE CASCADE,
  tag_id      INTEGER NOT NULL REFERENCES html_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, tag_id)
) WITHOUT ROWID;
```

设计要点：

- **`body` 存 HTML 源码，不存渲染结果**：渲染是打开页面时现算的派生物。
- **三张表独立、不给 Markdown 表加 `kind` 列**：两个工具的生命周期互不牵连——Markdown 版已在线上，任何对它的改动都是白捡的回归风险；将来两边分叉也不会把一份数据模型拧成两套语义。代价是结构重复（见 §四）。
- 其余字段约定同 Markdown 版：`title` 独立一列、硬删 + 二次确认、`updated_at` 是排序唯一依据、`ORDER BY updated_at DESC, id DESC`、长度上限只在校验层（标题 60 / 正文 100000）。

---

## 四、关键决策

| 决策点 | 选择 | 理由 | 否决的备选 |
|---|---|---|---|
| 功能与界面的来源 | **完整克隆 Markdown 编辑器** | 主人明确要求「除了载体从 md 变成 html，其他全部一模一样」；照搬已被联调打磨过的交互，不重新设计 | 重新设计一套 HTML 专用界面（违背需求、白丢已有体验） |
| 代码组织 | **新开一份并列的 `features/html-editor/`** | 已上线工具零改动、零回归风险；两份代码同名同构，读者一眼能对上 | 把 Markdown 版抽成「通用编辑器组件 + 配置」（要动线上工具，回归面覆盖整个 Markdown 编辑器）；共用数据层传表名（SQL 拼接、类型参数化，两边互相牵连） |
| 数据表 | **三张独立表 `html_*`** | 两个工具的标签体系互相独立（Markdown 的「工作」标签不该出现在 HTML 工具里）；不动老表就不用迁移 | 共用 `md_documents` 加 `kind` 列（改老表 + 老查询全要带 `kind`，漏写就是串数据） |
| 预览渲染 | **`<iframe srcDoc sandbox="allow-scripts">`** | 预览必须渲染真 HTML；iframe 是独立文档，用户的 `<style>` 不会污染全站，脚本在 unique origin 里拿不到本站 DOM / cookie | `dangerouslySetInnerHTML`（用户 CSS 能改整个应用、脚本能读登录态）；DOMPurify（会删掉用户想写的 `<script>` / `<style>`，预览就不忠实）；Shadow DOM（CSS 能隔离，但内联事件处理器仍在页面上下文里执行，不是安全边界） |
| 预览里的脚本 | **允许执行（`allow-scripts`），绝不给 `allow-same-origin`** | 自己写的页面要能跑交互；不给 same-origin 时 iframe 是 opaque origin，`parent.document` 访问会报错，安全边界成立 | 完全禁脚本（HTML 里的交互永远看不到效果）；两个都开（等于没沙箱，脚本可直接操作父页面——**永久禁止**） |
| 工具栏语义 | **图标与顺序不变，动作改成包标签** | 保留「点一下改选区、再点取消」的肌肉记忆；输出的是合法 HTML 片段 | 插入空模板（`<ul><li></li></ul>`）（与「改写选中内容」的语义不符，选中的文字还得手动搬） |
| 导入扩展名 | **`.html` / `.htm`** | `.htm` 是同一格式的 Windows 老写法，用户确认要一起认 | 只认 `.html`（从旧 Windows 备份搬文件时会漏） |
| 正文上限 | **100000 字符，照搬** | 主人明确「10 万字上限照搬」 | 按 HTML 特点放宽（没有数据支撑） |
| 总览「常用工具」 | **先不加**，2026-11-04 主人要求后**加了**（当前 6 张：保险库 / 图片压缩 / Markdown / **HTML** / 音频提取 / 抖音下载） | 最初「新工具还没被用成常用，那格 5 张正好」；后来主人要求补齐，6 张 2 列三行排满 | 一直不加（与最终决定相反，这条只留作历史） |
| 工具目录图标 | `Braces` | 与 Markdown 版的 `FileCode` 区分开，又表达「源码」 | 复用 `FileCode`（两个工具卡长得太像）；`Code2`（工具栏里已用于「代码块」，含义会串） |

---

## 五、代码结构（三层）

**这就是原来的「文件落点」一节。** 结构与 `features/markdown-editor/` 一一对应，看那份的 §五 就知道这 31 个文件分别干什么。

`client/` —— 浏览器（`"use client"`）。不碰 db、不 import `server/`。

| 文件 | 职责 |
|---|---|
| `html-editor-view.tsx` | 页面主视图：状态中枢（当前文档、列表、搜索、批量、版式、导入） |
| `editor-top-bar.tsx` | 贯穿「编辑 + 预览」的标题行 |
| `view-mode-switch.tsx` | 版式三档开关 |
| `split-divider.tsx` / `split-divider.test.ts` | 可拖拽分割条 + 夹取逻辑单测 |
| `document-list.tsx` | 左栏（新建 / 导入菜单 / 批量 / 搜索 / 标签筛选 / 行尾删除 / 空态） |
| `document-list-overlays.tsx` | md–xl 抽屉 + <md 全屏列表 |
| `document-chips.tsx` | <md 的文档切换 chip 条 |
| `import-menu.tsx` | 导入按钮 + 菜单 + 隐藏 input + 读文件 |
| `editor-pane.tsx` | 中栏（工具栏 + textarea + 标签条 + 状态栏） |
| `format-toolbar.tsx` | 9 个格式按钮（包 HTML 标签） |
| `preview-pane.tsx` | 右栏：**沙箱 iframe 预览** |
| `tag-bar.tsx` / `tag-filter-select.tsx` / `tag-manager.tsx` | 标签条 / 左栏筛选 / 管理面板 |
| `use-autosave.ts` / `use-document-tags.ts` | 自动保存 / 标签状态与动作 |

`server/` —— 服务端。碰 db 的文件开头有 `import "server-only"`。

| 文件 | 职责 |
|---|---|
| `page.tsx` | 工具页接线：`requireUser()` → 取文档列表与标签 → 渲染视图 |
| `actions.ts` | Server Actions（`"use server"`）：文档 6 个 + 标签 5 个 |
| `documents.ts` / `documents.test.ts` | 文档数据访问（`server-only`，表名 `html_documents`）+ 单测 |
| `tags.ts` / `tags.test.ts` | 标签数据访问（`server-only`，`html_tags` / `html_document_tags`）+ 单测 |

`shared/` —— 两端共用，只碰纯数据。

| 文件 | 职责 |
|---|---|
| `tags.ts` | 标签类型与纯函数（归一化 / `/` 层级前缀匹配） |
| `validate.ts` / `validate.test.ts` | 校验（标题 60 / 正文 100000）+ 边界 |
| `format.ts` / `format.test.ts` | 工具栏纯函数：包 HTML 标签 |
| `export-name.ts` / `export-name.test.ts` | 导出 `.html` 文件名清洗 |
| `import.ts` / `import.test.ts` | 导入纯函数（`.html` / `.htm`、标题推导、撞名补序号） |

**从哪开始读**：与 Markdown 版同一顺序（`server/page.tsx` → `client/html-editor-view.tsx` → `server/actions.ts`）。

**混合体拆开**：`tags.ts` 同样是纯函数 + 数据访问拆成 `shared/tags.ts` 与 `server/tags.ts`。

**边界**：路由薄壳必须落在 `app/(app)/tools/html-editor/page.tsx`；`client/` 与 `shared/` 不 import `server/`
（`import type` 与 `"use server"` 的 actions 除外）；表结构唯一权威仍是 `initSchema()`；
**`react-markdown` / `remark-gfm` 与本工具无关**，不要引进来。

---

## 六、验收标准

**通用清单**：《Markdown 版》§六 的 1–16、16a–16i、17–23b、24–28a、29–30 逐条适用，只做三处替换：
① 正文里的 Markdown 语法换成 HTML 标签；② `.md` / `.markdown` 换成 `.html` / `.htm`；
③ 「复制 Markdown」「导出 .md」换成「复制」「导出 .html」。

**HTML 特有的验收**

31. 工具栏 9 钮：选中「文字」点 B → `<strong>文字</strong>`、选区仍包住；再点 → 恢复「文字」。斜体 / 行内代码同理。
32. 标题：光标在「标题」行点 H → `<h1>标题</h1>`；连点依次 `<h2>` / `<h3>`；第四次回到「标题」。多行选中时每行各自包一层。
33. 无序列表：选中两行点列表 → `<ul>` + 两条 `  <li>…</li>` + `</ul>`；再点拆回两行纯文本。有序列表同理。
34. 引用：选中一行点引用 → 包成 `<blockquote>`；再点拆掉。
35. 代码块：空行点 `Code2` → 插入 `<pre><code>` / 空行 / `</code></pre>`，光标落在空行。
36. 链接：选中「链接文字」点链接 → `<a href="url">链接文字</a>`，`url` 被选中。
37. 预览真渲染：输入 `<h1>标题</h1>` → 预览区出现浏览器默认样式的大号标题（不是字面量文本）。
38. 用户样式生效且**不外泄**：输入 `<style>body{background:#F5F5F5}</style><p>hi</p>` → 预览区背景变浅灰，**应用本身（左栏 / 标题行）背景不变**。
39. 脚本执行：输入 `<script>document.body.dataset.ran="1"</script><p>ok</p>` → 在 iframe 的文档上下文里 `dataset.ran === "1"`。
40. 沙箱隔离：输入 `<script>parent.document.body.style.display="none"</script>` → 应用界面**不消失**、iframe 内控制台报跨域错误；`<script>alert(1)</script>` → 不弹窗（未开 `allow-modals`）。
41. 空态：正文清空后预览区回到「预览会显示在这里」，不出现空白 iframe。
42. 复制 → 剪贴板是 HTML 源码逐字一致（含标签）；导出 `.html` → 内容逐字一致，空标题时文件名「未命名文档.html」。
43. 导入 `.htm` 能进库，标题为文件名去扩展名；同批混入 `.md` / `.png` → 静默忽略，toast 只报导入篇数。
44. 一批只有 `.md` → toast「没有可导入的 .html 文件」，列表一篇没多。
45. 数据隔离：A 建两篇、B 查列表 → 0 篇；B 用 A 的 id 保存 / 删除 → 影响 0 行。
46. 未登录访问 → 跳 `/login`；正文 100001 字符 / 标题 61 字 → 服务端拒绝、输入不清空，改短后能存。
47. 页签栏：打开工具后出现「HTML 编辑器」页签，能切走、能关；`/tools` 卡片可点。
48. 门禁：`next typegen` / `typecheck` / `lint` / `test` / `build` 全过。

---

## 七、已知的坑

| 坑 | 机制 | 对策 |
|---|---|---|
| 预览每次更新滚回顶部 | 改 `srcdoc` = 让 iframe 重新加载文档，滚动位置必然重置；父页面又读不到 iframe 内部（unique origin），没法保存 / 恢复 | **接受这个行为**（已写进放弃表）；要修得往用户文档注入 postMessage 脚本 |
| `allow-scripts` + `allow-same-origin` 一起给 = 沙箱失效 | 同源 + 脚本意味着可以 `parent.document...`，等于没有隔离 | **永远不要加 `allow-same-origin`**；父页面读不到 iframe 文档是安全边界的正常代价 |
| `alert()` 在预览里不弹 | `sandbox` 默认没有 `allow-modals` | 预期行为，不是 bug；要弹窗就开 `allow-modals`（目前不做） |
| React 的 iframe 属性名是 `srcDoc` | React 对 DOM 属性用 camelCase | 写 `srcDoc={…}`；写成 `srcdoc` 会被当未知属性透传、更新不生效 |
| 预览里的相对链接 / 图片以父页面 URL 为基准 | `srcdoc` 文档的 base URL 继承父文档 | 预期行为；要绝对路径就写绝对 URL |
| 文档最开头写 `<script>` 时 `document.body` 是 null | HTML 解析规则：开头的 `<script>` 会进 `<head>`，此时 `<body>` 还没创建（验收踩到：脚本静默不生效） | 脚本放在正文元素之后，或用 `DOMContentLoaded` 包住 |
| 长文档每次更新都重载 iframe | `srcdoc` 变化触发整篇重新解析 | `useDeferredValue` 取快照（同 Markdown 版）；不做更细的增量更新 |
| 用户样式里的 `body{overflow:hidden}` 只影响 iframe | iframe 是独立文档 | 正常；预览区自己的滚动条始终可用 |
| 导入的 HTML 里有 `<script>` 会执行 | 预览允许脚本（自己的内容） | 已知且接受；不要打开来源不明的 HTML 文件。要收紧就删掉 `allow-scripts`，但那样预览不了交互 |
| 其余坑与 Markdown 版相同 | `FileList` 清空顺序、`showDirectoryPicker` 手势、`webkitdirectory` 类型、1MB 请求体、iOS 16px 缩放、输入法拼字、保存乱序…… | 见《Markdown 版》§七，本工具照同样方式实现 |

---

## 八、依赖变更

**不新增依赖。** 预览用原生 `<iframe>`，不引入 `react-markdown` / `remark-gfm`（那是 Markdown 工具专用的），
也不引入编辑器内核与消毒库。

---

## 变更记录

| 日期 | 改动 |
|---|---|
| 2026-11-04 | 初版：Markdown 编辑器的 HTML 载体克隆。三张独立表 `html_*`；预览用沙箱 iframe（`allow-scripts`、不给 `allow-same-origin`）；9 钮改成包 HTML 标签；导入 `.html` / `.htm`；Markdown 版零改动 |
| 2026-11-04 | v0.13.13 上线（工具目录 9 → 10），真机验收 1440 / 1100 / 375 三档全过；默认版式改「编辑器 + 预览」（与 Markdown 版统一）；总览「常用工具」卡加入 HTML 编辑器（6 张） |
| 2026-11-05 | 垂直迁移：文件搬进 `features/html-editor/{client,server,shared}`，`tags.ts` 按纯 / 不纯拆开，原 `docs/功能/HTML编辑器.md` 并入本文件 |
