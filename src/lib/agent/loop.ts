// Agent Loop 核心：任务规划（Plan-and-Execute）编排。
//
// 升级自早期的「单步 ReAct」：以前是「用户一句话 → 判断调不调工具 → 最多循环 5 次 → 回答」，
// 现在是「用户一句话 → 先规划出步骤清单 → 逐步执行 → 失败重试兜底 → 汇总汇报」。
//
// 整条编排链路：
//   1. generatePlan 拆出计划（纯 JSON，非流式）→ 发 plan_created 事件
//   2. 逐步骤执行：每步是「一个小型 ReAct」（该步内可能多次调工具），发 step_start / step_done / step_failed
//   3. 兜底：某步失败（模型报错 / 工具全失败）→ 自动重试（最多 2 次），仍失败标记 failed 继续下一步
//   4. 全部步骤走完 → 让模型综合各步结果，流式吐最终回答 → 发 plan_done
//
// 关键设计：callLLM 使用真正的流式调用（stream: true）。
//   - 无工具调用时：模型的文本内容实时通过 onEvent("delta") 吐出，首字延迟 ≈ 模型首 token 时间
//   - 有工具调用时：tool_calls 的 arguments 是分片到达的，需要拼接完整后再执行
//   - 这样不需要等模型把整段话写完才开始显示，消除了非流式模式下的等待

import { PROVIDERS } from "@/lib/providers";
import { getModelMeta, DEFAULT_MODEL_ID } from "@/lib/models";
import { ProviderError } from "@/lib/providers/openai";
import { buildToolsSchema, getTool, type ToolDefinition } from "./tools";
import { generatePlan } from "./planner";
import type { Plan, PlanStep } from "./plan";
import type { ChatMessage, ChatContentPart, ThinkingOptions } from "@/lib/providers/types";

// ─── 安全边界 ─────────────────────────────────────────────────────
// 单步内的工具循环上限：一个步骤内部最多做这么多次「LLM 往返」，防止模型
// 在同一目标下反复调工具不收敛。全局步数上限在 planner（MAX_PLAN_STEPS = 8）。
const STEP_MAX_ROUNDS = 4;

// 单步失败后的重试上限：正试 1 次 + 重试 2 次 = 最多 3 次尝试。
// 重试能让模型换个工具 / 换个参数 / 换种思路再试，提升鲁棒性。
const STEP_RETRY_LIMIT = 2;

/**
 * 判断一个异常是否为「取消/中断」触发的 AbortError。
 *
 * 为什么需要它：用户主动点「停止」或刷新页面关掉连接，底层的 fetch 会因为 AbortSignal 中止
 * 而抛出 name 为 "AbortError" 的异常。这类异常不应该被当成「模型报错」去重试，而应该立即
 * 向上冒泡、让整轮快速收尾。这里单独抽一个判断函数，避免在多处散落魔法字符串。
 */
function isAbortError(e: unknown): boolean {
  return e instanceof Error && e.name === "AbortError";
}

/** Loop 向外部吐出的事件（SSE 推给前端） */
export type LoopEvent =
  | { type: "tool_call"; toolName: string; args: Record<string, unknown>; callId: string }
  | { type: "tool_result"; toolName: string; result: unknown; callId: string }
  | { type: "tool_error"; toolName: string; error: string; callId: string }
  | { type: "delta"; content: string }
  | { type: "reasoning"; content: string }
  // ── 规划-执行新增事件 ──────────────────────────────────────────
  // 计划创建（steps 是完整 PlanStep 数组，含 status，初值 pending；前端展示进度用）
  | { type: "plan_created"; goal: string; steps: Plan["steps"] }
  // 某一步开始执行（index 为 0-based 序号，前端展示「第 index+1 / total 步」）
  | { type: "step_start"; stepId: string; index: number; total: number; description: string }
  // 某一步执行成功，result 为该步沉淀的文本结果
  | { type: "step_done"; stepId: string; index: number; result: string }
  // 某一步重试后仍失败，error 为失败原因（失败后跳过该步继续下一步）
  | { type: "step_failed"; stepId: string; index: number; error: string }
  // 补问步骤触发暂停（HITL）：question 是要抛给用户的问题文本，steps 是暂停时刻的完整计划快照
  // （含该补问步骤 status="paused"、result=问句）。route 据此持久化 paused 计划，前端据此感知「等待用户输入」。
  | { type: "plan_paused"; goal: string; stepId: string; index: number; question: string; steps: Plan["steps"] }
  // 全部步骤完成，计划收尾（goal + steps 为最终完整快照，供持久化用；completed/total 供进度展示）
  | { type: "plan_done"; goal: string; completed: number; total: number; steps: Plan["steps"] };

/** 落库用的一条工具调用记录（与前端 ToolCallEvent 对齐，只存终态 success/error） */
export interface ToolCallRecord {
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: "success" | "error";
  result?: unknown;
  error?: string;
}

/** 一次 LLM 调用的 token 用量（整个 Loop 会多次调用 LLM，最终累加成这一轮的总用量落库） */
export interface TokenUsage {
  /** 输入 token（prompt） */
  promptTokens: number;
  /** 输出 token（completion，含思考过程） */
  completionTokens: number;
  /** 总计 */
  totalTokens: number;
}

