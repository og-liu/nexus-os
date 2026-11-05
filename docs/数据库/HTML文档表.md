# HTML 文档表（html_documents）

> **一行 = 一篇 HTML 文档。** 它回答的问题是：「这个人写过哪几篇页面 / 片段、最近改的是哪篇、里面写的是什么？」

| 状态 | 建立 | 最近更新 |
|---|---|---|
| ✅ 已完成 | 2026-11-04 | 2026-11-04 |

## 一、怎么理解它

结构和《数据库/Markdown文档表》**逐字段相同**，只是载体从 Markdown 原文换成了 HTML 源码：

- Markdown 文档：正文是 `# 标题`、`- 列表` 这类 Markdown 原文
- HTML 文档：正文是 `<h1>标题</h1>`、`<ul><li>…` 这类 HTML 源码

`body` 里存的是**用户敲进去的 HTML 源码**，不是渲染好的页面快照。渲染只在打开页面时现算——存渲染结果等于同一个事实存两份。

**为什么另起一张表，而不是给 `md_documents` 加一个 `kind` 列**：两个工具的生命周期互不牵连（Markdown 版已在线上，动它就是白捡的回归风险）；标签体系也应该各自独立。代价是结构重复，这是主动选的那一边（features/html-editor/README.md §四）。

## 二、这张表管什么

- **新建文档**：加一行（`title` + `body` 初始 `''` + `user_id` + 两个时间）
- **自动保存**：改 `title` 或 `body`，同时刷新 `updated_at`——列表排序依据
- **删除文档**：硬删 + 界面二次确认，没有软删除、没有回收站
- **列表**：按 `updated_at DESC, id DESC` 读这个人的全部文档
- **打开一篇**：按 `id` 读一行
- 它**不**记录字数、不记录渲染结果、不记录版本

## 三、建表 SQL 原文

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
```

## 四、逐字段说明

| 字段 | 类型 | 约束 | 含义（人话） | 为什么这么设计 |
|---|---|---|---|---|
| `id` | INTEGER | 主键，自增 | 这篇文档的内部编号 | `AUTOINCREMENT` 保证编号永不复用 |
| `user_id` | INTEGER | NOT NULL，外键 → `users.id`，级联删除 | 这篇文档属于谁 | 账户隔离写进数据层；删账号不留无主文档 |
| `title` | TEXT | NOT NULL | 文档标题，显示在左栏 | 独立一列，不从正文推导（HTML 里不一定有 `<h1>`）；留空补「未命名文档」，重名补序号 |
| `body` | TEXT | NOT NULL，默认 `''` | 正文，HTML 源码 | 存原文不存渲染结果；上限 100000 字符只在校验层 |
| `created_at` | INTEGER | NOT NULL | 什么时候建的（毫秒） | 保存不动它 |
| `updated_at` | INTEGER | NOT NULL | 最后一次保存的时间（毫秒） | 左栏排序的唯一依据 |

## 五、索引

| 索引 | 服务于哪个查询 |
|---|---|
| `idx_html_documents_user_id` | 左栏列表 `WHERE user_id = ?`。SQLite 不为外键自动建索引 |

排序（`ORDER BY updated_at DESC`）不单独建索引：单人的文档在几十篇量级，扫一遍比维护复合索引划算。

## 六、常用查询

```sql
-- 左栏列表：最近改的在最上面
SELECT id, title, updated_at
FROM html_documents
WHERE user_id = 1
ORDER BY updated_at DESC, id DESC;

-- 打开一篇
SELECT * FROM html_documents WHERE id = 7 AND user_id = 1;

-- 自动保存
UPDATE html_documents
SET title = '落地页', body = '<h1>Hello</h1>', updated_at = 1761812345678
WHERE id = 7 AND user_id = 1;
```

`WHERE ... AND user_id = ?` 不是可选项：每一条读、写、删都带它，越权就变成「影响行数 0」。

## 七、常见疑问

**问：为什么不和 Markdown 文档共用一张表？**
答：两个工具的正文格式、预览方式、导入规则、标签体系都会各自演化（HTML 版要不要支持 `<script>`、Markdown 版要不要支持数学公式，互不相干）。共用一张表后，任何一边加列都要考虑另一边；加 `kind` 列还会让老表所有查询都要带上它，漏一处就是串数据。

**问：为什么没有 `deleted_at`？**
答：软删除的代价是此后每条查询都得带 `WHERE deleted_at IS NULL`。便签 / 保险库 / Markdown 编辑器都是硬删 + 二次确认，这里保持一致。

**问：标题为什么不唯一？**
答：文档靠 `id` 认，不靠名字认；两篇都叫「灵感」是合法的。导入由机器起名时才补序号。

## 八、变更记录

- 2026-11-04：建表（HTML 编辑器）。字段与 `md_documents` 相同，表名与库内领域独立。
