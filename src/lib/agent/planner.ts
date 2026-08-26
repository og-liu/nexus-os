// 规划器：把「用户一句话」拆成「一串可执行步骤」。
//
// 与 loop.ts 里的 callLLM（流式、带工具）不同，规划阶段的目标是「一次性拿到一份
// 结构化的 JSON 计划」，不需要流式、也不需要工具调用。所以这里自己实现一个
// 非流式 fetch，直接复用 providers 的模型路由与思考参数方言，但：
//   - stream: false（一次拿完整结果，省去 SSE 解析）
//   - 不传 tools 字段（规划器只做「拆解」，不实际调工具，避免模型在规划阶段就乱调）
//   - system prompt 强制要求输出 JSON，且给出严格的字段格式

import { PROVIDERS } from "@/lib/providers";
import { getModelMeta, DEFAULT_MODEL_ID } from "@/lib/models";
import { ProviderError } from "@/lib/providers/openai";
import type { ChatMessage, ChatContentPart } from "@/lib/providers/types";
import type { Plan, PlanStep } from "./plan";

/** 步骤数上限：规划过长会导致执行阶段不收敛、耗时失控，这里硬性截断 */
export const MAX_PLAN_STEPS = 8;

// ─── 规划 System Prompt ───────────────────────────────────────────
// 关键约束都写在这里，靠 prompt 引导模型产出可直接 parse 的 JSON。
// 「只描述要做什么，不写结果」是规划质量的关键——写了结果模型就会在执行阶段提前编造结论。
const PLANNER_SYSTEM_PROMPT = [
  "你是任务规划器。收到用户的一个请求后，先把它拆解成一份可执行的步骤清单，再输出 JSON。",
  "",
  "# 任务拆解规则",
  "1. 一步只做一件事：每个步骤只包含一个明确动作，不要把多个动作塞进同一步。",
  "2. 优先使用已注册工具：可用的工具只有两个——get_weather（查天气）、web_search（联网搜索）。",
  "   需要查资料、查事实时优先用工具；纯推理、组织语言、做判断的步骤 tool 设为 null。",
  "3. 缺少关键信息要先补问：如果用户请求缺少必要信息（例如要查天气却没给出城市），",
  "   把「向用户补问关键信息」也作为一个步骤（tool 为 null）。",
  "4. 补问步骤要打标记：凡是「需要向用户索取缺失信息、等待用户回复」的步骤，",
  "   必须在那个步骤的 JSON 里加 \"ask_user\": true；且 ask_user 为 true 的步骤，tool 必须是 null。",
  "   （这个标记会让执行器在该步停下来把问题抛给用户，而不是继续往下跑。）",
  "5. 步骤排好先后：有依赖关系的步骤必须按顺序排列，被依赖的步骤靠前。",
  "6. 只描述「要做什么」，不要写「结果会是什么」；结果要靠真正执行才得出。",
  "7. 中间步骤只产「素材」，不做交付：每个步骤只负责搜集资料、执行动作、沉淀要点笔记；",
  "   面向用户的最终成文由系统在全部步骤完成后统一完成，因此禁止拆出「撰写报告 / 整合成文 / 输出给用户」这类交付型步骤。",
  "8. 严格输出 JSON，不要输出任何其他解释文字或代码块标记，格式如下：",
  '{"goal":"一句话概括用户目标","steps":[{"id":"step1","description":"步骤描述","tool":"web_search","reason":"为什么需要这一步"}]}',
  "   补问步骤示例（注意 ask_user 字段，且 tool 为 null）：",
  '{"goal":"查询指定城市天气","steps":[{"id":"step1","description":"向用户确认要查询的城市","tool":null,"reason":"用户没给出城市，需要先确认","ask_user":true},{"id":"step2","description":"查询该城市天气","tool":"get_weather","reason":"拿到城市后查询"}]}',
  "",
  "# 字段说明",
  "- goal：一句话概括用户最终想要什么。",
  "- steps：步骤数组（1~8 个）。每个元素含 id（step1、step2…）、description（做什么）、",
  "  tool（只能是 get_weather / web_search / null 三者之一）、reason（为什么需要这一步）。",
  "- ask_user：可选字段，布尔值。仅当该步骤是「向用户补问信息、等待回复」时设为 true（此时 tool 必须为 null）；普通步骤不写这个字段。",
].join("\n");

/**
 * 生成计划：调用一次 LLM，把用户请求拆解成 Plan。
 *
 * 采用非流式调用（stream:false），因为规划阶段只要最终那份 JSON，不需要边生成边展示。
 * 思考参数走各供应商方言：规划是结构化输出，统一关闭深度思考以提速——
 *   - deepseek 方言显式传 thinking:{type:"disabled"}
 *   - openai 方言（OpenRouter 等）不传 reasoning 对象（默认即为关闭）
 *
 * @param modelId    项目内模型 id（最终回落 DEFAULT_MODEL_ID）
 * @param userContent 用户本轮诉求（文本或图文分段）
 * @param history    历史消息（让规划贴合上下文，例如指代消解）
 * @returns 解析成功的 Plan；解析失败 / LLM 返回空时返回 null（由调用方降级处理）
 */