/** 扩展的消息类型，增加 tool 角色（OpenAI function calling 格式） */
type AgentMessage =
  | ChatMessage
  | {
      role: "assistant";
      content: string | null;
      tool_calls: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | {
      role: "tool";
      content: string;
      tool_call_id: string;
    };

/** callLLM 返回的解析结果 */
interface LLMResult {
  /** 模型输出的文本（流式过程中已通过 onEvent 实时吐出，这里是完整拼接供落库用） */
  content: string;
  /** 模型思考过程（流式过程中已实时吐出，这里是完整拼接供落库用） */
  reasoning: string;
  /** 模型发起的工具调用（如果有） */
  toolCalls: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  /** 本次调用的 token 用量（由流式最后的 usage 块给出） */
  usage: TokenUsage;
}

/**
 * 流式调用 LLM。
 *
 * - 文本内容和思考过程通过 onEvent 实时推给前端
 * - tool_calls 的 arguments 是分片到达的，需要累积拼接
 * - 流结束后才知道有没有完整的 tool_calls，此时返回结果给 Loop 做决策
 */
async function callLLM(
  modelId: string,
  messages: AgentMessage[],
  thinking: ThinkingOptions,
  onEvent: (event: LoopEvent) => void,
  signal?: AbortSignal,
): Promise<LLMResult> {
  const meta = getModelMeta(modelId) ?? getModelMeta(DEFAULT_MODEL_ID);
  const provider = meta ? PROVIDERS[meta.provider] : undefined;
  if (!meta || !provider) {
    throw new ProviderError(`未找到模型或供应商配置：${modelId}`);
  }

  const apiKey = process.env[provider.apiKeyEnv];
  if (!apiKey) {
    throw new ProviderError(`未配置 ${provider.apiKeyEnv}，请在 .env.local 中填写`);
  }

  const body: Record<string, unknown> = {
    model: meta.providerModel,
    messages,
    tools: buildToolsSchema(),
    tool_choice: "auto",
    stream: true,
    // 流式默认不回传 token 用量，显式要求最后补一个带 usage 的块（OpenAI 兼容接口通用参数）
    stream_options: { include_usage: true },
  };

  if (provider.thinkingStyle === "deepseek") {
    body.thinking = thinking.enabled ? { type: "enabled" } : { type: "disabled" };
    if (thinking.enabled) body.reasoning_effort = thinking.effort;
  }

  const res = await fetch(`${provider.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new ProviderError(`${provider.name} 请求失败（${res.status}）：${text}`);
  }

  // ── 流式读取 SSE ──────────────────────────────────────────
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // 累积文本内容
  let contentFull = "";
  // 累积思考过程（DeepSeek reasoning_content，多块拼接）
  let reasoningFull = "";
  // 累积 tool_calls：OpenAI 流式返回的 tool_calls 是增量的
  // 每个 chunk 可能带 index、id（通常仅首块）、function.name（首块）、function.arguments（分片）
  interface StreamToolCall {
    id?: string;
    name?: string;
    argsBuffer: string;
  }
  const toolCallMap = new Map<number, StreamToolCall>();
  // token 用量：只在流最后的 usage 块里给出（该块 choices 为空数组，其余块的 usage 为 null）
  let usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // 按行切分 SSE，保留最后一个不完整片段
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;

      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{
            delta?: {
              content?: string | null;
              reasoning_content?: string;
              reasoning?: string;
              tool_calls?: Array<{
                index?: number;
                id?: string;
                type?: string;
                function?: {
                  name?: string;
                  arguments?: string;
                };
              }>;
            };
          }>;
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
          };
        };

        // usage 块优先处理：该块 choices 为空数组，且出现在流最后（其余块 usage 为 null）
        if (json.usage) {
          usage = {
            promptTokens: json.usage.prompt_tokens ?? 0,
            completionTokens: json.usage.completion_tokens ?? 0,
            totalTokens: json.usage.total_tokens ?? 0,
          };
          continue;
        }

        const delta = json.choices?.[0]?.delta;
        if (!delta) continue;

        // 1) 思考过程（DeepSeek reasoning_content）
        const reasoning = delta.reasoning_content ?? delta.reasoning ?? "";
        if (reasoning) {
          reasoningFull += reasoning;
          onEvent({ type: "reasoning", content: reasoning });
        }

        // 2) 正文文本——实时吐出
        const text = delta.content ?? "";
        if (text) {
          contentFull += text;
          onEvent({ type: "delta", content: text });
        }

        // 3) 工具调用增量——拼接
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            let existing = toolCallMap.get(idx);
            if (!existing) {
              existing = { argsBuffer: "" };
              toolCallMap.set(idx, existing);
            }
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name = tc.function.name;
            if (tc.function?.arguments) {
              existing.argsBuffer += tc.function.arguments;
            }
          }
        }
      } catch {
        // 单行 JSON 解析失败，跳过继续
      }
    }
  }

  // ── 流结束，组装最终 toolCalls ─────────────────────────────
  const toolCalls: LLMResult["toolCalls"] = [];
  for (const tc of toolCallMap.values()) {
    let parsedArgs: Record<string, unknown> = {};
    try {
      parsedArgs = tc.argsBuffer ? JSON.parse(tc.argsBuffer) : {};
    } catch {
      // 参数 JSON 不完整时保持空对象
    }
    toolCalls.push({
      id: tc.id ?? `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: tc.name ?? "",
      args: parsedArgs,
    });
  }

  return { content: contentFull, reasoning: reasoningFull, toolCalls, usage };
}

/**
 * 组装「当前步骤」的执行指令。
 *
 * 执行阶段的每一遍 LLM 调用，都是围绕「某一个步骤」展开的。把这个步骤的描述 +
 * 执行纪律拼成一条 user 消息投喂给模型，让它只在当前步骤目标下干活，避免越界。
 */
function buildStepInstruction(step: PlanStep, index: number, total: number): string {
  return [
    `现在请执行第 ${index + 1} / ${total} 个步骤（步骤 id：${step.id}）：`,
    step.description,
    "",
    "要求：",
    "1. 只专注完成这一个步骤，不要越界去做后续步骤的事。",
    "2. 需要查资料、查事实时调用可用工具（get_weather / web_search）；纯推理步骤直接推理即可。",
    "3. 完成后用自然语言汇报这一步的结果；若这一步没有实质产出（例如只是补问用户信息），也请说明。",
  ].join("\n");
}

/**
 * 组装「补问步骤」的执行指令。
 *
 * 补问步骤（askUser=true）和普通步骤的目标完全不同：普通步骤追求「得出结果」，
 * 补问步骤追求「产出一句问题抛给用户、然后停住」。所以这里单独写一条指令，明确告诉模型：
 *   你的输出就是给用户看的问题本身，别调用工具、别加「我来补问」之类的废话。
 *
 * 为什么这段文字会「原样展示给用户」：loop.ts 执行到补问步骤后，会把这步的输出直接作为
 * 本轮对用户的回答（content），前端看到的就是这句问题。所以它必须是一句自然、可直接读的问句。
 */
