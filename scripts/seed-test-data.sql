-- 测试数据播种（纯 SQL 版，不依赖 node）
-- 用法：sqlite3 "/Users/ogliu/Nexus OS/data/nexus.db" < scripts/seed-test-data.sql
-- 清理：验证完在界面侧边栏删除「分页验证测试」会话即可（CASCADE 连带删消息）

PRAGMA busy_timeout = 5000;

BEGIN TRANSACTION;

-- 1) 建测试会话
INSERT INTO sessions (id, title, created_at, updated_at)
VALUES (
  'seed-page-test-0001',
  '分页验证测试（120 条，可删）',
  (CAST(strftime('%s', 'now') AS INTEGER) - 8000) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
);

-- 2) 递归生成 120 条消息（奇数=用户提问，偶数=AI 回复，共 60 轮）
--    created_at 每条间隔 60 秒，严格递增，供分页游标使用
WITH RECURSIVE seq(n) AS (
  SELECT 1
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 120
)
INSERT INTO messages (id, session_id, role, content, images, created_at)
SELECT
  lower(hex(randomblob(16))),
  'seed-page-test-0001',
  CASE WHEN n % 2 = 1 THEN 'user' ELSE 'assistant' END,
  CASE
    WHEN n % 2 = 1 THEN
      '第 ' || ((n + 1) / 2) || ' 轮提问：请给我一段带标题、列表和代码块的 Markdown 回复，**重点加粗**。'
    ELSE
      '## 第 ' || (n / 2) || ' 轮回复' || char(10) || char(10)
      || '这是第 ' || (n / 2) || ' 轮的测试数据，验证**加粗**、*斜体*、`行内代码`。' || char(10) || char(10)
      || '- 要点一：滚到顶部会触发加载上一页' || char(10)
      || '- 要点二：加载后视口不跳动' || char(10)
      || '- 要点三：列表 key 用的是消息 id' || char(10) || char(10)
      || '```ts' || char(10)
      || 'const round = ' || (n / 2) || ';' || char(10)
      || '```' || char(10) || char(10)
      || '| 轮次 | 状态 |' || char(10)
      || '| --- | --- |' || char(10)
      || '| ' || (n / 2) || ' | OK |'
  END,
  NULL,
  (CAST(strftime('%s', 'now') AS INTEGER) - 8000) * 1000 + n * 60000
FROM seq;

COMMIT;
