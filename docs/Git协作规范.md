# Git 协作规范

> 一条需求怎么变成线上功能：**分支怎么开、代码怎么进 `main`、谁在什么时候合并**。
>
> **读者有三个**：ogliu（项目所有者，人）、Lingda（Hermes，本机的 AI 助手）、开发助手（DeepSeek Harness 的 `worker` 预设，在独立工作树 `~/nexus-os-worker` 里干活，任务经 ogliu 手动转交）。规则对三者一视同仁。
> AI 助手读本文时：**「规则」要执行，「解释」用来理解为什么**。
>
> 相关文档：《部署方案》（推送 `main` 之后自动化做了什么）、《技术栈说明》（工程门禁的细节）。

**当前状态**：流程初版（2026-10-17）。`main` 分支保护**已开启**（2026-10-17 10:15）——改 `main` 只能走 PR；禁直推、禁 force push、禁删除，管理员同样受限。

**第二开发已换人**（2026-10-17）：旧「小鲁（Codex CLI + 扣子桌面端）」下线，改为「开发助手（DeepSeek Harness 的 `worker` 预设）」。工作方式随之改变——**它只改文件，不碰 git**；提交、推送、开 PR 全部由 Lingda 代做。理由见 §十。

---

## 一、一句话版本

**一条需求 = 一条分支 = 一个 PR。`main` 只接受合并，不接受直接推送。**

- 分支（branch）= 仓库的平行时间线：在分支上改代码，不影响主干。
- PR（Pull Request，合并请求）= GitHub 上的「申请合并」页面：看改动、留讨论，点合并。
- `main` = 主分支，也是**唯一的上线开关**——它一更新，CI 就自动部署（见《部署方案》）。

这套做法的正式名字是 **GitHub Flow**——下一节就是它的完整说明。

## 二、这套流程的正式名字：GitHub Flow

我们走的不是野路子：它有正式名字——**GitHub Flow**（GitHub 官方推广的轻量分支工作流）。信条一句话：**`main` 永远保持可发布；一切改动走短期分支 + PR；合并即部署。**

GitHub 官方版是六个环节，我们逐条对应：

| 官方环节 | 我们怎么落 |
|---|---|
| ① 建分支 | `lingda/<短名>`（Lingda）。开发助手不建分支——它只改工作树，由 Lingda 把改动落成分支；基线永远是最新 `main` |
| ② 提交 | 小步 commit，`type(范围): 中文摘要` |
| ③ 开 PR | `gh pr create`——改动对照、讨论、验收结论都留在 PR 里 |
| ④ 讨论与评审 | Lingda 验收：跑门禁、看差异、逐条勾任务卡的验收清单 |
| ⑤ 部署验证 | 我们简化掉了：流水线只在 `main` 上部署，「部署」并进 ⑥（没有预发环境） |
| ⑥ 合并 | Squash and merge + 删分支；合并触发 CI 自动上线 |

> 官方版的 ⑤ 是「合并**前**先从分支部署一份去验证」——很多公司的预发（staging）环境就是干这个的。本项目没有预发，验证靠 ④ 的本地门禁 + 验收，所以 ⑤ 并进 ⑥。

**和 Git Flow 的区别**（为什么没选它）：

| | GitHub Flow（本项目） | Git Flow |
|---|---|---|
| 长期分支 | 只有 `main` | `main` + `develop` + `release/*` + `hotfix/*` |
| 发布节奏 | 随时可发，合并即上线 | 按版本批量发布，像「发布列车」 |
| 复杂度 | 一条分支 + 一个 PR | 多层分支、多套合并规则 |
| 适合谁 | 有 CI/CD、人少的项目 | 大团队、按版本交付的产品 |

Git Flow 不是「更专业」，是「为大规模版本发布设计的」——我们没有版本列车，用它只会多几层要维护的分支。

**我们额外加的三条**（GitHub Flow 没规定，本项目需要）：

1. **串行写手**：同一时间只有一个写手（见 §三）；
2. **验收在合并前**：必过 Lingda 的验收清单（见 §五）；
3. **任务卡驱动**：开发助手只从任务卡接活（见 §七）。

## 三、角色与串行原则

