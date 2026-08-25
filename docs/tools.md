# Nexus OS 工具系统文档

> 最后更新：2026-08-25
> 对应代码：`src/lib/agent/tools.ts`、`src/lib/agent/loop.ts`、`src/lib/search/`

---

## 一、工具系统架构

```
用户提问
  │
  ▼
agentLoop()                          ← src/lib/agent/loop.ts
  │
  ├─→ callLLM()  带上 tools schema   ← 模型决定是否调工具
  │     │
  │     ├─ 无 tool_calls → 返回最终回答（流式吐出）
  │     │
  │     └─ 有 tool_calls → 逐个执行
  │           │
  │           ├─ getTool(name)       ← src/lib/agent/tools.ts 注册表
  │           │     │
  │           │     ├─ weatherTool     → Open-Meteo API
  │           │     └─ webSearchTool   → Tavily API（经 search 抽象层）
  │           │
  │           └─ 结果加回 messages → 回到循环顶部（最多 5 轮）
  │
  ▼
SSE 事件推给前端（tool_call / tool_result / delta / done）
```

**核心原则：** 加一个新工具只需在 `tools.ts` 注册表里加一行，Loop 代码完全不用改。

---

## 二、工具注册表

文件：`src/lib/agent/tools.ts`

```typescript
export const tools: ToolDefinition[] = [weatherTool, webSearchTool];
```

### ToolDefinition 接口

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 工具名，模型用这个名字发起调用 |
| `description` | string | 给模型看的说明书：什么时候用、怎么用 |
| `parameters` | JSON Schema | 参数定义，模型据此生成调用参数 |
| `execute(args)` | function | 服务端执行函数，模型看不到代码，只能拿到返回值 |

### 辅助函数

- `getTool(name)` — 按名查找工具
- `buildToolsSchema()` — 生成传给 LLM API 的 tools 字段（只含 schema，不含 execute）

---

## 三、已注册工具

### 3.1 get_weather — 实时天气查询

