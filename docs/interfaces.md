# 接口设计

本文档定义 Nexus OS 的对外接口规范，涵盖系统 API、实时通信接口以及插件扩展 SDK 接口。

> **当前状态**：AI Agent 接口已落地（`/api/chat` 流式对话 + `/api/sessions` 会话 CRUD，见「已实现接口」）；其余模块接口仍为规划性设计，将随功能开发逐步实现。

---

## 1. RESTful API

系统对外暴露的 HTTP 接口，供前端页面调用或第三方集成使用。

### 设计原则

- 遵循 RESTful 风格，资源导向
- 统一 JSON 请求/响应格式
- 使用 HTTP 状态码表示请求结果
- 支持分页、过滤、排序

### 统一响应格式

```json
{
  "code": 200,
  "message": "success",
  "data": {}
}
```

### 错误响应格式

```json
{
  "code": 400,
  "message": "错误描述",
  "error": "ERROR_CODE"
}
```

### 核心 API 模块（规划）

| 模块 | 路径前缀 | 说明 |
|------|----------|------|
| 工具中心 | `/api/tools/` | 工具列表查询、工具执行、执行结果获取 |
| 文件管理 | `/api/files/` | 文件浏览、上传、下载、删除、搜索 |
| AI Agent | `/api/chat` + `/api/sessions` | ✅ 已实现：流式对话（SSE）、会话 CRUD、消息历史 |
| 知识库 | `/api/knowledge/` | 知识条目 CRUD、智能检索、标签管理 |
| 自动化 | `/api/automation/` | 工作流 CRUD、任务触发、执行日志 |
| 系统设置 | `/api/settings/` | 配置读写、模型管理 |

### 已实现接口（AI Agent）

以下接口为当前真实实现，与上文规划的「统一 JSON 格式」不同，对话接口采用 SSE 流式返回。

#### 发送对话消息（流式）

```
POST /api/chat
Content-Type: application/json

{
  "content": "用户消息文本",
  "sessionId": "会话 id（可选，不传则新建会话）",
  "model": "模型 id（可选，默认 deepseek-v4-flash）",
  "thinking": { "enabled": true, "effort": "low|high|max" },
  "images": ["data:image/png;base64,..."]   // 可选，仅视觉模型
}
```

返回 `text/event-stream`，事件类型：

- `delta`：正文片段（content）
- `reasoning`：思考过程片段（不落库）
- `error`：错误信息（message）
- `done`：完成（sessionId、title）

#### 会话管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/sessions` | 会话列表（按更新时间排序） |
| POST | `/api/sessions` | 新建会话 |
| GET | `/api/sessions/[id]` | 会话消息历史 |
| PATCH | `/api/sessions/[id]` | 重命名（body：`{ title }`） |
| DELETE | `/api/sessions/[id]` | 删除会话 |

### 示例接口

#### 工具执行

```
POST /api/tools/execute
{
  "toolId": "image-compress",
  "params": {
    "files": ["path/to/image.png"],
    "quality": 80
  }
}

Response:
{
  "code": 200,
  "data": {
    "taskId": "task_xxx",
    "status": "processing"
  }
}
```

#### 知识库检索

```
POST /api/knowledge/search
{
  "query": "如何配置 Next.js",
  "limit": 10
}

Response:
{
  "code": 200,
  "data": {
    "results": [
      {
        "id": "kb_001",
        "title": "Next.js 配置指南",
        "content": "...",
        "score": 0.95
      }
    ]
  }
}
```

---

## 2. WebSocket 实时通信

用于需要实时推送的场景，如长时间任务的进度通知等。（注：AI 对话流式输出当前实际采用 SSE，详见「已实现接口」。）

### 连接地址

```
ws://localhost:3000/ws
```

### 消息格式

```json
{
  "type": "event_type",
  "payload": {}
}
```

### 事件类型（规划）

| 类型 | 方向 | 说明 |
|------|------|------|
| `agent.message` | Server → Client | AI Agent 流式回复片段 |
| `agent.complete` | Server → Client | AI Agent 回复完成 |
| `task.progress` | Server → Client | 工具执行进度更新 |
| `task.complete` | Server → Client | 工具执行完成 |
| `notification` | Server → Client | 系统通知推送 |

---

## 3. 插件 SDK 接口

为第三方插件开发者提供的扩展接口，允许插件注册新工具、扩展功能。

### 插件生命周期

```
注册 → 初始化 → 运行 → 销毁
```

### 插件描述文件

每个插件需提供 `plugin.json`：

```json
{
  "name": "my-tool-plugin",
  "version": "1.0.0",
  "description": "插件描述",
  "author": "作者名",
  "main": "index.ts",
  "tools": [
    {
      "id": "my-tool",
      "name": "我的工具",
      "description": "工具功能描述",
      "icon": "tool-icon",
      "params": [
        {
          "name": "input",
          "type": "file",
          "required": true,
          "description": "输入文件"
        }
      ]
    }
  ]
}
```

### 插件 API（规划）

```typescript
interface NexusPlugin {
  // 插件初始化
  onInit(context: PluginContext): Promise<void>;

  // 插件销毁
  onDestroy(): Promise<void>;

  // 注册工具
  registerTool(tool: ToolDefinition): void;

  // 注册 UI 面板
  registerPanel(panel: PanelDefinition): void;
}

interface PluginContext {
  // 获取系统配置
  getConfig(key: string): any;

  // 访问知识库
  knowledge: KnowledgeAPI;

  // 发送通知
  notify(message: string): void;

  // 文件系统操作
  fs: FileSystemAPI;
}
```

### 插件开发指南

> 插件系统尚未实现，具体开发指南将在插件系统开发阶段补充。

预计支持的能力：
- 工具插件：注册自定义处理工具，出现在工具中心
- UI 插件：扩展页面面板、添加自定义视图
- 数据插件：接入外部数据源，扩展知识库
- 自动化插件：注册自定义工作流节点
