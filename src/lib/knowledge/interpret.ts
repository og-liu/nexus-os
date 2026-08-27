// 自动解读（阶段3 P1）：AI 给每条采集生成「一页纸导读」。
//
// 三个产出一次生成（一次 LLM 调用出全部，省 token 省延迟）：
// - summary：50-150 字说清「这条讲什么、值不值得读」——对标 Cubox 的
//   收藏后摘要，核心场景是「被标题党骗进来之前先看一眼」
// - questions：读完能回答的 2-3 个问题——比摘要更克制，只给「提问」
//   不剧透答案，帮用户自己判断要不要花时间
// - tags：候选标签——打标签是知识流最大的摩擦点，AI 给选项、人来勾选，
//   既不费劲（不用从零想）又不失控（不自动贴）
//
// 触发模型（与阶段2 的 45s 自动重试同款套路）：
// - 手动采集 / 重试补全成功 → route 层 scheduleInterpret（fire-and-forget，
//   不阻塞响应，Set 防重复登记）
// - RSS 批量条目不自动解读：一次 ingest 可能灌十几条，token 成本不可控，
//   详情页的「AI 先帮我看看」按钮兜底
// - KNOWLEDGE_AUTO_INTERPRET=0 可整体关掉自动触发（手动按钮不受限）

import type Database from "better-sqlite3";
import { getDb } from "@/lib/db";
import {
  getFirstAvailableModelId,
  streamChat,
  type ChatMessage,
} from "@/lib/providers";
import { getItem, listTags, updateItem, type KnowledgeItemRow } from "./store";

/** 单条解读的输入上限：正文截前 6000 字。LLM 判断「值不值得读」看开头
 *  足矣（写作惯例重点前置），全文塞进去只是烧 token */
const MAX_CONTENT_CHARS = 6000;
/** 喂给模型的已有标签池上限：个人库标签几十个是常态，全量给反而稀释注意力 */
const MAX_TAG_POOL = 50;

/** 进行中的解读登记：防同一条被并发解读（schedule 与手动按钮同时触发等场景） */
const pending = new Set<string>();

/** 自动解读总开关：默认开。设 KNOWLEDGE_AUTO_INTERPRET=0 / off / false 关闭 */
function isAutoDisabled(): boolean {
  const flag = (process.env.KNOWLEDGE_AUTO_INTERPRET ?? "").trim().toLowerCase();
  return ["0", "off", "false"].includes(flag);
}

/** fire-and-forget 登记：调用方不 await，落库成功即返回；
 *  失败只打日志不外抛——后台任务的失败不该变成用户面前的报错弹窗 */
export function scheduleInterpret(id: string): void {
  if (isAutoDisabled() || pending.has(id)) return;
  pending.add(id);
  interpretItem(getDb(), id)
    .catch((e) => {
      console.warn(
        "[knowledge:interpret] 自动解读失败（静默）:",
        e instanceof Error ? e.message : e,
      );
    })
    .finally(() => {
      pending.delete(id);
    });
}

/** 模型输出 → 结构化结果的清洗边界：LLM 偶尔不听话（超长、字段类型飘），
 *  逐字段钳制而不是整体作废——能救多少救多少，坏的单独丢 */
function sanitizeOutput(
  raw: string,
): { summary: string; questions: string[]; tags: string[] } | null {
  // 剥 markdown 代码围栏：模型爱把 JSON 包在 ```json ... ``` 里
  const stripped = raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
  const obj = parsed as Record<string, unknown>;

  const summary =
    typeof obj.summary === "string" ? obj.summary.trim().slice(0, 300) : "";
  if (!summary) return null; // 摘要都没有 = 这次生成没意义，整体作废

  const questions = Array.isArray(obj.questions)
    ? obj.questions
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim().slice(0, 60))
        .filter(Boolean)
        .slice(0, 3)
    : [];

  const tags = Array.isArray(obj.tags)
    ? obj.tags
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim().slice(0, 20))
        .filter(Boolean)
        .slice(0, 5)
    : [];

  return { summary, questions, tags };
}

/** 构造解读 prompt：给模型看的「任务说明书 + 材料」 */
function buildPrompt(item: KnowledgeItemRow, tagPool: string[]): string {
  const content = item.content.slice(0, MAX_CONTENT_CHARS);
  const poolHint =
    tagPool.length > 0
      ? `\n已有标签池（优先从中选择，没有合适的再新建）：${tagPool.join("、")}`
      : "";
  return `你是个人知识流的解读助手。请阅读下面这条收藏的内容，输出一个 JSON 对象，帮助主人快速判断「值不值得细读」。

要求：
- summary：50 到 150 字，说清这条内容讲了什么、对读者可能有什么用。用大白话，不用行业黑话，像跟朋友转述一样
- questions：2 到 3 个「读完这条能回答的问题」，每个不超过 30 字。只提问，不剧透答案
- tags：3 到 5 个候选标签，简短（2-6 个字），覆盖内容主题
${poolHint}

只输出 JSON 本体，格式：
{"summary": "...", "questions": ["...", "..."], "tags": ["...", "..."]}

标题：${item.title || "（无标题）"}
正文：
${content}`;
}

/**
 * 解读单条并落库。返回更新后的完整行（详情页直接用它刷新）。
 * - 已生成过且非 force：直接返回现状（幂等，防重复烧钱）
 * - 没正文（降级条目）或正文过短：跳过生成——没东西可解读，
 *   等重试补全后再来
 * force=true 供手动「重新生成」使用（旧解读不满意可重跑）
 */
export async function interpretItem(
  conn: Database.Database,
  id: string,
  force = false,
): Promise<KnowledgeItemRow> {
  const item = getItem(conn, id);
  if (!item) throw new Error("知识条目不存在");
  if (item.ai_interpreted_at && !force) return item; // 已生成，不重复烧钱
  if (!item.content.trim() || item.content.trim().length < 50) {
    throw new Error("正文太短或还没抓到，暂时没什么可解读的");
  }

  // 标签池：高频标签优先给（被用过多次的标签更可能再次适用）
  const tagPool = listTags(conn)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_TAG_POOL)
    .map((t) => t.tag);

  const messages: ChatMessage[] = [
    { role: "user", content: buildPrompt(item, tagPool) },
  ];
  // 流式接口当一次性用：onDelta 丢弃增量，只等最终完整文本。
  // 深度思考关掉——判断「值不值得读」是轻量任务，不需要推理链，
  // flash 级模型几秒出结果才是这个功能的正确体感
  const raw = await streamChat(
    getFirstAvailableModelId(),
    messages,
    { enabled: false, effort: "low" },
    () => {},
  );

  const cleaned = sanitizeOutput(raw);
  if (!cleaned) {
    throw new Error("模型输出无法解析成解读结果（可稍后再试一次）");
  }

  const updated = updateItem(conn, id, {
    ai_summary: cleaned.summary,
    ai_questions: JSON.stringify(cleaned.questions),
    ai_tags: JSON.stringify(cleaned.tags),
    ai_interpreted_at: Date.now(),
  });
  if (!updated) throw new Error("条目不存在（可能刚被删除）");
  return updated;
}
