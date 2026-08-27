// 工具定义层：schema（给模型看的说明书）+ execute（给代码执行的函数）
// 每个工具由这两部分组成。模型只看 schema 决定调什么、传什么参数；
// execute 在服务端运行，模型看不到代码，只能拿到返回结果。

import type Database from "better-sqlite3";

export interface ToolDefinition {
  /** 工具名（模型用这个名字发起调用） */
  name: string;
  /** 给模型看的说明书：什么时候用、怎么用 */
  description: string;
  /** 参数定义（JSON Schema 格式） */
  parameters: Record<string, unknown>;
  /** 实际执行函数，接收模型传的参数，返回结果 */
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

// ─── WMO 天气代码 → 中文描述 ─────────────────────────────────
// Open-Meteo 返回 weather_code 是数字，需要转成人能读懂的文字
// 参考：https://open-meteo.com/en/docs#weathervariables
const WMO_CODES: Record<number, string> = {
  0: "晴",
  1: "晴间多云",
  2: "多云",
  3: "阴",
  45: "雾",
  48: "雾凇",
  51: "小毛毛雨",
  53: "中毛毛雨",
  55: "大毛毛雨",
  56: "冻毛毛雨",
  57: "强冻毛毛雨",
  61: "小雨",
  63: "中雨",
  65: "大雨",
  66: "冻雨",
  67: "强冻雨",
  71: "小雪",
  73: "中雪",
  75: "大雪",
  77: "米雪",
  80: "小阵雨",
  81: "中阵雨",
  82: "强阵雨",
  85: "小阵雪",
  86: "强阵雪",
  95: "雷阵雨",
  96: "雷阵雨伴冰雹",
  99: "强雷阵雨伴冰雹",
};

// ─── 真实天气工具（Open-Meteo 免费 API，无需 Key）───────────────
// 两步：先用地名查坐标 → 再用坐标查天气
// 模型可能为了对比两个城市天气而连续调用两次——这就是多步 Loop。

async function geocodeCity(city: string): Promise<{
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1: string;
} | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`地理编码服务异常 (${res.status})`);
  const data = await res.json();
  if (!data.results?.length) return null;
  const r = data.results[0];
  return {
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    country: r.country ?? "",
    admin1: r.admin1 ?? "",
  };
}

