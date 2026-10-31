# Markdown 文档表（md_documents）

> **一行 = 一篇 Markdown 文档。** 它回答的问题是：「这个人写过哪几篇、最近改的是哪篇、里面写的是什么？」

| 状态 | 建立 | 最近更新 |
|---|---|---|
| ✅ 已完成 | 2026-10-30 | 2026-10-30 |

## 一、怎么理解它

便签是**贴完就忘的随手记**，这张表是**要留下来、要再打开的文档**。两者的分界线不是长度，是「有没有标题」和「会不会回头改」：

- 便签：只有一段正文，写完就不管，找它靠时间和置顶
- Markdown 文档：有标题（列表靠它认人），正文是一整篇 Markdown 原文，会反复改、会导出给别人

`body` 里存的是**用户敲进去的 Markdown 原文**（`#`、`-`、`**` 这些符号都在），不是渲染好的 HTML。渲染是打开页面时现算的——存渲染结果等于同一个事实存两份，改了一处另一处就不同步。

## 二、这张表管什么

- **新建文档**：加一行（`title` + `body` 初始 `''` + `user_id` + 两个时间）
- **自动保存**：改 `title` 或 `body`，同时把 `updated_at` 刷新成当前时间——这是列表排序的依据
- **删除文档**：删掉这一行（硬删 + 界面二次确认，没有软删除、没有回收站）
- **列表**：按 `updated_at DESC, id DESC` 读这个人的全部文档（左栏）
- **打开一篇**：按 `id` 读一行
- 它**不**记录「文档有多长」「有几个字」——字数是打开时用 `[...body].length` 现算的，存下来就要在每次保存时同步维护，而它没有任何查询价值

## 三、建表 SQL 原文

```sql
CREATE TABLE IF NOT EXISTS md_documents (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  body       TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_md_documents_user_id ON md_documents(user_id);
```

## 四、逐字段说明

| 字段 | 类型 | 约束 | 含义（人话） | 为什么这么设计 |
|---|---|---|---|---|
| `id` | INTEGER | 主键，自增 | 这篇文档的内部编号 | 与其它表同款：`AUTOINCREMENT` 保证编号永不复用，删掉的文档不会把号让给下一篇 |
| `user_id` | INTEGER | NOT NULL，外键 → `users.id`，级联删除 | 这篇文档属于谁 | 现在只有一个用户，但归属从第一天就写进数据里；以后加人不用改表。级联删除保证删账号时不留无主文档 |
| `title` | TEXT | NOT NULL | 文档标题，显示在左栏列表里 | **独立一列，不从正文的 `# 标题` 推导**：列表要显示它、搜索也搜它，而用户完全可以不写 H1。留空时服务端补成「未命名文档」（重名补序号），所以它永远有值，`NOT NULL` 成立。上限 60 字只在校验层 |
| `body` | TEXT | NOT NULL，默认 `''` | 正文，Markdown 原文 | 存原文不存渲染结果（见 §一）。默认 `''` 而不是 NULL：新建文档就是一篇空文档，「空」和「没有正文」在这里不需要区分。上限 100000 字符只在校验层——SQLite 的长度约束在改表时很难受，而这两个数以后可能调 |
| `created_at` | INTEGER | NOT NULL | 什么时候建的（毫秒时间戳） | 与 `updated_at` 一起才看得出「这篇写了多久」。保存**不动它** |
| `updated_at` | INTEGER | NOT NULL | 最后一次保存的时间（毫秒时间戳） | 左栏排序的唯一依据，也是「最近动过的是哪篇」的唯一事实 |

## 五、索引

| 索引 | 服务于哪个查询 |
|---|---|
| `idx_md_documents_user_id` | 左栏列表 `WHERE user_id = ?`。SQLite **不会**为外键自动建索引，不建就是全表扫（《数据库/README》§四） |

排序（`ORDER BY updated_at DESC`）没有单独建索引：一个人的文档数量在几十篇量级，扫一遍比维护一个复合索引更划算，等真的慢了再加。

## 六、常用查询

```sql
-- 左栏列表：这个人写的全部文档，最近改的在最上面
SELECT id, title, updated_at
FROM md_documents
WHERE user_id = 1
ORDER BY updated_at DESC, id DESC;

-- 打开一篇
SELECT * FROM md_documents WHERE id = 7 AND user_id = 1;

-- 自动保存（保存时 title 与 body 一起写，或者只写其中一个）
UPDATE md_documents
SET title = '周报', body = '# 这周做了什么', updated_at = 1761812345678
WHERE id = 7 AND user_id = 1;

-- 重名检查（新建「未命名文档」时数一遍已有几个）
SELECT title FROM md_documents WHERE user_id = 1 AND title LIKE '未命名文档%';
```

`WHERE ... AND user_id = ?` 不是可选项：每一条读、写、删都带它，越权就变成「影响行数 0」。

## 七、常见疑问

**问：为什么不存渲染好的 HTML？打开就不用再解析了。**
答：因为渲染结果是**派生物**。存一份 HTML 就有两份真相——改了原文忘了改 HTML，页面显示的就是旧内容；而且两边的 Markdown 解析器版本一旦不同（以后换成别的库），库里的 HTML 就成了历史垃圾。渲染只在打开时算，算一千次也只花几十毫秒。

**问：为什么没有 `deleted_at`（软删除 / 回收站）？**
答：软删除的代价是这张表**此后每一条查询**都得带 `WHERE deleted_at IS NULL`，漏一处就是「删掉的文档又冒出来」。便签、保险库都是硬删 + 界面二次确认，这里保持一致。真需要回收站时再加，那时是一次性的迁移。

**问：为什么没有 `pinned` / 收藏？**
答：排序已经回答了「哪篇最重要」——最近写的那篇。置顶是给「列表很长、需要钉住几条」的场景准备的，现在一个人的文档几十篇，翻两下就到。要做也是加一列 `pinned`，不影响现在的结构。

**问：标题为什么不做唯一约束？**
答：用户想让两篇都叫「灵感」是合法的——文档靠 `id` 认，不靠名字认。`(user_id, name)` 唯一的规矩只在保险库的群组上用，因为那里名字是**导航**，两个同名群组会让人猜。

**问：`body` 这么长，SQLite 扛得住吗？**
答：`TEXT` 没有长度上限（SQLite 单行默认上限 1GB），10 万字在一行里就是几百 KB 的文本，读写都是毫秒级。真正的瓶颈在浏览器的渲染，不在库。

## 八、变更记录

- 2026-10-30：**表已落库**（`initSchema()`）；字段、索引与本文 §三 的建表 SQL 逐字一致，没有补列、没有迁移
- 2026-10-30：建表（Markdown 编辑器 v0.9.x 设计稿）。一张表、四个业务列，没有软删除、没有版本历史。