| 项 | 值 |
|----|-----|
| 工具名 | `get_weather` |
| 数据来源 | [Open-Meteo](https://open-meteo.com/)（免费，无需 API Key） |
| 能力 | 查询全球任意城市的实时天气 |
| 参数 | `city` (string, 必填) — 城市名，支持中英文 |
| 返回 | city / region / temp(°C) / condition / humidity(%) / wind(km/h) / updated |

**执行流程：**

1. 调 Open-Meteo Geocoding API，城市名 → 经纬度
2. 调 Open-Meteo Forecast API，经纬度 → 实时天气数据
3. WMO weather_code 数字翻译为中文天气描述（晴/多云/小雨/雷阵雨等）

**模型使用指引：**
- 一次只查一个城市；对比多城市需分别调用多次（触发多轮 Loop）
- 天气类问题应优先用此工具，不要用搜索替代

**WMO 天气代码映射表：**

| 代码 | 天气 | 代码 | 天气 | 代码 | 天气 |
|------|------|------|------|------|------|
| 0 | 晴 | 51-57 | 毛毛雨 | 80-82 | 阵雨 |
| 1 | 晴间多云 | 61-67 | 雨 | 85-86 | 阵雪 |
| 2 | 多云 | 71-77 | 雪 | 95 | 雷阵雨 |
| 3 | 阴 | 45-48 | 雾 | 96-99 | 雷阵雨伴冰雹 |

---

### 3.2 web_search — 联网搜索

| 项 | 值 |
|----|-----|
| 工具名 | `web_search` |
| 数据来源 | [Tavily](https://tavily.com/)（1000 次/月免费，需 API Key） |
| 能力 | 搜索互联网获取实时信息，返回清洗后的正文片段 |
| 参数 | `query` (string, 必填) — 搜索关键词，建议 2~6 个词 |
| 返回 | query / total / results[] |

**返回结构：**

```typescript
{
  query: "Next.js 16 新特性",
  total: 6,
  results: [
    {
      title: "Next.js 16 发布公告",
      url: "https://nextjs.org/blog/...",
      snippet: "前 200 字摘要...",
      content: "前 500 字正文...",
      score: 0.95,
      publishedDate: "2026-08-20"
    }
  ]
}
```

**模型使用指引：**
- 用于：最新新闻、产品发布、价格、赛事结果、政策变化、技术文档、不确定的事实
- 不用于：常识性问题、数学计算、代码编写、天气查询（用 get_weather）
- 一次搜索不够可换关键词再搜，不要重复相同关键词
- 回答中引用搜索结果时，用 `[序号]` 角标标注，末尾列出参考链接

**环境变量：**

```bash
# .env.local（不入 Git）
SEARCH_PROVIDER=tavily
TAVILY_API_KEY=tvly-xxxxxxxx
```

**搜索配置：**

| 参数 | 值 | 说明 |
|------|-----|------|
| max_results | 6 | 每次返回 6 条结果 |
| search_depth | basic | basic 快且省；advanced 质量更高但慢且贵 |
| content 截断 | 500 字 | 防止单条结果吃太多 token |
| snippet 截断 | 200 字 | 列表展示用 |
| 请求超时 | 15 秒 | 超时自动 abort |

---

## 四、搜索供应商抽象层

文件：`src/lib/search/`

```
search/
├── types.ts    ← SearchProvider 接口 + SearchResult 类型
├── tavily.ts   ← TavilySearchProvider 实现
└── index.ts    ← 工厂函数 createSearchProvider()
```

### 切换供应商

在 `.env.local` 改 `SEARCH_PROVIDER`，然后在 `index.ts` 加对应分支：

```typescript
// 未来加 Serper 示例：
if (provider === "serper") {
  return new SerperSearchProvider(process.env.SERPER_API_KEY!);
}
```

只需新建一个实现 `SearchProvider` 接口的类，业务代码零改动。

---

## 五、Agent Loop 机制

文件：`src/lib/agent/loop.ts`

### 循环流程

```
for step = 0 to 4 (MAX_STEPS=5):
    1. callLLM(messages) — 真流式调用（stream:true），带 tools schema
       · 正文/思考实时通过 onEvent("delta"/"reasoning") 推给前端
       · tool_calls 的 arguments 按 index 增量拼接到流结束
    2. 如果无 tool_calls → 最终回答已流式吐完 → return
    3. 如果有 tool_calls:
       a. assistant 消息（含 tool_calls）加入 messages
       b. 逐个执行工具：
          - onEvent("tool_call") → 前端显示执行中
          - tool.execute(args)
          - 成功 → onEvent("tool_result")，结果作为 tool 消息加入
          - 失败 → onEvent("tool_error")，错误信息作为 tool 消息加入
       c. 回到步骤 1（模型拿到工具结果后再决策）
    4. 超过 5 轮 → 返回兜底提示
```

### SSE 事件类型

| 事件 | 触发时机 | 前端展示 |
|------|----------|----------|
| `tool_call` | 模型决定调工具 | 工具行出现，spinner 转动 |
| `tool_result` | 工具执行成功 | spinner 变绿勾，可展开看结果 |
| `tool_error` | 工具执行抛异常 | spinner 变红叉，显示错误 |
| `delta` | 模型最终文本逐块输出 | 打字机效果渲染回复 |
| `reasoning` | 模型思考过程（DeepSeek） | 思考过程块（默认展开，可点击收起） |

### 安全边界

| 限制 | 值 | 目的 |
|------|-----|------|
| MAX_STEPS | 5 | 防模型陷入工具调用死循环 |
| 搜索超时 | 15s | 单次搜索不能无限等 |
| 搜索结果数 | 6 条 | 控制 token 消耗 |
| 单条 content | 500 字 | 防止单条结果撑爆上下文 |
| 总请求超时 | 60s | 沿用接口层超时保护 |

---

## 六、前端展示

文件：`src/app/agent/page.tsx`

### ToolCallsBlock 组件

- **默认折叠**：一行摘要，如 `🔍 搜索 1 次 · 6 条结果` 或 `🌤 查询天气 · 北京、上海`
- **执行中**：spinner + 正在执行的动作描述
- **展开详情**：
  - 天气：每行一个城市 `✓ 北京 · 晴 28°C`
  - 搜索：每次搜索列出前 4 条结果标题（可点击跳转），超过 4 条显示「等 N 条」
- **部分失败**：橙色警告图标（城市名查不到等非致命情况）
- **多工具混合**：天气和搜索分组显示，摘要用空格分隔

### 控件锁定

对话生成中（`isLoading=true`），以下控件全部禁用并变灰：
- 模型选择
- 深度思考开关及强度
- 图片上传
- 语音输入
- 发送按钮（已有）

---

## 七、如何添加新工具

1. 在 `src/lib/agent/tools.ts` 中定义工具：

```typescript
const myTool: ToolDefinition = {
  name: "my_tool",
  description: "告诉模型什么时候用这个工具",
  parameters: {
    type: "object",
    properties: {
      param1: { type: "string", description: "参数说明" },
    },
    required: ["param1"],
  },
  async execute(args) {
    // 服务端逻辑
    return { result: "..." };
  },
};
```

2. 注册到数组：

```typescript
export const tools: ToolDefinition[] = [weatherTool, webSearchTool, myTool];
```

3. 如果工具需要外部 API：
   - API Key 写 `.env.local`，用 `process.env.XXX` 读取
   - 如有多个供应商可能，按 `src/lib/search/` 的模式建抽象层
   - 超时控制用 `AbortController`

4. 如果前端需要特殊展示，在 `ToolCallsBlock` 组件中加对应 `toolName` 的渲染分支。

5. 在系统提示词（`route.ts` 的 `SYSTEM_PROMPT`）中补充工具使用规范。

**完成。Loop、SSE、前端事件流都不需要改。**

---

## 八、环境变量汇总

| 变量 | 必需 | 说明 |
|------|------|------|
| `DEEPSEEK_API_KEY` | 是 | DeepSeek 模型 API Key |
| `TAVILY_API_KEY` | 是（用搜索时） | Tavily 搜索 API Key |
| `SEARCH_PROVIDER` | 否 | 搜索供应商，默认 `tavily` |