async function fetchWeather(lat: number, lon: number) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m` +
    `&timezone=Asia/Shanghai`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`天气服务异常 (${res.status})`);
  const data = await res.json();
  return data.current as {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    weather_code: number;
    wind_speed_10m: number;
  };
}

const weatherTool: ToolDefinition = {
  name: "get_weather",
  description:
    "查询指定城市的当前实时天气。当用户询问天气、气温、湿度、穿衣建议、出行天气等问题时使用。" +
    "支持全球城市，一次只能查一个城市；如果用户问多个城市，请分别调用多次。",
  parameters: {
    type: "object",
    properties: {
      city: {
        type: "string",
        description: "城市名称，如「北京」「上海」「东京」「New York」",
      },
    },
    required: ["city"],
  },
  async execute(args) {
    const city = String(args.city ?? "").trim();
    if (!city) return { error: "请提供城市名称" };

    // 第一步：地名 → 坐标
    const geo = await geocodeCity(city);
    if (!geo) {
      return { error: `找不到「${city}」，请检查城市名称是否正确` };
    }

    // 第二步：坐标 → 天气
    const w = await fetchWeather(geo.latitude, geo.longitude);
    const condition = WMO_CODES[w.weather_code] ?? `未知(${w.weather_code})`;

    return {
      city: geo.name,
      region: [geo.admin1, geo.country].filter(Boolean).join(" · "),
      temp: w.temperature_2m,
      condition,
      humidity: w.relative_humidity_2m,
      wind: `${w.wind_speed_10m} km/h`,
      updated: w.time,
    };
  },
};

// ─── 联网搜索工具（Tavily）────────────────────────────────────

const webSearchTool: ToolDefinition = {
  name: "web_search",
  description:
    "搜索互联网获取实时信息。当用户询问最新新闻、产品发布、价格、赛事结果、" +
    "政策变化、技术文档、你不确定的事实等问题时使用。" +
    "不要用于：你已经确定知道的常识性问题、数学计算、代码编写。" +
    "一次搜索不够可以换关键词再搜，但不要用相同关键词重复搜。",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "搜索关键词，建议 2~6 个词，简洁准确，避免过长",
      },
    },
    required: ["query"],
  },
  async execute(args) {
    const query = String(args.query ?? "").trim();
    if (!query) return { error: "请提供搜索关键词" };

    const { createSearchProvider } = await import("@/lib/search");
    const provider = createSearchProvider();
    const results = await provider.search(query, { maxResults: 6 });

    return {
      query,
      total: results.length,
      results: results.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet,
        content: r.content,
        publishedDate: r.publishedDate,
      })),
    };
  },
};

// ─── 知识流检索工具（K3：让 Agent 能查主人自己的知识流）───────
// 与天气/联网搜索的「向外问别人」不同，这两个工具是「向内查自己家」。
//
// 分层设计（可测试性）：业务逻辑抽成 runXxx(conn, args) 内核函数，
// 数据库连接由外部注入；ToolDefinition.execute 只是薄壳——解析参数、
// 取连接、调内核。这样单元测试可以用 :memory: 内存库直测内核，
// 不碰真实的 data/nexus.db。
//
// 语义红线：只有 kept（已保留）的内容对 Agent 可见。
// inbox 还没拍板、trashed 在回收站、discarded 从未保留过——
// 主人没决定留下的东西，不该被 AI 当作事实来引用。

const KIND_LABEL: Record<string, string> = {
  note: "手写笔记",
  captured: "采集条目",
};

const STATUS_LABEL: Record<string, string> = {
  inbox: "待拍板",
  trashed: "回收站",
  discarded: "已放弃",
};

/** 毫秒时间戳 → "2026-08-26"，给模型看人话日期而不是一串数字 */
function fmtDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

interface KnowledgeSearchArgs {
  q?: unknown;
  kind?: unknown;
  limit?: unknown;
}

// 导出是为了让单元测试能用内存库直测业务逻辑（见文件头分层设计说明）
export async function runKnowledgeSearch(
  conn: Database.Database,
  args: KnowledgeSearchArgs,
) {
  const q = String(args.q ?? "").trim();
  if (!q) return { error: "请提供搜索关键词" };

  // kind 收窄是可选项；模型传了别的值就按「搜全部」处理——
  // 宽容非法输入，别因为一个小参数把整个调用炸掉
  const kindArg = String(args.kind ?? "").trim();
  const kind =
    kindArg === "note" || kindArg === "captured" ? kindArg : undefined;

  const limitRaw = Number(args.limit);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.floor(limitRaw), 10)
      : 5;

  const { searchHybrid } = await import("@/lib/knowledge/store");

  // 查询词的语义指纹：K4 起 search 升级为混合检索（关键词+语义双路）。
  // 嵌入服务不可用时优雅降级为纯关键词路——搜索永远可用，
  // 只是「意思相近字面不同」的召回能力暂时缺席
  let qVector: Float32Array | null = null;
  let mode = "keyword";
  try {
    const { embedText } = await import("@/lib/embeddings");
    qVector = await embedText(q);
    mode = "hybrid";
  } catch {
    // 保持 qVector=null，searchHybrid 内部会跳过语义路
  }

  const { items } = searchHybrid(conn, { q, qVector, kind, limit });

  return {
    query: q,
    mode: mode === "hybrid" ? "hybrid(关键词+语义)" : "keyword(嵌入服务不可用已降级)",
    total: items.length,
    results: items.map((it) => ({
      id: it.id,
      title: it.title || "(无标题)",
      kind: KIND_LABEL[it.kind] ?? it.kind,
      tags: it.tags,
      savedAt: fmtDate(it.created_at),
      // 摘要只给前 200 字：搜索阶段帮模型判断「哪条相关」就够，
      // 全文留给 read_knowledge 精读——防止一次多结果的搜索撑爆上下文窗口
      excerpt:
        it.content.replace(/\s+/g, " ").trim().slice(0, 200) +
        (it.content.length > 200 ? "…" : ""),
    })),
  };
}

interface KnowledgeReadArgs {
  id?: unknown;
}

export async function runKnowledgeRead(
  conn: Database.Database,
  args: KnowledgeReadArgs,
) {
  const id = String(args.id ?? "").trim();
  if (!id) return { error: "请提供条目 id（先用 search_knowledge 搜索获得）" };

  const { getItem } = await import("@/lib/knowledge/store");
  const item = getItem(conn, id);

  if (!item) return { error: `知识流中不存在 id 为 ${id} 的条目` };

  // 非 kept 不给内容，但要说明原因——模型能向用户解释，
  // 而不是抛一个莫名其妙的错误
  if (item.status !== "kept") {
    return {
      error: `该条目当前状态为「${STATUS_LABEL[item.status]}」，不在可查阅范围内`,
    };
  }

  return {
    id: item.id,
    title: item.title || "(无标题)",
    kind: KIND_LABEL[item.kind] ?? item.kind,
    tags: item.tags,
    source: item.source,
    sourceUrl: item.source_url,
    savedAt: fmtDate(item.created_at),
    updatedAt: fmtDate(item.updated_at),
    content: item.content,
  };
}

const knowledgeSearchTool: ToolDefinition = {
  name: "search_knowledge",
  description:
    "搜索主人的个人知识流（已保存的文章、笔记和采集条目）。" +
    "当用户提到「我收藏过的」「我记的笔记」「我之前存的」，或问题可能与主人收集过的资料相关时先来这里找。" +
    "返回摘要列表；需要某条的完整内容时再用 read_knowledge 按 id 读取。",
  parameters: {
    type: "object",
    properties: {
      q: {
        type: "string",
        description: "搜索关键词，会在标题和正文里做子串匹配",
      },
      kind: {
        type: "string",
        enum: ["note", "captured"],
        description:
          "可选。只搜手写笔记(note)或只搜采集的文章(captured)，不传则全部搜",
      },
      limit: {
        type: "number",
        description: "可选。最多返回几条，默认 5，最大 10",
      },
    },
    required: ["q"],
  },
  async execute(args) {
    const { getDb } = await import("@/lib/db");
    return runKnowledgeSearch(getDb(), args as KnowledgeSearchArgs);
  },
};

const knowledgeReadTool: ToolDefinition = {
  name: "read_knowledge",
  description:
    "读取知识流中单条内容的完整正文。必须先通过 search_knowledge 拿到 id 再调用。",
  parameters: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "search_knowledge 结果里返回的条目 id",
      },
    },
    required: ["id"],
  },
  async execute(args) {
    const { getDb } = await import("@/lib/db");
    return runKnowledgeRead(getDb(), args as KnowledgeReadArgs);
  },
};

// ─── 工具注册表 ───────────────────────────────────────────────
// 后续加工具只需要在这里加一行。Loop 代码完全不用改。

export const tools: ToolDefinition[] = [
  weatherTool,
  webSearchTool,
  knowledgeSearchTool,
  knowledgeReadTool,
];

export function getTool(name: string): ToolDefinition | undefined {
  return tools.find((t) => t.name === name);
}

/** 生成传给 LLM API 的 tools 字段（只含 schema，不含 execute） */
export function buildToolsSchema(): Array<Record<string, unknown>> {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}