function buildAskInstruction(step: PlanStep): string {
  return [
    `现在请完成一个「向用户补问」的步骤（步骤 id：${step.id}）：`,
    step.description,
    "",
    "要求：",
    "1. 这一步是要向用户索取缺失的信息，然后等待用户回复，不要调用任何工具。",
    "2. 请直接用自然、友好的中文向用户提出你要问的问题。你输出的这句话会原样展示给用户。",
    "3. 只输出问题本身这一句话，不要在前面加「我来补问一下」「这一步要做的是」之类的解释或铺垫。",
  ].join("\n");
}

/** 汇总阶段投喂给模型的指令：让模型把各步中间结果串成最终回答 */
const SUMMARY_INSTRUCTION = [
  "以上所有步骤已经执行完毕。",
  "现在请把各步骤的中间结果综合起来，给用户一个完整、自然、条理清晰的最终回答。",
  "",
  "要求：",
  "1. 面向用户直接回答，不要复述「步骤 1 / 步骤 2」的执行过程。",
  "2. 覆盖刚才所有步骤的关键结论；某一步失败或没有产出，请如实说明。",
  "3. 除非还有关键信息缺失且必须用工具获取，否则不要再调用工具。",
].join("\n");

/**
 * 从用户消息里提取纯文本（用于「是否简单直答」的判断）。
 *
 * 多模态分段（ChatContentPart[]）里可能混着文本段与图片段，这里只挑文本段拼起来，
 * 图片段用「[图片]」占位顶位，保证长度估算不被图片段截断。
 */
function extractText(userContent: string | ChatContentPart[]): string {
  if (typeof userContent === "string") return userContent.trim();
  return userContent
    .map((p) => (p.type === "text" ? p.text : "[图片]"))
    .join("")
    .trim();
}

/**
 * 判断用户消息是否属于「简单直答」——不值得走规划拆解。
 *
 * 为什么需要这个判断：原本 generatePlan 是「逢消息必拆」，连「你好」「为什么这么多消息」
 * 这种打招呼 / 闲聊 / 追问都要被拆成计划，既白花一次规划调用，又容易把用户原话塞进步骤
 * 描述，导致前端进度面板冒出「你好 0/1 ✅ 你好」这种把用户说话内容当任务的怪象。
 *
 * 这里用启发式（不额外调 LLM）快速判断：只要文本里没有「任务型关键词」，就视为简单直答。
 * 判断为简单直答后走单步计划——注意单步步骤内部仍是完整 ReAct，模型照样能调工具查天气 /
 * 联网搜索（见 buildStepInstruction 的第 2 条要求），所以即使判断偏「激进」，也只是少了
 * 多步拆解的条理性，不会答错。
 *
 * 含图片的消息默认不算简单直答，交给规划器判断（看图 / 对比等可能是复杂多步意图）。
 *
 * @param userContent 用户本轮诉求
 * @returns true = 简单直答（跳过规划走单步）；false = 值得拆多步
 */
function isSimpleQuery(userContent: string | ChatContentPart[]): boolean {
  // 含图片的多模态消息交给规划器判断
  if (Array.isArray(userContent) && userContent.some((p) => p.type !== "text")) {
    return false;
  }
  const text = extractText(userContent);

  // 任务型关键词：出现任意一个，就说明用户在「交代一件要做的事」，值得拆多步。
  const TASK_KEYWORDS = [
    "调研", "分析", "对比", "评估", "梳理", "总结", "报告",
    "帮我", "帮忙", "查一下", "查查", "搜索一下",
    "规划", "筹备", "安排", "写", "生成", "制作", "整理",
    "列出", "清单", "怎么做", "如何", "教程", "步骤", "方案",
  ];
  const hasTaskKeyword = TASK_KEYWORDS.some((k) => text.includes(k));
  return !hasTaskKeyword;
}



/**
 * 单步执行结果的抽象：ok 表示该步是否成功完成。
 */
interface StepOutcome {
  ok: boolean;
  /** 该步最终沉淀的文本结果（ok 为 true 时有意义） */
  text: string;
  /** 失败原因（ok 为 false 时有意义） */
  error: string;
}

/**
 * Agent Loop 的返回结构：无论正常执行还是续跑（resumeLoop），最终都收敛到这一种返回。
 *
 * 相较早期版本新增了 paused（是否因补问步骤而暂停）——route 靠它判断「要不要把计划存成
 * paused 态、用户这轮看到的是问句而不是半成品报告」。其余字段与旧版完全一致，
 * 不会破坏现有调用方（route.ts 只读 content / toolCalls / reasoning / usage）。
 */
export interface LoopResult {
  /** 本轮对用户的最终文本：正常完成为汇总回答；暂停时为补问的问句本身 */
  content: string;
  /** 全程思考过程累积 */
  reasoning: string;
  /** 全程工具调用记录（随回答落库） */
  toolCalls: ToolCallRecord[];
  /** 全程 token 用量 */
  usage: TokenUsage;
  /** 本轮是否因「补问步骤」而暂停，等待用户回复 */
  paused: boolean;
  /**
   * 暂停时的完整计划快照（paused=true 时有值），供 route 持久化 paused 计划；
   * 快照里含各步 status/result，其中补问步骤 status="paused"、result=问句。
   */
  plan?: Plan;
  /** 暂停的补问步骤在 steps 数组中的下标（paused=true 时有值），作断点标记 */
  pausedIndex?: number;
}

/**
 * 执行上下文：把 agentLoop / resumeLoop 两段编排共享的可变状态收拢到一起。
 *
 * 为什么要把这些状态抽成一个对象：对话上下文、工具记录、思考文本、token 用量这些累积器，
 * 原本各自是 agentLoop 里的闭包变量；但「暂停-恢复」要求 resumeLoop 也能复用「执行一步 /
 * 执行工具」这套逻辑，而不是另起炉灶重写一遍。抽成上下文对象后，两条链路共用同一批执行函数，
 * 避免复制粘贴导致两处逻辑逐渐漂移。
 */
interface RunContext {
  /** 对话上下文：system + history + 用户消息 + 各步中间结果，贯穿整轮 */
  conversation: AgentMessage[];
  /** 全程工具调用记录（随回答落库） */
  toolRecords: ToolCallRecord[];
  /** 全程思考过程累积 */
  reasoning: string;
  /** 全程 token 用量累积 */
  usage: TokenUsage;
  /** 取消信号：用户主动停止 / 客户端断开时触发，贯穿到底层模型请求与每一步循环检查 */
  signal?: AbortSignal;
}

