# HTML 标签表（html_tags / html_document_tags）

> **一行 = 这个人的一个标签**（`html_tags`），以及**一篇 HTML 文档挂了哪个标签**（`html_document_tags`）。它们回答的问题是：「这些文档该分几类、某一篇属于哪几类、某个类下有哪些篇？」

| 状态 | 建立 | 最近更新 |
|---|---|---|
| ✅ 已完成 | 2026-11-04 | 2026-11-04 |

## 一、怎么理解它

这两张表与《数据库/Markdown标签表》**结构与规则完全相同**，只是关联的是 HTML 文档：

- 标签是交叉归属：一篇可以同时挂 `工作` 和 `重要`
- 层级靠名字里的 `/`：`工作/周报` 是 `工作` 的子标签，筛选 `工作` 时前缀命中
- 一个标签都不挂是合法状态

**标签按工具独立**：Markdown 工具里建的 `工作` 不会出现在 HTML 工具里。两个工具的文档集合不同，标签只是各自的索引；混在一起会让筛选结果横跨两个工具，语义就乱了。

## 二、这两张表管什么

- **建标签**：`html_tags` 加一行（第一次打某个名字时顺手建出来）
- **给文档打标签**：`html_document_tags` 加一行（文档 id + 标签 id）
- **取消某个标签**：删掉关联行；文档不动
- **删整个标签**：删 `html_tags` 那一行，关联级联删掉——**文档一篇都不删**
- **左栏标签筛选**：按 `name_key` 前缀匹配
- 不记录颜色、图标、手动排序（全站黑白灰，顺序按使用次数）

## 三、建表 SQL 原文

```sql
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

## 四、逐字段说明

| 字段 | 类型 | 约束 | 含义（人话） | 为什么这么设计 |
|---|---|---|---|---|
| `html_tags.name` | TEXT | NOT NULL | 标签名，显示用 | 保留大小写与 `/`（层级信息） |
| `html_tags.name_key` | TEXT | NOT NULL + `UNIQUE(user_id, name_key)` | 归一化后的名字 | 判重只看键、显示只用 `name`；不存它会出现「工作 / 工作  / Work」三个标签 |
| `html_tags.created_at` | INTEGER | NOT NULL | 什么时候建的（毫秒） | chips 排序主依据是使用次数，它只在必要时兜底 |
| `html_document_tags.document_id` | INTEGER | NOT NULL，外键 → `html_documents.id`，级联删 | 哪篇文档 | 删文档时关联自动清掉 |
| `html_document_tags.tag_id` | INTEGER | NOT NULL，外键 → `html_tags.id`，级联删 | 哪个标签 | 删标签时关联自动清掉——「删标签不删文档」的落实点 |

复合主键 `(document_id, tag_id)`：同一篇的同一个标签只可能有一行；`WITHOUT ROWID` 与项目里其它纯关联表一致。

## 五、索引

| 索引 | 服务于哪个查询 |
|---|---|
| `idx_html_tags_user_id` | 左栏标签列表 `WHERE user_id = ?` |
| `idx_html_document_tags_tag` | 反查「这个标签下有哪些文档」+ 数「几篇在用」 |

主键索引已覆盖「这篇文档有哪些标签」，不用另建。

## 六、常用查询

```sql
-- 全部标签 + 各被多少篇文档使用
SELECT t.id, t.name,
       (SELECT COUNT(*) FROM html_document_tags dt
         JOIN html_documents d ON d.id = dt.document_id
        WHERE dt.tag_id = t.id AND d.user_id = t.user_id) AS count
  FROM html_tags t
 WHERE t.user_id = 1
 ORDER BY count DESC, t.name;

-- 某篇文档的标签
SELECT t.id, t.name
  FROM html_document_tags dt
  JOIN html_tags t ON t.id = dt.tag_id
 WHERE dt.document_id = 7;

-- 按标签筛（`工作` 同时命中 `工作/周报`）
SELECT d.id, d.title
  FROM html_documents d
 WHERE d.user_id = 1
   AND d.id IN (
     SELECT dt.document_id FROM html_document_tags dt
       JOIN html_tags t ON t.id = dt.tag_id
      WHERE t.name_key = '工作' OR t.name_key LIKE '工作/%'
   )
 ORDER BY d.updated_at DESC, d.id DESC;
```

`WHERE ... AND user_id = ?` 不是可选项：每一条读、写、删都带它，越权就变成「影响行数 0」。

## 七、常见疑问

**问：为什么不和 Markdown 的标签共用？**
答：标签是「这个文档集合的索引」。两个工具的文档集合不同，共用后筛选 `工作` 会同时捞出 Markdown 和 HTML 文档，而当前工具只显示自己那批——用户会以为丢了数据。独立表让两边的语义各自成立。

**问：`工作/周报` 层级改名时子标签怎么办？**
答：改名走事务：先改自己，再把所有 `工作/...` 子标签批量改成 `新名字/...`；改之前先预检新键会不会撞已有标签（返回 `conflict`）。

## 八、变更记录

- 2026-11-04：建表（HTML 编辑器）。结构、`name_key` 唯一键、复合主键、级联规则均与 `md_tags` / `md_document_tags` 相同。