| 角色 | 是谁 | 负责 | 不碰 |
|---|---|---|---|
| ogliu | 项目所有者（人，GitHub 账号 `og-liu`） | 提需求、转交任务卡、拍板（回「准了」） | — |
| Lingda | Hermes（本机，主仓库 `~/nexus-os`） | 写任务卡；把开发助手的改动落成分支、提交、推送；验收（跑门禁、看差异、讲设计）；合并后同步本地 | 开发助手干活期间不碰同一个工作树 |
| 开发助手 | DSH 桌面端的 `worker` 预设（独立 clone `~/nexus-os-worker`） | 在任务卡范围内改文件、跑门禁、五段交活 | 不建分支、不 commit、不 push、不合并、不部署、不碰 `main` |

三条协作铁律：

1. **AI 之间不直接对话**：所有交接（任务卡、交付、返工）都经 ogliu 手动转交。
2. **串行**：同一时间只有一个写手。两个写手同改一个仓库，冲突（见术语表）的成本远大于并行的收益。开工信号是「交给开发助手」，收工信号是「开发助手交活了」——认的是动作，不认名字，沿用旧叫法也能懂。
3. **上线是人的决策**：代码能不能上线由 ogliu 拍板（回一句「准了」）；合并的**执行**可由 Lingda 代劳（`gh pr merge`），CI 只负责部署。

## 四、先把词说清楚（术语表）

后文用到这些词时不再逐一解释，回这里查。（「①~⑥」指第五节流程图里的步骤编号；「§x」指章节。）

| 词 | 大白话 | 在流程里的位置 |
|---|---|---|
| 仓库（repo） | 代码文件夹 + 它的全部历史；项目仓库在 GitHub 上是 `og-liu/nexus-os` | 全程 |
| `origin` | 远端仓库（GitHub 上那份）在本机命令里的默认称呼 | 全程 |
| `main` | 主干分支；**推它 = 上线** | ④⑤ |
| 分支（branch） | 平行时间线：在分支上改，主干不受影响 | ① |
| 基线（base） | 分支从哪个提交点开始长出来 | ① |
| 提交（commit） | 存档点：一批改动 + 一句说明，存进历史 | ② |
| 推送（push） | 把本地提交上传到 GitHub | ② |
| 拉取（fetch / pull） | `fetch` = 取回远端最新信息、不动本地；`pull` = fetch + 并进当前分支 | ③⑥ |
| 差异（diff） | 两份代码的逐行对照；验收看的就是它 | ③ |
| 门禁 | 项目规定必须全过的检查：`typecheck` / `lint` / `test` / `build` | ③ |
| PR（Pull Request） | 合并申请页面：改动对照 + 讨论 + 合并按钮 | ③④ |
| 合并（merge） | 把分支的改动并回主干 | ④ |
| Squash merge | 「压扁合并」：分支上的多个提交压成 `main` 上一条 | ④ |
| 冲突（conflict） | 同一处代码被两个写手改过，Git 不知道听谁的，要人决定 | §九 |
| rebase | 「换基底」：把分支上的改动挪到最新 `main` 之上重放一遍 | §九 |
| CI（持续集成） | 自动检查、构建、部署的流水线（由 GitHub Actions 提供） | ⑤ |
| 分支保护 | GitHub 设置：禁止直推 `main`、只收 PR；手滑也推不上去 | §十一 |
| GitHub Flow | 特性分支 + PR + 合并即部署的轻量分支工作流（本项目用的就是它） | §二 |

## 五、一次需求的全流程

```
开发助手（~/nexus-os-worker）        Lingda（~/nexus-os）
   改文件 ──交活──► 落分支 · 提交 · 推送
                          │
main ───●─────────────────●────────────────►  始终可上线
        │                 ▲
        ①从最新 main 拉出 ④PR · Squash 合并
        ▼                 │
  lingda/<短名> ──②提交──推送──③Lingda 验收──┘
```

1. **改文件（开发助手）**：在 `~/nexus-os-worker` 里按任务卡改代码。开工第一步 `git status`，工作树必须干净。它不建分支、不提交、不推送、不切分支——git 状态一律不碰。
2. **交活（开发助手 → ogliu → Lingda）**：开发助手按五段交活（状态 / 改动 / 关键决策 / 验证命令与结果 / 遗留与风险），并给一条建议的 commit message。ogliu 把交活转给 Lingda。
3. **落地（Lingda）**：把 worker 的改动搬进主仓库，落成一条分支：
   ```bash
   git -C ~/nexus-os-worker add -N .           # 新增文件也要进 diff（intent-to-add）
   git -C ~/nexus-os-worker diff > /tmp/worker.patch
   cd ~/nexus-os && git fetch origin && git switch -c lingda/<短名> origin/main
   git apply --3way /tmp/worker.patch
   git add -A && git commit -m "<建议的 message>"
   git push -u origin lingda/<短名>            # -u：绑定同名远端分支，之后直接 git push
   ```
   **推完留在该分支上，不要切回 `main`**——ogliu 随时打开本地文件，看到的就应该是待评审的版本。合并完成后在第 7 步再回 `main`。