/** 深拷贝一份计划的快照（steps 逐个浅拷贝）：事件 / 返回值里暴露的 plan 不能被后续执行原地改掉 */
function snapshotPlan(plan: Plan): Plan {
  return { goal: plan.goal, steps: plan.steps.map((s) => ({ ...s })) };
}

/** 把一次 LLM 调用的用量计入 ctx 的累计（等价于旧版 agentLoop 里的 accumulateUsage 闭包） */
function accumulateUsage(ctx: RunContext, u: TokenUsage): void {
  ctx.usage.promptTokens += u.promptTokens;
  ctx.usage.completionTokens += u.completionTokens;
  ctx.usage.totalTokens += u.totalTokens;
}

/**
 * 执行一组工具调用：逐个执行、把结果回填进 conversation、记录 toolRecords、发事件。
 * （从旧版 agentLoop 闭包里抽出来，改为接收显式 ctx，供 agentLoop / resumeLoop 共用。）
 *
 * @returns 成功 / 失败的调用数，供调用方判断「是否全部失败」
 */
async function executeToolCalls(
  ctx: RunContext,
  toolCalls: LLMResult["toolCalls"],
  onEvent: (event: LoopEvent) => void,
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;

  for (const tc of toolCalls) {
    // 取消检查：用户中途叫停，立即中断，不再执行剩余的工具调用
    if (ctx.signal?.aborted) {
      throw new DOMException("已取消", "AbortError");
    }
    // 通知前端：开始调用工具
    onEvent({ type: "tool_call", toolName: tc.name, args: tc.args, callId: tc.id });

    const tool: ToolDefinition | undefined = getTool(tc.name);
    if (!tool) {
      const errorMsg = `工具「${tc.name}」不存在`;
      onEvent({ type: "tool_error", toolName: tc.name, error: errorMsg, callId: tc.id });
      ctx.toolRecords.push({ callId: tc.id, toolName: tc.name, args: tc.args, status: "error", error: errorMsg });
      ctx.conversation.push({ role: "tool", content: JSON.stringify({ error: errorMsg }), tool_call_id: tc.id });
      failed++;
      continue;
    }

    try {
      const result = await tool.execute(tc.args);
      onEvent({ type: "tool_result", toolName: tc.name, result, callId: tc.id });
      ctx.toolRecords.push({ callId: tc.id, toolName: tc.name, args: tc.args, status: "success", result });
      ctx.conversation.push({ role: "tool", content: JSON.stringify(result), tool_call_id: tc.id });
      succeeded++;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      onEvent({ type: "tool_error", toolName: tc.name, error: errorMsg, callId: tc.id });
      ctx.toolRecords.push({ callId: tc.id, toolName: tc.name, args: tc.args, status: "error", error: errorMsg });
      // 错误也喂回模型，让它决定怎么办（换个工具、换参数、或直接告诉用户）
      ctx.conversation.push({ role: "tool", content: JSON.stringify({ error: errorMsg }), tool_call_id: tc.id });
      failed++;
    }
  }

  return { succeeded, failed };
}

/**
 * 执行「一个步骤」：该步骤内部是一个小型 ReAct 循环（最多 STEP_MAX_ROUNDS 轮工具往返），
 * 步级失败（模型报错 / 工具全部失败 / 轮次超限）时自动回滚重试（最多 STEP_RETRY_LIMIT 次）。
 * （同 executeToolCalls，从旧版 agentLoop 闭包抽离，改收显式 ctx，供两条链路共用。）
 *
 * @param instruction 本步骤的执行指令（已格式化的 user 消息文本）
 * @returns 该步最终结果（ok + 文本结果或失败原因）
 */
async function executeOneStep(
  ctx: RunContext,
  modelId: string,
  thinking: ThinkingOptions,
  instruction: string,
  onEvent: (event: LoopEvent) => void,
): Promise<StepOutcome> {
  // 记录该步开始前 conversation 的长度，作为「失败重试时回滚」的锚点：
  // 一次失败的尝试可能往 conversation 里塞了一堆中间消息（tool_calls / tool 结果），
  // 重试时把这些污染清掉，让模型在干净的上下文里重新尝试。
  const snapshotIndex = ctx.conversation.length;

  let lastError = "未知错误";

  // 重试循环：正试 1 次 + 重试 STEP_RETRY_LIMIT 次
  for (let attempt = 0; attempt <= STEP_RETRY_LIMIT; attempt++) {
    // 非首次尝试：回滚到本步开始前，清掉上一次失败残留的中间消息
    if (attempt > 0) {
      ctx.conversation.splice(snapshotIndex);
    }
    // 投喂本步骤指令
    ctx.conversation.push({ role: "user", content: instruction });

    // 该次尝试是否已经明确失败（true 表示正常推进）
    let attemptOk = true;

    // 步内 ReAct：多轮 LLM 往返，直到模型给出文本结果或触发失败
    for (let round = 0; round < STEP_MAX_ROUNDS; round++) {
      let result: LLMResult;
      try {
        result = await callLLM(modelId, ctx.conversation, thinking, onEvent, ctx.signal);
      } catch (e) {
        // 用户取消：signal 已中止，立即上抛终止整轮，不走重试
        if (isAbortError(e) || ctx.signal?.aborted) throw e;
        // 模型报错（限流 / 网络 / 上游故障等）→ 该次尝试失败，走重试
        lastError = e instanceof Error ? e.message : String(e);
        attemptOk = false;
        break;
      }
      // 累加该步产生的思考与 token 用量（无论最终成败，这些都是真实消耗）
      ctx.reasoning += result.reasoning;
      accumulateUsage(ctx, result.usage);

      // 模型不再发起工具调用 → 说明它给出了这一步的文本结论，该步成功
      if (result.toolCalls.length === 0) {
        // 把本步结果写回 conversation，供后续步骤 / 汇总阶段看到这一步的产出
        ctx.conversation.push({ role: "assistant", content: result.content });
        return { ok: true, text: result.content, error: "" };
      }

      // 有工具调用：先回填 assistant 的 tool_calls 消息
      ctx.conversation.push({
        role: "assistant",
        content: result.content || null,
        tool_calls: result.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      });

      // 执行全部工具，回填结果
      const execOutcome = await executeToolCalls(ctx, result.toolCalls, onEvent);
      // 所有工具都失败 → 该次尝试失败（交给重试，模型换个工具/参数再来）
      if (execOutcome.failed > 0 && execOutcome.succeeded === 0) {
        lastError = "本步骤发起的工具调用全部失败";
        attemptOk = false;
        break;
      }
      // 至少一个工具成功 → 回到 round 循环顶部，让模型综合结果继续推进
    }

    // 到这里有两种可能：
    //   a) attemptOk === false：上面某处已 break，明确失败
    //   b) attemptOk === true 但 round 循环自然跑完：模型一直调工具不给最终文本 → 视作失败
    if (attemptOk) {
      lastError = `步骤内工具调用轮次超限（${STEP_MAX_ROUNDS} 轮），仍未得出结果`;
    }
    // 该次尝试失败，若还有重试额度则进入下一 attempt
  }

  // 所有尝试用尽仍失败：回滚掉最后一次失败尝试残留的中间消息，
  // 避免把半截过程污染给后续步骤；失败的结论由外层统一写回上下文（见 step_failed 分支）。
  ctx.conversation.splice(snapshotIndex);
  return { ok: false, text: "", error: lastError };
}

