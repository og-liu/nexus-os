# Nexus-OS 多智能体团队 · 模型分配与积分思路（v1）

> 状态：方向已定（Orchestrator-Worker 模式），供后续建 Agent 时照着配。
> 更新：2026-09-18。
> 范式依据：Orchestrator-Worker 是 2026 年业界收敛的主流多智能体范式（Anthropic / OpenAI / Cognition / 微软 / LangChain 同向）；对等协作（GroupChat）在退潮。

## 一、角色与模型分配

| 角色 | 首选模型 | 备选 | 选型理由 |
|---|---|---|---|
| Orchestrator 统筹（Nexus OS 研发助手） | Qwen3.8-Max（已启用） | DeepSeek-V4-Pro | 负责拆任务、派活、合成结果，吃规划推理 + 长上下文 + 结构化输出；token 消耗少（1 次规划 + 1 次合成），用最强脑子最划算 |
| 研发 Worker（写代码） | Kimi K2.7 Code | DeepSeek-V4-Pro | 代码专项 |
| 评审/测试 Worker | DeepSeek-V4-Flash | GLM-5.3-Flash | review、跑测试，便宜够用 |
| 文档/笔记 Worker | Doubao-Seed-2.1-turbo | GLM-5.3-Flash | changelog、设计文档、学习笔记归档 |
| 调研 Worker（按需，不常驻） | DeepSeek-V4-Pro | Qwen3.7-Plus | 深调业界主流做法 |

**分配原则**：最强推理给统筹，代码专项给研发，速度/省钱给通用执行。
**两个坑**：Flash/Turbo 档不给统筹（统筹要动脑不要快）；Code 专项不给统筹（那是研发 Worker 的菜）。

## 二、积分纪律

- 多智能体约烧普通对话 **15 倍 token**（Anthropic 实测），起步必须克制：先「统筹 + 2 个专职 Worker」，跑顺再扩。
- 同等预算下单 Agent 常打平多 Agent；多 Agent 只在「可并行的活 / 窄领域高可靠」两类场景稳赢。
- 统筹者不省（消耗少、价值高），Worker 省（消耗大头，用 Flash/专项档降本）。
- 带「专享权益」标签的模型（GLM-5.3/5.2、Kimi K3、Qwen3.8-Max、Doubao-Seed-Evolving）依赖订阅套餐档位，配置前先确认覆盖；具体规则以扣子官方/「扣子」助手答复为准。

## 三、协作铁律（多 Agent 不烂掉的前提）

1. Worker 之间不直接通信，一律经 Orchestrator 中转。
2. 派活用任务卡契约：范围 / 输入 / 产出物 / 验收标准 / 失败路径 / 审批边界；不甩一句「继续」。
3. 唯一真相源：本地工作目录 `/Users/ogliu/nexus-os` + `agents.md` 项目简报 + `docs/`。
4. 人的位置不变：Owner 定目标、授权、最终验收。

## 四、待办

- [ ] 确认「专享权益」模型的套餐覆盖情况
- [ ] 建 Worker 时按上表配置模型
- [ ] 拿一个真实小需求跑通「拆活 → 任务卡 → 交付 → 验收」闭环