4. **验收（Lingda）**：
   ```bash
   git log origin/main..HEAD        # 这条分支比 main 多出的提交
   git diff origin/main...HEAD      # 这条分支相对 main 的全部改动
   pnpm exec next typegen && pnpm typecheck && pnpm lint && pnpm test   # 门禁
   ```
   对照任务卡「验收」清单逐条勾；通过就开 PR（`gh pr create`），把验收结论贴成 PR 评论，并把关键设计讲给 ogliu。
5. **合并（ogliu 拍板 → Lingda 执行）**：Lingda 验收汇报后，ogliu 回「准了」；Lingda 执行 `gh pr merge <PR号> --squash --delete-branch`——压扁合并（分支的多个提交在 `main` 上只留一条干净提交，细节仍可在 PR 里查）+ 删远端分支。
6. **上线（CI 自动）**：`main` 一更新，流水线自动「检查 → 构建 → 传服务器 → 切版本 → 重启」（见《部署方案》）。
7. **收尾（Lingda）**：`git switch main && git pull`；删本地分支（`git branch -D lingda/<短名>`；远端分支已在第 5 步随合并删除）；最后让 worker 跟上主线——先确认改动已落地，清空它的工作树再快进：
   ```bash
   git -C ~/nexus-os-worker restore . && git -C ~/nexus-os-worker clean -fd   # 危险：clean -fd 会删未跟踪文件，只在确认落地后跑
   git -C ~/nexus-os-worker pull --ff-only
   ```

## 六、分支命名

| 写手 | 前缀 | 例子 |
|---|---|---|
| Lingda | `lingda/` | `lingda/forgot-password` |
| 开发助手 | 不建分支 | — |

- 短名：小写英文或拼音，用连字符 `-` 连接，3~4 个词以内；**不用中文、空格、大写字母**（链接和部分工具对中文分支名不友好）。
- 一条需求一条分支；需求太大就拆成两张任务卡、两条分支。
- `task/` 是旧小鲁时代的前缀，新流程不再产生；仓库里见到 `task/` 开头的分支，认作历史遗留即可。
- 分支名写进任务卡；开分支前先取到最新（`git fetch origin main`），基线永远是最新 `main`。

## 七、任务卡模板

任务卡 = 一次性工作说明书。Lingda 写 → ogliu 转交 → 开发助手执行。

```
【任务卡】<标题>
目标：做什么、为什么（需求原文 + 必要的背景）
验收：做完后能逐条勾选的验收标准
工作目录：~/nexus-os-worker
验证：pnpm exec next typegen → pnpm typecheck / lint / test
交付：就地改文件（不建分支、不提交、不推送）→ 五段交活 + 建议的 commit message
```

两个约定：

- **不写「范围」**：该改哪些文件由写手判断——写代码的人比写任务卡的人更清楚代码，隔着一层去圈定范围只会圈错。防越界靠两条：「只做完成目标必需的改动」+ 验收把关。
- **验收必须能勾选**：把需求翻译成「能看到 / 能点出 / 能测出」的条目；「做好看一点」这种没法判定的标准，验收时一定扯皮。

## 八、写手守则（开发助手执行；Lingda 自查同一套）

1. 开工先 `git status`；工作树不干净就停下问，不 stash、不 checkout、不 commit、不 push、不建分支。`main` 不碰。
2. 不合并、不部署；`deploy/`（部署物料）与 `.github/`（CI 配置）不碰，任务卡点名除外。
3. 只做完成目标必需的改动；顺带发现的问题写进交活，不顺手改。
4. 不确定就问：需求有多解、要动架构、要加依赖、要删文件或数据、测试反复修不过 → 停下问。
5. 「完成」之前真跑门禁（先 `pnpm exec next typegen`）；跑不了（环境缺东西）就明说，别装成功。
6. 交活五段：状态 / 改动 / 关键决策 / 验证（命令 + 结果）/ 遗留与风险，并附一条建议的 commit message。

## 九、四个岔路