/**
 * 简单直答：不做规划、不发任何计划/步骤事件，直接围绕用户消息做「单轮或多轮 ReAct」回答。
 *
 * 为什么单独一条路径，而不是复用 executeOneStep / runPlanSteps：那些函数是围绕「步骤」设计的
 * ——会 push 一条「第 x/y 步」的指令、发 step_start / step_done，前端据此渲染「计划进度面板」。
 * 而打招呼、闲聊、追问这类简单直答根本没有「计划」这回事，挂一个进度面板反而突兀
 * （用户会看到「回答用户的问题 / 已完成」这种多余的框）。所以这里只复用最底层的 callLLM +
 * executeToolCalls，跳过一切「步骤」语义与计划事件，前端自然不渲染进度面板。
 *
 * @returns LoopResult（不含 plan 字段，route 层不会落任何计划记录）
 */
async function directReply(
  ctx: RunContext,
  modelId: string,
  thinking: ThinkingOptions,
  onEvent: (event: LoopEvent) => void,
): Promise<LoopResult> {
  // 多轮 ReAct：模型回答若发起工具调用（如查天气、搜索），执行完回填再让模型综合，
  // 直到给出纯文本答案。轮次上限复用 STEP_MAX_ROUNDS，防止模型反复调工具不收敛。
  for (let round = 0; round < STEP_MAX_ROUNDS; round++) {
    let result: LLMResult;
    try {
      result = await callLLM(modelId, ctx.conversation, thinking, onEvent, ctx.signal);
    } catch (e) {
      // 用户取消：立即上抛终止整轮，不做兜底替换
      if (isAbortError(e) || ctx.signal?.aborted) throw e;
      // 模型报错（限流 / 网络 / 上游故障），给一句兜底话术，不让本轮挂掉
      return {
        content: "抱歉，我这边回答时遇到点问题，请稍后重试。",
        reasoning: ctx.reasoning,
        toolCalls: ctx.toolRecords,
        usage: ctx.usage,
        paused: false,
      };
    }
    ctx.reasoning += result.reasoning;
    accumulateUsage(ctx, result.usage);

    // 模型没再调工具 → 这就是最终回答
    if (result.toolCalls.length === 0) {
      ctx.conversation.push({ role: "assistant", content: result.content });
      return {
        content: result.content,
        reasoning: ctx.reasoning,
        toolCalls: ctx.toolRecords,
        usage: ctx.usage,
        paused: false,
      };
    }

    // 有工具调用：先回填 assistant 的 tool_calls 消息，再执行工具回填结果，回到循环让模型综合
    ctx.conversation.push({
      role: "assistant",
      content: result.content || null,
      tool_calls: result.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
      })),
    });
    const execOutcome = await executeToolCalls(ctx, result.toolCalls, onEvent);
    // 工具全部失败 → 给兜底话术
    if (execOutcome.failed > 0 && execOutcome.succeeded === 0) {
      return {
        content: "抱歉，我这边回答时遇到点问题，请稍后重试。",
        reasoning: ctx.reasoning,
        toolCalls: ctx.toolRecords,
        usage: ctx.usage,
        paused: false,
      };
    }
  }

  // 轮次超限仍未拿到文本答案 → 兜底话术
  return {
    content: "抱歉，我一时没答上来，换个说法再问我一次？",
    reasoning: ctx.reasoning,
    toolCalls: ctx.toolRecords,
    usage: ctx.usage,
    paused: false,
  };
}

/**
 * 从 plan.steps[startIndex] 起逐步骤执行，直到：
 *   - 遇 ask_user 补问步骤 → 暂停（返回 paused=true），不执行后续步骤、不进汇总；
 *   - 全部剩余步骤执行完 → 返回 paused=false。
 *
 * 这是 agentLoop 与 resumeLoop 共用的「步骤推进器」：两条链路的差异只在于「从哪一步开始推」——
 * agentLoop 从 0 开始（全新计划），resumeLoop 从补问步骤之后开始（断点续跑）。
 *
 * 补问步骤（askUser=true）的暂停语义：该步 status 置 "paused"（不是 done）、result 存问句文本，
 * 发 plan_paused 事件把「完整计划快照 + 暂停步骤信息」带出去，然后立刻返回——不进汇总，
 * 让用户这轮看到的就是那句问题，而不是基于半成品假设编出来的报告。
 */
