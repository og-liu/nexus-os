# auth_sessions —— 通行证（登录状态）

> **一行 = 一张还没过期的通行证。** 它回答的问题是：「这个请求**是谁发的**？」

| 状态 | 建立 | 最近更新 |
|---|---|---|
| ✅ 使用中 | 2026-10-15 | 2026-10-16 |

> 表名读法：`auth`（认证）+ `sessions`（会话期）。**这里的"会话"不指聊天**——HTTP 里把「一次登录 → 到登出或过期之间的这段时间」叫 session 会话期，这一行就代表"这段时间还开着"。也正因为这个词容易和将来的"AI 对话会话"混淆，它从 `sessions` 改名成了 `auth_sessions`（见「常见疑问」）。

## 一、怎么理解它

### 1.1 先破掉六个误解（不破掉，下面的字段表读不懂）

| 容易以为 | 实际上 |
|---|---|
| cookie 里存着「我是谁」 | 只存一串**随机号码**；「号码 → 谁」全靠查这张表 |
| 表里有行 = 有人登录着 | **过期的行还躺在里面**，要带上 `expires_at > 现在` 才算数 |
| 多设备应该有「设备」字段 | 表**根本不关心设备**。一行 = 一处登录，行数就是设备数；"iPhone / Chrome"那种设备名是另一个功能（活跃设备列表）才需要记 |
| 一个账号只能有一行 | **每登录一次加一行**，所以同一个账号可以有很多行（同一台设备重复登录也会多一行） |
| 「在线」=「登录着」 | 登录着 = 手里有还没过期的通行证。29 天没打开过网站，也仍然"登录着" |
| 一直在用就不会过期 | 有效期**从"登录那一刻"算 30 天，不续期**。天天来，第 31 天照样要重新登录 |

### 1.2 为什么需要它：cookie 里没有身份

- HTTP 有个天生的毛病：**每个请求对服务器来说都是第一次见面的陌生人**，它不记得上一个请求是谁。
- 登录成功的那一刻，服务器生成一串**随机号码**发给浏览器（存在 cookie 里）。这串号码**不含任何身份信息**，就是随机字符。
- **为什么不把身份直接写进 cookie？** 因为 cookie 在用户自己手里，**能随便改**。写 `username=ogliu` 进去，用户改成 `username=别人` 就冒充成功了。
- 所以服务器得**自己记一份**：「这串号码 = 谁、什么时候作废」。这份记录就是本表的一行。
- 之后每次请求：浏览器自动带上号码 → 服务器把它算一遍 sha256 → 拿结果查这张表 → 查到就知道你是谁。

### 1.3 一行的一生

```
登录成功              → 加一行（有效期 = 登录时间 + 30 天）
你每次访问             → 查这一行（不改数据）
点「退出登录」          → 删掉这一行
30 天到点             → 那行作废（行还留着，等下一次有人登录时被顺手清理）
一直没退、也没到点      → 就一直在那儿，你每次来都靠它认你
删掉账号              → 它的所有行一起删（外键 CASCADE）
```

一台设备一行：手机登录一行、电脑登录一行，互不干扰；**删一行只让那一处掉线**（这就是"让某台设备退出"的原理）。

### 1.4 如果没有这张表会怎样

两条路，都比现在差：

1. **还是存随机号码（我们现在这样）**：没有表，服务器没法把号码翻译成"谁"，**每次刷新都会掉线**——登录根本保持不住。
2. **改成把身份写进 cookie 并签名防篡改**（JWT / 签名 cookie 那套，是真实存在的方案）：不用表也能保持登录，但**签出去的凭证收不回来**——
   - 点"退出登录"只能删掉浏览器里那份，被复制走的那份照样用到过期
   - 改了密码，旧设备上**踢不掉**
   - 删掉账号，那张"通行证"还能用到期满
   - 做不了"现在谁登录着"

所以这张表换来的，就是 **「可撤销」** 这一个能力。至于"活跃设备列表""在线人数"，都是它的**副产品**——它不为任何功能服务，它就是「登录状态」本身的存放处。

## 二、这张表管什么

- **登录成功那一刻**：加一行（并把号码发给浏览器）
- **之后每一次请求**（刷新、点页面、提交表单）：**查**一行 —— 这就是"你是谁"的唯一来源
- **点退出登录**：删掉那一行
- **注册时**：不碰这张表（除非注册流程顺手帮你登录一次）
- **过期**：不主动删，等下一次有人登录时顺手清理，或读到时判定无效

**不是"某个功能需要它"，是"登录之后的每一次请求都需要它"。**

## 三、建表 SQL 原文

```sql
CREATE TABLE IF NOT EXISTS auth_sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT    NOT NULL UNIQUE,      -- sha256(cookie 中的原文)
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
```

## 四、逐字段说明