- **验收不通过**：不新开分支，就在原分支继续改（PR 未合并前随便提交）；Lingda 重新拉、重新验。返工清单由 Lingda 出、ogliu 转交。
- **需求中途变化**：装得进同一目标就同分支；装不进就新卡新分支——旧分支要么继续服务旧目标，要么作废删掉。不许「一分支多目标」。
- **分支作废**：删本地（`git branch -D`）和远端（`git push origin --delete`），重新拉一条；`main` 不受任何影响。
- **真要并行**：两个写手本来就各用各的工作树（主仓库 / `~/nexus-os-worker`），互不相干；谁后合并，谁先 `git rebase origin/main`（把改动挪到最新 `main` 上重放，消除分叉）再推。默认仍是串行。
- **兜底（开发助手读不到仓库时）**：让它只交补丁（patch：改动的文本文件），ogliu 转给 Lingda，由她校验后落到分支，后续流程不变。

## 十、为什么这么定（决策表）

| 规矩 | 为什么 | 不这么做会怎样 |
|---|---|---|
| `main` 禁直推 | 它是上线开关，直推 = 跳过所有检查直接见用户 | 一次手滑就是线上事故，且只能整版回滚 |
| 一需求一分支 | 隔离：出了问题能单独撤，不牵连别的改动 | 改动混在一起，回滚像拆炸弹 |
| PR 合并 | 留记录：改了什么、谁验的、结论如何 | 改动无痕，学习复盘断线 |
| Squash 合并 | 主线一提交 = 一次验收过的需求 | 主线被碎提交淹没，历史没法读 |
| 串行写手 | 两个写手同改一个仓库，冲突成本 > 并行收益 | 互相覆盖、天天解冲突，净亏 |
| 验收在合并前 | 上线前拦一道 | 错误直接部署上线 |
| 分支保护 | 靠设置兜底，不靠自觉 | 纪律总有失效的一天 |
| 开发助手不碰 git | 工作树保持干净，Lingda 的验收基线永远可复现 | 它一提交，diff 里就混进它的提交，验收失去基线 |
| 开发助手独立工作树 | 两个 agent 不同目录，不抢 `index.lock`、构建缓存和端口 | 同目录并行 = 互相覆盖、报错莫名其妙 |

## 十一、护栏：分支保护

- **是什么**：GitHub 仓库设置里的规则：禁止直接推送 `main`、必须走 PR 才能改它。
- **现状（2026-10-17 10:15）**：**已开启**——必须走 PR（0 人批准）、禁 force push、禁删除、管理员同样受限；实测直推被拒（`remote: error: GH006 … Changes must be made through a pull request`）。
- **为什么暂不勾「要求 CI 检查通过」**：流水线当前只在推 `main` 时触发，PR 阶段没有检查可要求；将来给流水线加 `pull_request` 触发后再勾。
- **现在起**：ogliu、Lingda 都只能「分支 → PR → 合并」；手滑推不上去，老习惯「改完直接 push main」正式作废。
- **开发助手的 clone 与主仓库同权**：`~/nexus-os-worker` 用的是同一把 SSH key，能推分支、理论上也能推 `main`（会被保护拒绝）。所以「它不推」靠纪律，不是靠权限。哪天要收紧，就给它换一把没有写权限的部署 key。
- **开法**：GitHub 仓库 → Settings → Branches → Add branch protection rule；或让 Lingda 用 `gh api` 代开。

## 十二、常见问题

**为什么不直接 push `main`？**
`main` 是部署开关，推一下线上立即换版本；没有审查，出了问题也没法只撤其中一条需求。分支 + PR 把「做」和「上线」拆成两步，做完先被看一遍。

**合并为什么用 squash，不用普通 merge？**
普通 merge 把分支上的碎提交原样并进 `main`，主线越来越吵；squash 压成一条，主线一条提交 = 一次验收过的需求，细节留在 PR 里。

**为什么由 Lingda 执行合并，而不是 ogliu 自己在网页点？**
合并在 GitHub 上就是一个执行动作，真正的闸门在「谁决定」：ogliu 说「准了」= 批准，Lingda 用 `gh pr merge --squash --delete-branch` 落地。何况 GitHub 分不清人机——两人用的是同一个账号（记录都显示 `og-liu`），所以决定权留在 ogliu、执行交给机器，两不耽误。