export async function generatePlan(
  modelId: string,
  userContent: string | ChatContentPart[],
  history: ChatMessage[],
  signal?: AbortSignal,
): Promise<Plan | null> {
  // ── 1. 解析模型与供应商（与 loop.ts 的 callLLM 同一套路由，保证行为一致）──
  const meta = getModelMeta(modelId) ?? getModelMeta(DEFAULT_MODEL_ID);
  const provider = meta ? PROVIDERS[meta.provider] : undefined;
  if (!meta || !provider) {
    throw new ProviderError(`未找到模型或供应商配置：${modelId}`);
  }

  const apiKey = process.env[provider.apiKeyEnv];
  if (!apiKey) {
    throw new ProviderError(`未配置 ${provider.apiKeyEnv}，请在 .env.local 中填写`);
  }

  // ── 2. 组装请求体 ───────────────────────────────────────────────
  // 注意这里「不传 tools」：规划器只看规则做拆解，不实际执行工具。
  const body: Record<string, unknown> = {
    model: meta.providerModel,
    messages: [
      { role: "system", content: PLANNER_SYSTEM_PROMPT },
      ...history,
      { role: "user", content: userContent },
    ],
    stream: false,
  };

  // 思考参数方言：与 providers/openai.ts 保持一致，只是规划阶段固定关闭思考
  if (provider.thinkingStyle === "deepseek") {
    body.thinking = { type: "disabled" };
  }
  // openai 方言：不传 reasoning 对象即关闭思考，无需显式处理

  // ── 3. 非流式请求 ───────────────────────────────────────────────
  const res = await fetch(`${provider.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ProviderError(`${provider.name} 请求失败（${res.status}）：${text}`);
  }

  // 非流式响应的结构：choices[0].message.content 即完整回答文本
  const data = (await res.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>;
  } | null;
  const rawText = data?.choices?.[0]?.message?.content ?? "";
  if (!rawText.trim()) return null;

  // ── 4. 解析 JSON 计划 ───────────────────────────────────────────
  const plan = parsePlan(rawText);
  if (!plan) return null;

  // ── 5. 步骤数上限截断 ───────────────────────────────────────────
  // 防止模型拆出过长的计划导致执行阶段循环失控、耗时爆炸
  if (plan.steps.length > MAX_PLAN_STEPS) {
    plan.steps = plan.steps.slice(0, MAX_PLAN_STEPS);
  }

  // 兜底：goal 缺失（模型没给）时用中性描述顶替，保证进度提示永远有东西可显示。
  // 不再用用户原话补 goal——把原话顶在进度面板标题上，观感是把用户说的话当成了任务目标。
  if (!plan.goal) {
    plan.goal = "处理用户请求";
  }

  return plan;
}

/**
 * 从 LLM 原始输出里鲁棒地提取并解析出 Plan。
 *
 * 大模型经常不老实——会包 ```json 代码块、前后加解释文字、甚至带尾逗号等小瑕疵，
 * 所以这里不直接 JSON.parse(rawText)，而是先「清场」再解析，解析不了返回 null。
 *
 * @param rawText LLM 的原始文本输出
 * @returns 合法 Plan；无法提取/校验失败返回 null
 */
export function parsePlan(rawText: string): Plan | null {
  let text = rawText.trim();
  if (!text) return null;

  // 1) 剥离 ```json ... ``` 或 ``` ... ``` 代码块包裹
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fence) text = fence[1].trim();

  // 2) 若仍有前后多余的解释文字，只截取「最外一层大括号」包裹的 JSON 对象
  //    找第一个 { 和最后一个 }，两者之间大概率就是真正的 JSON
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    text = text.slice(start, end + 1);
  }

  // 3) 清理常见 JSON 小瑕疵：去掉 } 或 ] 前面的尾逗号（JSON 规范不允许尾逗号）
  //    这是启发式替换，LLM 输出里偶发的尾巴逗号基本都能被救回来
  text = text.replace(/,\s*([}\]])/g, "$1");

  // 4) 解析 + 结构校验
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }

  // goal 必须是字符串；steps 必须是非空数组
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const rec = obj as { goal?: unknown; steps?: unknown };
  const goal = typeof rec.goal === "string" ? rec.goal : "";
  const stepsRaw = rec.steps;
  if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) return null;

  // 逐步校验：每步必须有非空 id 和 description，否则整体判定为不合法
  const steps: PlanStep[] = [];
  for (const s of stepsRaw) {
    if (!s || typeof s !== "object") return null;
    const id = typeof s.id === "string" ? s.id : "";
    const description = typeof s.description === "string" ? s.description : "";
    if (!id || !description) return null;

    // 读取补问标记：只有显式 true 才算补问步骤（其余值一律当 false，避免脏数据误触发暂停）
    const askUser = s.ask_user === true;

    // tool 只在两个注册工具名里取值，其余（含非法值）一律回落 null
    let tool: string | null =
      s.tool === "get_weather" || s.tool === "web_search" ? s.tool : null;

    // 不变量兜底：补问步骤必须 tool=null（纯补问，不查数据）。
    // 即使模型不遵守「ask_user 步骤 tool 必须为 null」的约定、带了个工具名过来，
    // 这里也强制清掉，保证执行器遇到补问步骤时走「停下来等用户」而不是走「调工具」。
    if (askUser) tool = null;

    steps.push({
      id,
      description,
      tool,
      reason: typeof s.reason === "string" ? s.reason : "",
      status: "pending", // 规划产出时统一 pending，执行阶段再流转
      result: undefined,
      // 补问标记透传给执行器，供其识别「该步该停」；普通步骤不写（undefined）
      askUser: askUser ? true : undefined,
    });
  }

  return { goal, steps };
}