async function runPlanSteps(
  ctx: RunContext,
  modelId: string,
  thinking: ThinkingOptions,
  plan: Plan,
  startIndex: number,
  onEvent: (event: LoopEvent) => void,
): Promise<{ paused: boolean; pausedIndex: number }> {
  const totalSteps = plan.steps.length;

  for (let i = startIndex; i < plan.steps.length; i++) {
    // 取消检查：用户叫停后不再开始新的步骤
    if (ctx.signal?.aborted) {
      throw new DOMException("已取消", "AbortError");
    }
    const step = plan.steps[i];
    // 补问步骤走「提问指令」，普通步骤走标准执行指令
    const isAsk = step.askUser === true;

    step.status = "running";
    onEvent({
      type: "step_start",
      stepId: step.id,
      index: i,
      total: totalSteps,
      description: step.description,
    });

    const instruction = isAsk ? buildAskInstruction(step) : buildStepInstruction(step, i, totalSteps);
    // 执行一步（内部自带失败重试）
    const outcome = await executeOneStep(ctx, modelId, thinking, instruction, onEvent);

    // ── 补问步骤：无论模型是否产出问句都要「停住」──────────────
    // 这一步的目标不是「得出结果」，而是「把问题抛给用户等回复」。所以拿到问句文本后
    // 立刻 return，不执行后续步骤、不进汇总。模型万一没产出有效问句，就用步骤描述兜底，
    // 保证用户至少能看到一个可以回答的问题。
    if (isAsk) {
      const question = outcome.ok && outcome.text ? outcome.text : step.description;
      step.status = "paused";
      step.result = question;
      onEvent({
        type: "plan_paused",
        goal: plan.goal,
        stepId: step.id,
        index: i,
        question,
        steps: snapshotPlan(plan).steps,
      });
      return { paused: true, pausedIndex: i };
    }

    if (outcome.ok) {
      step.status = "done";
      step.result = outcome.text;
      onEvent({ type: "step_done", stepId: step.id, index: i, result: outcome.text });
    } else {
      // 重试耗尽仍失败：标记 failed，但「不阻断」，继续执行后续步骤
      step.status = "failed";
      step.result = `失败：${outcome.error}`;
      // 把失败结论明确写回上下文，让后续步骤 / 汇总阶段知道这一步没成功
      ctx.conversation.push({
        role: "assistant",
        content: `（步骤「${step.description}」执行失败，原因：${outcome.error}，后续请跳过并如实说明）`,
      });
      onEvent({ type: "step_failed", stepId: step.id, index: i, error: outcome.error });
    }
  }

  return { paused: false, pausedIndex: -1 };
}

/**
 * 汇总 + 收尾：把各步结果串成最终回答（流式吐 delta），再发 plan_done。
 * agentLoop / resumeLoop 走完全部步骤后都到这里（补问暂停的路径不会走到这）。
 */
async function finishPlan(
  ctx: RunContext,
  modelId: string,
  thinking: ThinkingOptions,
  plan: Plan,
  onEvent: (event: LoopEvent) => void,
): Promise<LoopResult> {
  // 汇总也复用「执行一步」——因为它本质是「最后一个推理步骤」，只是指令变成「综合回答」。
  // executeOneStep 内部已经通过 callLLM 流式吐出 delta，所以最终回答会实时推给前端。
  const summary = await executeOneStep(ctx, modelId, thinking, SUMMARY_INSTRUCTION, onEvent);

  let finalContent: string;
  if (summary.ok) {
    finalContent = summary.text;
  } else {
    // 汇总也失败了（极少见）：给一个兜底话术，保证用户至少能看到一句交代
    finalContent = "抱歉，我在汇总结果时遇到了问题，请稍后重试或换个方式提问。";
    onEvent({ type: "delta", content: finalContent });
  }

  // completed 统一按「status === done」计数：续跑场景下既包含恢复前已完成的步骤，
  // 也包含本次新完成的步骤，进度展示更准确。
  const completed = plan.steps.filter((s) => s.status === "done").length;

  // 收尾：发出 plan_done（带最终完整快照，供 route 持久化）
  onEvent({
    type: "plan_done",
    goal: plan.goal,
    completed,
    total: plan.steps.length,
    steps: snapshotPlan(plan).steps,
  });

  return {
    content: finalContent,
    reasoning: ctx.reasoning,
    toolCalls: ctx.toolRecords,
    usage: ctx.usage,
    paused: false,
  };
}

/**
 * 组装「续跑上下文摘要」：把已完成步骤的结果 + 补问步骤的问答，摘要成一段话喂给模型。
 *
 * 为什么需要它：历史消息里只有「原始请求 / 问句 / 用户回答」这条明线，但中间各步的
 * 工具调用结果、步骤结论只存在于 plan.steps[].result 里（历史消息里没有）。不把这些补回来，
 * 模型续跑时等于「失忆」，会丢掉已完成步骤的成果。这段摘要就是「记忆补丁」。
 *
 * @param pausedIndex 补问步骤下标（-1 表示没找到，此时只回放已完成/失败步骤，不提问答）
 */
function buildResumeRecap(plan: Plan, pausedIndex: number, answer: string): string {
  const lines: string[] = [];
  lines.push(
    "（承接上一轮：你之前已经把这批任务拆成步骤逐一执行，中途向用户补问过信息，现在用户回复了，请继续完成剩下的步骤。）",
  );
  lines.push("");

  const doneSteps = plan.steps.filter((s) => s.status === "done");
  if (doneSteps.length > 0) {
    lines.push("已经完成的步骤及其结果：");
    for (const s of doneSteps) {
      lines.push(`- ${s.description}：${s.result ?? ""}`);
    }
    lines.push("");
  }

  const failedSteps = plan.steps.filter((s) => s.status === "failed");
  if (failedSteps.length > 0) {
    lines.push("已经失败（跳过）的步骤：");
    for (const s of failedSteps) {
      lines.push(`- ${s.description}`);
    }
    lines.push("");
  }

  if (pausedIndex >= 0 && plan.steps[pausedIndex]) {
    const askStep = plan.steps[pausedIndex];
    lines.push(`你之前向用户补问的问题是：${askStep.description}`);
    lines.push(`用户已回复：${answer}`);
    lines.push("");
  }

  lines.push("请从下一个还未完成的步骤继续执行。");
  return lines.join("\n");
}

