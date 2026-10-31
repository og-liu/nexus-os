# Markdown 标签表（md_tags / md_document_tags）

> **一行 = 这个人的一个标签**（`md_tags`），以及**一篇文档挂了哪个标签**（`md_document_tags`）。它们回答的问题是：「这些文档该分几类、某一篇属于哪几类、某个类下有哪些篇？」

| 状态 | 建立 | 最近更新 |
|---|---|---|
| ✅ 已完成 | 2026-10-31 | 2026-10-31 |

## 一、怎么理解它

一篇文档**可以挂多个标签，也可以一个都不挂**。和「分组」的区别就在这：

- 分组（文件夹）是**唯一归属**——放进去就只属于那一个；
- 标签是**交叉归属**——「周报」可以同时是 `工作` 和 `重要`。

本工具选标签，是因为写作时真正会同时成立的是这两件事：「这是工作」「这条重要」，一个格子装不下。

**层级靠名字里的 `/` 表达**：`工作/周报` 是 `工作` 的子标签。筛选 `工作` 时把 `工作/周报` 也算进来（前缀匹配）。好处是不用建树表、改名时也不用维护父子指针；代价见 §七 第 2 条。

## 二、这两张表管什么

- **建标签**：`md_tags` 加一行——用户第一次打某个名字时顺手建出来（不打也能用，标签是纯可选的）
- **给文档打标签**：`md_document_tags` 加一行（文档 id + 标签 id）
- **取消某个标签**：删掉那一行关联；文档本身不动
- **删整个标签**：删 `md_tags` 那一行，`md_document_tags` 里它所有的关联跟着级联删掉——**文档一篇都不删**
- **左栏的标签 chips**：按「多少篇文档在用它」从多到少排（用的是最多的排最前）
- **按标签筛文档**：拿标签的 `name_key` 做前缀匹配（`工作` 命中 `工作` 和 `工作/周报`）
- 它**不**记录「标签的颜色」「标签的顺序」——全站黑白灰，顺序由使用次数决定

## 三、建表 SQL 原文

```sql
CREATE TABLE IF NOT EXISTS md_tags (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  name_key   TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, name_key)
);

CREATE INDEX IF NOT EXISTS idx_md_tags_user_id ON md_tags(user_id);

CREATE TABLE IF NOT EXISTS md_document_tags (
  document_id INTEGER NOT NULL REFERENCES md_documents(id) ON DELETE CASCADE,
  tag_id      INTEGER NOT NULL REFERENCES md_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, tag_id)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_md_document_tags_tag ON md_document_tags(tag_id);
```

## 四、逐字段说明

| 字段 | 类型 | 约束 | 含义（人话） | 为什么这么设计 |
|---|---|---|---|---|
| `md_tags.name` | TEXT | NOT NULL | 标签名，显示用 | 保留用户输入的大小写与 `/`——`工作/周报` 这个字面量本身就是层级信息 |
| `md_tags.name_key` | TEXT | NOT NULL + `UNIQUE(user_id, name_key)` | 归一化后的名字（去首尾空格、折叠空白、转小写） | 不存这个键，「工作」「工作 」「Work」会变成三个标签，几个月后标签列表就废了。判重只看键、显示只用 `name` |
| `md_tags.created_at` | INTEGER | NOT NULL | 什么时候建的（毫秒） | 只在排「新建的标签」时用得上；chips 的排序主依据是使用次数 |
| `md_document_tags.document_id` | INTEGER | NOT NULL，外键 → `md_documents.id`，级联删 | 哪篇文档 | 删文档时关联自动清掉，不留孤儿行 |
| `md_document_tags.tag_id` | INTEGER | NOT NULL，外键 → `md_tags.id`，级联删 | 哪个标签 | 删标签时关联自动清掉——这就是「删标签不删文档」的落实点 |

主键是 `(document_id, tag_id)` 复合主键：同一篇文档的同一个标签只能有一行，重复点「+ 标签」不会长出两条。`WITHOUT ROWID` 与 `attendance_overrides` 一致——这种纯关联表不需要隐藏的 rowid。

## 五、索引

| 索引 | 服务于哪个查询 |
|---|---|
| `idx_md_tags_user_id` | 左栏 chips：`WHERE user_id = ?` |
| `idx_md_document_tags_tag` | 反查「这个标签下有哪些文档」+ 数「几篇在用」：`WHERE tag_id = ?` |

`(document_id, tag_id)` 的主键索引已经覆盖「这篇文档有哪些标签」，不用另建。

## 六、常用查询

```sql
-- 左栏 chips：这个人全部标签 + 各被多少篇文档使用
SELECT t.id, t.name,
       (SELECT COUNT(*) FROM md_document_tags dt
         JOIN md_documents d ON d.id = dt.document_id
        WHERE dt.tag_id = t.id AND d.user_id = t.user_id) AS count
  FROM md_tags t
 WHERE t.user_id = 1
 ORDER BY count DESC, t.name;

-- 某篇文档的标签
SELECT t.id, t.name
  FROM md_document_tags dt
  JOIN md_tags t ON t.id = dt.tag_id
 WHERE dt.document_id = 7;

-- 按标签筛（`工作` 同时命中 `工作/周报`）
SELECT d.id, d.title
  FROM md_documents d
 WHERE d.user_id = 1
   AND d.id IN (
     SELECT dt.document_id FROM md_document_tags dt
       JOIN md_tags t ON t.id = dt.tag_id
      WHERE t.name_key = '工作' OR t.name_key LIKE '工作/%'
   )
 ORDER BY d.updated_at DESC, d.id DESC;

-- 没有标签的文档（左栏「无标签」那一档）
SELECT d.id, d.title FROM md_documents d
 WHERE d.user_id = 1
   AND NOT EXISTS (SELECT 1 FROM md_document_tags dt WHERE dt.document_id = d.id);
```

`WHERE ... AND user_id = ?` 不是可选项：每一条读、写、删都带它，越权就变成「影响行数 0」。

## 七、常见疑问

**问：为什么不做到 `md_documents` 里的一个 JSON 数组？**
答：那就没法「按标签筛」——SQLite 要在 JSON 里做全表扫描式的匹配，也没法建索引；而且标签改名要遍历所有文档改 JSON。两张表是这类多对多关系的标准解法。

**问：`工作/周报` 这种层级，改名 `工作` 时子标签怎么办？**
答：改名走一个事务：先改自己，再把所有 `工作/...` 的子标签批量改成 `新名字/...`。不这么做，子标签会挂在一个不存在的父名字下，前缀筛选就断了。

**问：标签能重复吗？**
答：同一个人不能有两个「只差大小写/空格」的标签（`UNIQUE(user_id, name_key)`）；不同账号之间互不影响（键里带 `user_id`）。

**问：为什么不给标签加颜色 / 图标 / 排序？**
答：全站黑白灰（《界面设计规范》§2），颜色会破这条例；排序用「使用次数」比手动拖拽更省事，也不会因为拖拽而多一个 `position` 列。

**问：一篇文档最多几个标签？**
答：12 个（应用层限制，不在库里）。再多的话标签条会横滚很长，实际上也没人这么用。

## 八、变更记录

- 2026-10-31：建表（Markdown 编辑器标签功能）。两张表、`name_key` 归一化唯一键、`(document_id, tag_id)` 复合主键；删标签只解除关联，文档不删。
