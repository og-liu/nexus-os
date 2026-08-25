// 工具定义层：schema（给模型看的说明书）+ execute（给代码执行的函数）
// 每个工具由这两部分组成。模型只看 schema 决定调什么、传什么参数；
// execute 在服务端运行，模型看不到代码，只能拿到返回结果。

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

// ─── 工具注册表 ───────────────────────────────────────────────
// 后续加工具只需要在这里加一行。Loop 代码完全不用改。

export const tools: ToolDefinition[] = [weatherTool, webSearchTool];

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
