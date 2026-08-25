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
 * 规划失败时的降级计划：把用户原始诉求当成「单个推理步骤」。
 *
 * 规划器可能返回 null（JSON 解析失败）或抛异常（模型/网络故障）。此时不能让整个请求
 * 直接挂掉，退化为「单步直接回答」，等效于走回旧版单步 ReAct 的能力，保证用户体验不崩。
 */
function fallbackPlan(userContent: string | ChatContentPart[]): Plan {
  const text =
    typeof userContent === "string"
      ? userContent
      : userContent
          .map((p) => (p.type === "text" ? p.text : "[图片]"))
          .join("")
          .trim();
  return {
    goal: text ? text.slice(0, 50) : "回答用户请求",
    steps: [
      {
        id: "step1",
        description: text || "根据用户请求给出回答",
        tool: null,
        reason: "规划失败，退化为单步直接回答",
        status: "pending",
      },
    ],
  };
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
 * Agent Loop 主函数（重构为「规划-执行」编排）。
 *
 * 完整流程：
 *   1. generatePlan 拆出计划 → plan_created 事件（失败则降级为单步计划）
 *   2. 逐步骤执行：每步是一个小型 ReAct（该步内可多次调工具），步级失败自动重试
 *   3. 兜底：重试耗尽仍失败的步骤标记 failed，跳过后继续（不阻断后续步骤）
 *   4. 全部步骤结束后，让模型综合各步结果流式吐最终回答 → plan_done 事件
 *
 * @param modelId      项目内模型 id
 * @param systemPrompt 系统提示词
 * @param history      历史消息
 * @param userContent  用户本轮诉求
 * @param thinking     深度思考配置
 * @param onEvent      事件回调（SSE 推给前端）
 * @returns 模型最终回答文本 + 全程工具调用记录 + 思考 + token 用量（用于落库）
 *   —— 返回签名保持不变，route.ts 无需改动落库逻辑
 */
export async function agentLoop(
  modelId: string,
  systemPrompt: string,
  history: ChatMessage[],
  userContent: string | ChatContentPart[],
  thinking: ThinkingOptions,
  onEvent: (event: LoopEvent) => void,
): Promise<{ content: string; reasoning: string; toolCalls: ToolCallRecord[]; usage: TokenUsage }> {
  // ── 全程共享的对话上下文 ───────────────────────────────────────
  // 这比旧版的单线程 messages 更关键：它贯穿「规划后的每一步 + 汇总」，让后面的步骤
  // 能看到前面步骤的中间结果。每条消息的读写都由下面的闭包函数完成。
  const conversation: AgentMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userContent },
  ];

  // ── 全程累积器（供闭包函数读写，最后汇总进返回值）──────────────
  // 工具调用记录：整轮 Loop 里发生的所有工具调用，最终随回答一起落库
  const toolRecords: ToolCallRecord[] = [];
  // 全程思考过程：规划后的每一步 + 汇总，都可能产生 reasoning，全部拼接
  let reasoningFull = "";
  // 全程 token 用量：每一步 + 汇总的 LLM 调用用量累加，作为这一轮的总消耗落库
  // （注：规划阶段的非流式调用用量未计入——它属于编排开销，且 generatePlan 不自带用量返回）
  const totalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  /** 把一次 LLM 调用的用量计入全局累计 */
  const accumulateUsage = (u: TokenUsage) => {
    totalUsage.promptTokens += u.promptTokens;
    totalUsage.completionTokens += u.completionTokens;
    totalUsage.totalTokens += u.totalTokens;
  };

  /**
   * 执行一组工具调用：逐个执行、把结果回填进 conversation、记录 toolRecords、发事件。
   *
   * 这是从旧版 agentLoop 里抽出来的核心逻辑，被「执行一步」复用。
   * @returns 成功 / 失败的调用数，供调用方判断「是否全部失败」
   */
  const executeToolCalls = async (
    toolCalls: LLMResult["toolCalls"],
  ): Promise<{ succeeded: number; failed: number }> => {
    let succeeded = 0;
    let failed = 0;

    for (const tc of toolCalls) {
      // 通知前端：开始调用工具
      onEvent({ type: "tool_call", toolName: tc.name, args: tc.args, callId: tc.id });

      const tool: ToolDefinition | undefined = getTool(tc.name);
      if (!tool) {
        const errorMsg = `工具「${tc.name}」不存在`;
        onEvent({ type: "tool_error", toolName: tc.name, error: errorMsg, callId: tc.id });
        toolRecords.push({ callId: tc.id, toolName: tc.name, args: tc.args, status: "error", error: errorMsg });
        conversation.push({ role: "tool", content: JSON.stringify({ error: errorMsg }), tool_call_id: tc.id });
        failed++;
        continue;
      }

      try {
        const result = await tool.execute(tc.args);
        onEvent({ type: "tool_result", toolName: tc.name, result, callId: tc.id });
        toolRecords.push({ callId: tc.id, toolName: tc.name, args: tc.args, status: "success", result });
        conversation.push({ role: "tool", content: JSON.stringify(result), tool_call_id: tc.id });
        succeeded++;
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        onEvent({ type: "tool_error", toolName: tc.name, error: errorMsg, callId: tc.id });
        toolRecords.push({ callId: tc.id, toolName: tc.name, args: tc.args, status: "error", error: errorMsg });
        // 错误也喂回模型，让它决定怎么办（换个工具、换参数、或直接告诉用户）
        conversation.push({ role: "tool", content: JSON.stringify({ error: errorMsg }), tool_call_id: tc.id });
        failed++;
      }
    }

    return { succeeded, failed };
  };

  /**
   * 执行「一个步骤」：该步骤内部是一个小型 ReAct 循环（最多 STEP_MAX_ROUNDS 轮工具往返），
   * 步级失败（模型报错 / 工具全部失败 / 轮次超限）时自动回滚重试（最多 STEP_RETRY_LIMIT 次）。
   *
   * 之所以把这一步做成闭包，是为了复用外层的 conversation / toolRecords / totalUsage 等累积器，
   * 避免参数爆炸，也让「步骤内多轮工具调用 + 失败重试」的逻辑集中在一个函数里。
   *
   * @param instruction 本步骤的执行指令（已格式化的 user 消息文本）
   * @returns 该步最终结果（ok + 文本结果或失败原因）
   */
  const executeOneStep = async (instruction: string): Promise<StepOutcome> => {
    // 记录该步开始前 conversation 的长度，作为「失败重试时回滚」的锚点：
    // 一次失败的尝试可能往 conversation 里塞了一堆中间消息（tool_calls / tool 结果），
    // 重试时把这些污染清掉，让模型在干净的上下文里重新尝试。
    const snapshotIndex = conversation.length;

    let lastError = "未知错误";

    // 重试循环：正试 1 次 + 重试 STEP_RETRY_LIMIT 次
    for (let attempt = 0; attempt <= STEP_RETRY_LIMIT; attempt++) {
      // 非首次尝试：回滚到本步开始前，清掉上一次失败残留的中间消息
      if (attempt > 0) {
        conversation.splice(snapshotIndex);
      }
      // 投喂本步骤指令
      conversation.push({ role: "user", content: instruction });

      // 该次尝试是否已经明确失败（true 表示正常推进）
      let attemptOk = true;

      // 步内 ReAct：多轮 LLM 往返，直到模型给出文本结果或触发失败
      for (let round = 0; round < STEP_MAX_ROUNDS; round++) {
        let result: LLMResult;
        try {
          result = await callLLM(modelId, conversation, thinking, onEvent);
        } catch (e) {
          // 模型报错（限流 / 网络 / 上游故障等）→ 该次尝试失败，走重试
          lastError = e instanceof Error ? e.message : String(e);
          attemptOk = false;
          break;
        }
        // 累加该步产生的思考与 token 用量（无论最终成败，这些都是真实消耗）
        reasoningFull += result.reasoning;
        accumulateUsage(result.usage);

        // 模型不再发起工具调用 → 说明它给出了这一步的文本结论，该步成功
        if (result.toolCalls.length === 0) {
          // 把本步结果写回 conversation，供后续步骤 / 汇总阶段看到这一步的产出
          conversation.push({ role: "assistant", content: result.content });
          return { ok: true, text: result.content, error: "" };
        }

        // 有工具调用：先回填 assistant 的 tool_calls 消息
        conversation.push({
          role: "assistant",
          content: result.content || null,
          tool_calls: result.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: { name: tc.name, arguments: JSON.stringify(tc.args) },
          })),
        });

        // 执行全部工具，回填结果
        const execOutcome = await executeToolCalls(result.toolCalls);
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
    conversation.splice(snapshotIndex);
    return { ok: false, text: "", error: lastError };
  };

  // ── 1. 生成计划（失败则降级为单步计划）────────────────────────
  let plan: Plan;
  try {
    const generated = await generatePlan(modelId, userContent, history);
    if (generated && generated.steps.length > 0) {
      plan = generated;
    } else {
      plan = fallbackPlan(userContent);
    }
  } catch {
    plan = fallbackPlan(userContent);
  }

  // 发出计划创建事件（steps 带初始 pending 状态，供前端画进度条 + route 持久化）
  onEvent({
    type: "plan_created",
    goal: plan.goal,
    steps: plan.steps.map((s) => ({ ...s })),
  });

  // ── 2. 逐步骤执行 ───────────────────────────────────────────────
  const totalSteps = plan.steps.length;
  let completedSteps = 0;

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    step.status = "running";
    onEvent({
      type: "step_start",
      stepId: step.id,
      index: i,
      total: totalSteps,
      description: step.description,
    });

    // 执行一步（内部自带失败重试）
    const outcome = await executeOneStep(buildStepInstruction(step, i, totalSteps));

    if (outcome.ok) {
      step.status = "done";
      step.result = outcome.text;
      completedSteps++;
      onEvent({ type: "step_done", stepId: step.id, index: i, result: outcome.text });
    } else {
      // 重试耗尽仍失败：标记 failed，但「不阻断」，继续执行后续步骤
      step.status = "failed";
      step.result = `失败：${outcome.error}`;
      // 把失败结论明确写回上下文，让后续步骤 / 汇总阶段知道这一步没成功
      conversation.push({
        role: "assistant",
        content: `（步骤「${step.description}」执行失败，原因：${outcome.error}，后续请跳过并如实说明）`,
      });
      onEvent({ type: "step_failed", stepId: step.id, index: i, error: outcome.error });
    }
  }

  // ── 3. 汇总：让模型把各步结果串成最终回答（流式吐 delta）────────
  // 汇总也复用「执行一步」——因为它本质是「最后一个推理步骤」，只是指令变成「综合回答」。
  // executeOneStep 内部已经通过 callLLM 流式吐出 delta，所以最终回答会实时推给前端。
  const summary = await executeOneStep(SUMMARY_INSTRUCTION);

  let finalContent: string;
  if (summary.ok) {
    finalContent = summary.text;
  } else {
    // 汇总也失败了（极少见）：给一个兜底话术，保证用户至少能看到一句交代
    finalContent = "抱歉，我在汇总结果时遇到了问题，请稍后重试或换个方式提问。";
    onEvent({ type: "delta", content: finalContent });
  }

  // ── 4. 收尾：发出 plan_done（带最终完整快照，供 route 持久化）────
  onEvent({
    type: "plan_done",
    goal: plan.goal,
    completed: completedSteps,
    total: totalSteps,
    steps: plan.steps.map((s) => ({ ...s })),
  });

  return {
    content: finalContent,
    reasoning: reasoningFull,
    toolCalls: toolRecords,
    usage: totalUsage,
  };
}