**GitHub 上点合并，和本地敲 `git merge` 是一回事吗？**
效果一样。选 PR 是为了留记录（谁、何时、改了什么、验收结论）并自动触发 CI；本地 `git merge` 再直推 `main` 也上线，但等于绕过记录与审查——不做。

**合并后部署失败怎么办？**
那是部署问题，按《部署方案》的回滚处理（`release.sh --rollback`）；修复照样走新分支 + PR，不慌。

**验收标准谁定？可以含糊吗？**
Lingda 从需求原文翻译成可勾选条目；含糊的标准在验收时一定打架，宁可多写两行。

**开发助手需要读这份文档吗？**
要。它的工作目录 `~/nexus-os-worker` 就是本仓库的 clone，`docs/` 就在旁边。不过它的常驻约束只来自「预设人设 + `AGENTS.md`」，所以「八、写手守则」的核心几条已经写进 `worker` 预设的 persona；本文是完整版，留给人和 Lingda 查。

**为什么不让开发助手自己提交？**
两个原因。一是验收需要干净基线：它不提交，`git diff` 看到的就是它这次改的全部，不会混进历史提交。二是它一旦能提交，就能切分支、能 rebase，两个工作树的状态就不再互不干扰。让唯一碰 git 的只有 Lingda，出问题只查一个地方。

**两个目录的代码怎么同步？**
都以 `origin/main` 为唯一真源。主仓库合并后 `git pull`；worker 在主仓库合并后 `git pull --ff-only`。注意 worker 交活后工作树是脏的（改动还在），所以拉取前必须确认改动已落地，再清空工作树（`git restore . && git clean -fd`）。

## 十三、命令速查

| 谁 | 场景 | 命令 |
|---|---|---|
| 开发助手 | 开工前自查 | `git status -sb`（必须干净） |
| Lingda | 导出 worker 改动 | `git -C ~/nexus-os-worker add -N . && git -C ~/nexus-os-worker diff > /tmp/worker.patch` |
| Lingda | 落分支并应用 | `git fetch origin && git switch -c lingda/<短名> origin/main && git apply --3way /tmp/worker.patch` |
| Lingda | 提交并推送 | `git add -A && git commit -m "<建议的 message>" && git push -u origin lingda/<短名>` |
| Lingda | 门禁 | `pnpm exec next typegen && pnpm typecheck && pnpm lint && pnpm test` |
| Lingda | 开 PR | `gh pr create --base main --head lingda/<短名>` |
| Lingda | 合并后同步 | `git switch main && git pull && git branch -D lingda/<短名>`，再清空并快进 worker |
| ogliu | 拍板合并 | 回一句「准了」 |
| Lingda | 执行合并 | `gh pr merge <PR号> --squash --delete-branch` |

---

## 更新记录

- 2026-10-17 16:50：补一条协作习惯——Lingda 提交推送后**留在评审分支**上，直到合并完成再回 `main`（§五 第 3 步）。理由：ogliu 在本地打开文件看到的应当就是待评审版本，不该让他为了看新版去切分支。
- 2026-10-17 16:45：第二开发从「小鲁（Codex CLI + 扣子）」换成「开发助手（DSH `worker` 预设，独立 clone `~/nexus-os-worker`）」，协作方式由「自己提交推送」改为「只改文件、Lingda 落 git」；§一 / §二 / §三 / §五 / §六 / §七 / §八 / §九 / §十 / §十一 / §十二 / §十三 同步，新增「为什么不让它提交」「两个目录怎么同步」两条 FAQ 与「worker 的 clone 与主仓库同权」一条护栏说明。
- 2026-10-17 10:59：合并方式定为「拍板 / 执行分离」（B 方案）——ogliu 回「准了」拍板，Lingda 执行 `gh pr merge --squash --delete-branch`；§三 角色表、§五 第 4 步、§十三 命令速查与 FAQ 同步。
- 2026-10-17 10:55：新增 §二《这套流程的正式名字：GitHub Flow》——官方六环节与本项目的逐条对照、与 Git Flow 的区别、额外三条纪律；其后章节整体顺延一位；术语表补 GitHub Flow 词条、章节引用改用 § 记法。
- 2026-10-17 10:15：`main` 分支保护**已开启**——必须走 PR（0 批准）、禁 force push / 删除、管理员同限；实测直推被拒（`GH006`）。头部「当前状态」与 §十 同步。
- 2026-10-17：初版。确立「一需求 = 一分支 = 一 PR；`main` 禁直推；串行写手；PR 验收合并」流程。