| 字段 | 类型 | 约束 | 含义（人话） | 为什么这么设计 |
|---|---|---|---|---|
| `id` | INTEGER | 主键，自增 | 这一行的内部编号 | 只给数据库自己用，**不对外暴露**。真正的凭证是浏览器 cookie 里那串号码，这个 id 泄露了也没用 |
| `token_hash` | TEXT | NOT NULL **UNIQUE** | **浏览器手里那串号码的「指纹」**。cookie 里是原件，这里是复印件 | 见下方单独说明 |
| `user_id` | INTEGER | NOT NULL，外键 → `users(id)`，`ON DELETE CASCADE` | **这行属于谁**（就是 `users.id`） | 两张表**唯一的连接点**。删用户时它的行一起删，不留"指向空用户的僵尸行"（前提：外键真的开了，见本目录 README §二） |
| `created_at` | INTEGER | NOT NULL | **这次登录发生的时间** | 与 `expires_at` 相减就是有效期 |
| `expires_at` | INTEGER | NOT NULL | **这次登录什么时候作废** = `created_at` + 30 天 | 读会话时拿它和"现在"比；过期的行会被顺手清掉。cookie 的有效期与它同源（都由 `SESSION_TTL_MS` 决定），不同源就会出现"莫名其妙掉线" |

### `token_hash` 到底是什么（值得单独讲）

登录成功时，服务器随手生成一串 43 个字符的随机号码（例如 `Mk-zLzmkJjCLjKraJ8FGaSIqbq_mqXk9Kl1WUIQgv3o`）：

- 这串**号码本身**发给浏览器，存进 cookie
- 号码算一遍 **sha256**，结果（64 个十六进制字符，例如 `5cb17971224a8f0e…`）存进 `token_hash`

为什么存"算过的"而不是原文：**sha256 是单向的**。号码 → 指纹很容易，指纹 → 号码基本不可能。所以这个库万一泄露，偷的人只拿到一堆指纹，反推不出能用的号码，也就冒充不了你。

**你可以自己验证**（随便拿一行，用 cookie 原文算一遍，结果就是库里那串）：

```bash
printf '%s' '<cookie 原文>' | shasum -a 256
```

**`expires_at - created_at` 恒等于 30 天**（2592000000 毫秒）。在 Navicat 里随便挑一行做减法就能验证——这也是"有效期 30 天"这句话唯一的意义。

## 五、索引

| 索引 | 由什么产生 | 服务于哪个查询 |
|---|---|---|
| `sqlite_autoindex_auth_sessions_1` | `token_hash UNIQUE` 自动创建 | **每个请求**：拿 cookie 原文算 sha256 再查会话（全库最频繁的一次查询） |
| `idx_auth_sessions_user_id` | 显式建的 | 按用户批量操作会话（如将来"登出所有设备"）、以及外键 `CASCADE` 删除时的查找 |

**为什么第二个要显式建**：SQLite 只为 `UNIQUE` 和主键自动建索引，**不会**为外键建。少了它，"按用户查/删会话"就要全表扫。

## 六、常用查询

```sql
-- 现在有几个人登录着（去掉过期行、按人去重）
select count(distinct user_id) from auth_sessions where expires_at > strftime('%s','now')*1000;

-- 每人几处登录、其中有几处还有效
select u.username, u.username_key, count(s.id) as 通行证,
       sum(s.expires_at > strftime('%s','now')*1000) as 还有效
from users u left join auth_sessions s on s.user_id = u.id
group by u.id order by u.id;

-- 把毫秒时间戳看成人能读的时间（Navicat 显示的是 1791093204516 这种数字）
select s.id, u.username,
       datetime(s.created_at/1000, 'unixepoch', '+8 hours') as 登录时间,
       datetime(s.expires_at/1000, 'unixepoch', '+8 hours') as 过期时间
from auth_sessions s join users u on u.id = s.user_id order by s.id;

-- 已经作废、但还没被清理的行
select count(*) from auth_sessions where expires_at <= strftime('%s','now')*1000;
```

> `left join` 与 `join` 的区别在这里很要紧：`left join` 能把「有账号、但一行会话都没有」的人（比如 `olduser`）也列出来，普通 `join` 会让这种人凭空消失。想找"谁从没登录过"，就用 `left join ... where s.id is null`（见 [`users.md`](./users.md) 第六节）。

## 七、常见疑问

**Q：`.schema` 里那张 `sqlite_sequence` 是什么？**
不是我们建的表。只要表里用了 `AUTOINCREMENT`，SQLite 就自动建它，记录"每张表的自增号发到几号了"。不手动读写、不迁移、不写进业务代码。

**Q：为什么表名叫 `auth_sessions` 而不是 `sessions`？**
将来做 Agent 相关开发时，"会话"会被用来指**对话线程**，那才是更常见的 `sessions`。裸词留给对话，登录凭证带上前缀 `auth_`。表名改过一次，老库由 `initSchema()` 里的幂等迁移自动改名（见 `src/lib/auth/db.ts`）。

**Q：一个账号能有几行？**
不限。每登录一次加一行。`frequent` 那个样例账号就有 8 行（八处登录）。

**Q：删掉一行会怎样？**
只有拿着那一行对应号码的那一处掉线，其它行不受影响。这就是"让某台设备退出登录"的实现方式。

## 变更记录

- 2026-10-16：从 `docs/数据库设计.md` 拆出，成为这张表自己的文件（内容未变，只是换了位置并按统一格式重排）。
- 2026-10-16：**表名 `sessions` → `auth_sessions`**，老库由 `initSchema()` 里的幂等迁移自动改名；`db.test.ts` 覆盖五种情形。
- 2026-10-15：随登录注册功能建立（当时叫 `docs/功能/登录注册.md` 的数据模型一节）。