/**
 * Agent Loop 主函数（重构为「规划-执行」编排，新增补问暂停能力）。
 *
 * 完整流程：
 *   1. generatePlan 拆出计划 → plan_created 事件（失败则降级为单步计划）
 *   2. 逐步骤执行：每步是一个小型 ReAct（该步内可多次调工具），步级失败自动重试
 *   3. 兜底：重试耗尽仍失败的步骤标记 failed，跳过后继续（不阻断后续步骤）
 *   4. 补问暂停：遇到 ask_user 步骤 → 发 plan_paused → 直接返回问句（不做后续步骤、不汇总）
 *   5. 全部步骤结束后，让模型综合各步结果流式吐最终回答 → plan_done 事件
 *
 * @param modelId      项目内模型 id
 * @param systemPrompt 系统提示词
 * @param history      历史消息
 * @param userContent  用户本轮诉求
 * @param thinking     深度思考配置
 * @param onEvent      事件回调（SSE 推给前端）
 * @returns LoopResult：正常完成为最终回答；遇到补问步骤则 paused=true、content=问句、附带计划快照
 */
export async function agentLoop(
  modelId: string,
  systemPrompt: string,
  history: ChatMessage[],
  userContent: string | ChatContentPart[],
  thinking: ThinkingOptions,
  onEvent: (event: LoopEvent) => void,
  signal?: AbortSignal,
): Promise<LoopResult> {
  // ── 执行上下文：system + history + 用户消息 作为对话起点 ───────
  // 后续每一步的中间结果（工具调用、步骤结论）都会继续往里追加，
  // 让后面的步骤与汇总阶段能看到前面步骤的产出。
  const ctx: RunContext = {
    conversation: [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: userContent },
    ],
    toolRecords: [],
    reasoning: "",
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    signal,
  };

  // ── 1. 生成计划（简单直答直接回答；规划失败也退回直答）────
  // 简单直答（打招呼 / 闲聊 / 追问 / 无任务意图）没有「计划」这回事：直接一轮 ReAct 回答，
  // 不发任何 plan / step 事件，前端因此不会渲染「计划进度面板」，体验等同普通聊天。
  if (isSimpleQuery(userContent)) {
    return directReply(ctx, modelId, thinking, onEvent);
  }

  // 尝试规划：只有真正值得拆的任务才走规划。规划失败（JSON 解析失败 / 模型报错 / 返回空）
  // 时，不回退成「单步计划 + 进度面板」——那会冒出一个「回答用户的问题」的假计划框，
  // 观感同样奇怪。直接退回 directReply，让模型围绕用户原话正常回答（该路径照样能调工具
  // 查天气 / 联网搜索），只是不展示计划进度。
  let plan: Plan;
  try {
    const generated = await generatePlan(modelId, userContent, history, signal);
    if (!generated || generated.steps.length === 0) {
      return directReply(ctx, modelId, thinking, onEvent);
    }
    plan = generated;
  } catch {
    return directReply(ctx, modelId, thinking, onEvent);
  }

  // 发出计划创建事件（steps 带初始 pending 状态，供前端画进度条 + route 持久化）
  onEvent({
    type: "plan_created",
    goal: plan.goal,
    steps: snapshotPlan(plan).steps,
  });

  // ── 2. 逐步骤执行（补问步骤会在这里暂停返回）──────────────────
  const run = await runPlanSteps(ctx, modelId, thinking, plan, 0, onEvent);

  if (run.paused) {
    // 遇到补问步骤：直接返回问句，用户这轮看到的就是「请问…」，而不是半成品报告。
    // 这里的完整计划快照供 route 持久化成 paused 态。
    return {
      content: plan.steps[run.pausedIndex].result ?? "",
      reasoning: ctx.reasoning,
      toolCalls: ctx.toolRecords,
      usage: ctx.usage,
      paused: true,
      plan: snapshotPlan(plan),
      pausedIndex: run.pausedIndex,
    };
  }

  // ── 3. 汇总 + 收尾（只有正常走完所有步骤才到这里）──────────────
  return finishPlan(ctx, modelId, thinking, plan, onEvent);
}

/**
 * 从「暂停点」续跑：把用户本轮的回复当作补问步骤的答案，从断点继续执行剩余步骤。
 *
 * 为什么单独一个入口而不是让 route 再调一次 agentLoop：agentLoop 会重新 generatePlan 拆计划，
 * 导致「已经完成的步骤」和「用户已经回答的补问」全部丢失。续跑要保留上一轮的计划与进度，
 * 只在补问步骤之后继续推。
 *
 * @param modelId      项目内模型 id
 * @param systemPrompt 系统提示词
 * @param history      历史消息（已含上一轮的问句 + 本轮用户回答）
 * @param plan         上次暂停时持久化下来的计划（含各步 status/result）
 * @param answer       用户本轮对补问的回复
 * @param thinking     深度思考配置
 * @param onEvent      事件回调（SSE 推给前端）
 * @returns LoopResult：同 agentLoop（可能再次暂停，也可能正常完成）
 */
export async function resumeLoop(
  modelId: string,
  systemPrompt: string,
  history: ChatMessage[],
  plan: Plan,
  answer: string,
  thinking: ThinkingOptions,
  onEvent: (event: LoopEvent) => void,
  signal?: AbortSignal,
): Promise<LoopResult> {
  // ── 执行上下文：system + history（history 已含上一轮问句与本轮回答）────
  const ctx: RunContext = {
    conversation: [{ role: "system", content: systemPrompt }, ...history],
    toolRecords: [],
    reasoning: "",
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    signal,
  };

  // ── 1. 找到暂停的补问步骤，把用户回答作为其产出，使命完成 ─────
  //   status 从 "paused" 翻成 "done"，result = 用户回答，语义是「这一步问到了答案」。
  const pausedIndex = plan.steps.findIndex((s) => s.status === "paused");
  let startIndex = 0;
  if (pausedIndex >= 0) {
    const askStep = plan.steps[pausedIndex];
    askStep.status = "done";
    askStep.result = answer;
    // 断点 = 补问步骤之后第一个（还没处理的）步骤
    startIndex = pausedIndex + 1;
  }

  // ── 2. 上下文重建：把各步中间结果 + 问答摘要喂进对话 ───────────
  ctx.conversation.push({
    role: "user",
    content: buildResumeRecap(plan, pausedIndex, answer),
  });

  // ── 3. 发恢复后计划快照（plan_created）让前端重画进度 ─────────
  //   复用 plan_created 事件（route 收到它时本来就 savePlan("running")），
  //   这样断点恢复天然把 paused 计划翻回 running，route 层无需额外分支。
  onEvent({
    type: "plan_created",
    goal: plan.goal,
    steps: snapshotPlan(plan).steps,
  });

  // ── 4. 从断点继续执行剩余步骤 ─────────────────────────────────
  const run = await runPlanSteps(ctx, modelId, thinking, plan, startIndex, onEvent);

  if (run.paused) {
    // 续跑过程中又遇到一个补问步骤 → 再次暂停（返回新快照）
    return {
      content: plan.steps[run.pausedIndex].result ?? "",
      reasoning: ctx.reasoning,
      toolCalls: ctx.toolRecords,
      usage: ctx.usage,
      paused: true,
      plan: snapshotPlan(plan),
      pausedIndex: run.pausedIndex,
    };
  }

  // ── 5. 全部完成 → 汇总 + 收尾 ─────────────────────────────────
  return finishPlan(ctx, modelId, thinking, plan, onEvent);
}

/**
 * 组装「断点恢复」的上下文摘要：把已完成步骤的结果摘要成一段话喂给模型。
 *
 * 与 buildResumeRecap（补问恢复）的区别：补问恢复要把「你问了什么、用户答了什么」补回来，
 * 而断点恢复没有补问、没有答案，只是「中途被打断、现在接着做」，所以只需要回放已完成/失败
 * 步骤的结果，让模型续跑时不失忆。
 */
function buildStopResumeRecap(plan: Plan): string {
  const lines: string[] = [];
  lines.push(
    "（承接上一轮：你之前已经把这批任务拆成步骤逐一执行，中途被打断，现在继续完成剩下的步骤。）",
  );
  lines.push("");

  const doneSteps = plan.steps.filter((s) => s.status === "done");
  if (doneSteps.length > 0) {
    lines.push("已经完成的步骤及其结果：");
    for (const s of doneSteps) {
      lines.push(`- ${s.description}：${s.result ?? ""}`);
    }
    lines.push("");
  }

  const failedSteps = plan.steps.filter((s) => s.status === "failed");
  if (failedSteps.length > 0) {
    lines.push("已经失败（跳过）的步骤：");
    for (const s of failedSteps) {
      lines.push(`- ${s.description}`);
    }
    lines.push("");
  }

  lines.push("请从下一个还未完成的步骤继续执行。");
  return lines.join("\n");
}

/**
 * 从「停止点」断点恢复：把上次中断的计划接着跑完。
 *
 * 与 resumeLoop（补问续跑）的区别：
 *   - resumeLoop 是「补问步骤等你回复」后继续，需要把补问步骤的答案填回去、
 *     并从补问步骤之后继续；
 *   - 本函数是「用户主动停止 / 刷新断连」后继续，没有补问、没有答案，
 *     只需找到「最后一个已完成步骤」，从它之后继续。
 *
 * 一个容易踩的坑：被停止的那一刻，可能有某个步骤正处于 running（跑了一半被打断）。
 * 它的 status 还挂在 "running" 上，但那次执行已经死了。恢复时不能把它当 done（它没跑完），
 * 必须重置回 pending 重新执行——否则会凭空少一步。
 *
 * @param modelId      项目内模型 id
 * @param systemPrompt 系统提示词
 * @param history      历史消息（不含被打断那轮未完成的占位）
 * @param plan         上次中断时持久化下来的计划（含各步 status/result）
 * @param thinking     深度思考配置
 * @param onEvent      事件回调（SSE 推给前端）
 * @returns LoopResult：同 agentLoop（可能再次暂停，也可能正常完成）
 */
export async function resumeStoppedLoop(
  modelId: string,
  systemPrompt: string,
  history: ChatMessage[],
  plan: Plan,
  thinking: ThinkingOptions,
  onEvent: (event: LoopEvent) => void,
  signal?: AbortSignal,
): Promise<LoopResult> {
  // ── 执行上下文：system + history ─────────────────────────────
  const ctx: RunContext = {
    conversation: [{ role: "system", content: systemPrompt }, ...history],
    toolRecords: [],
    reasoning: "",
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    signal,
  };

  // ── 1. 定位断点：最后一个「已完成」步骤的下标；残留的 running 步骤重置回 pending ──
  //   遍历找出最后一个 done 下标，同时把中断时残留的 running 步骤收回到 pending（重新执行）。
  let lastDoneIndex = -1;
  for (let i = 0; i < plan.steps.length; i++) {
    const s = plan.steps[i];
    if (s.status === "done") {
      lastDoneIndex = i;
    } else if (s.status === "running") {
      // 被停止时正在跑、但没跑完：不能当 done，重置为待执行
      s.status = "pending";
    }
  }
  const startIndex = lastDoneIndex + 1;

  // ── 2. 上下文重建：把已完成步骤的结果摘要喂进对话，避免续跑「失忆」 ───────────
  ctx.conversation.push({
    role: "user",
    content: buildStopResumeRecap(plan),
  });

  // ── 3. 发恢复后计划快照（plan_created）让前端重画进度 ───────────────────
  //   复用 plan_created 事件（route 收到它时本就 savePlan("running")），
  //   这样断点恢复天然把 stopped 计划翻回 running，route 层无需额外分支。
  onEvent({
    type: "plan_created",
    goal: plan.goal,
    steps: snapshotPlan(plan).steps,
  });

  // ── 4. 从断点继续执行剩余步骤 ─────────────────────────────────────
  const run = await runPlanSteps(ctx, modelId, thinking, plan, startIndex, onEvent);

  if (run.paused) {
    // 续跑过程中又遇到一个补问步骤 → 再次暂停（返回新快照）
    return {
      content: plan.steps[run.pausedIndex].result ?? "",
      reasoning: ctx.reasoning,
      toolCalls: ctx.toolRecords,
      usage: ctx.usage,
      paused: true,
      plan: snapshotPlan(plan),
      pausedIndex: run.pausedIndex,
    };
  }

  // ── 5. 全部完成 → 汇总 + 收尾 ─────────────────────────────────
  return finishPlan(ctx, modelId, thinking, plan, onEvent);
}