# Nexus OS

> 个人数字操作系统（Personal Digital Operating System）

Nexus OS 是一个面向个人用户打造的智能工作空间，将日常工具、自动化流程、知识管理以及 AI Agent 能力整合到统一的平台中。

让工具成为能力，让 AI 成为助手，让个人数据真正服务于自己。

---

## 功能模块

| 模块 | 路由 | 说明 |
|------|------|------|
| 总览 | `/` | 系统 Dashboard：状态概览、快捷入口、最近活动 |
| AI Agent | `/agent` | 对话 UI mock（消息流/任务/语音图片输入），知识库优先问答（RAG）规划中 |
| 知识库 | `/knowledge` | 知识流/我的文章/收件箱/回收站/订阅源/自测/回顾，采集→审查→整理→阅读流水线（当前为 UI mock） |
| 工具中心 | `/tools` | 59 个工具卡片、搜索筛选、三档响应式（工具均为 mock） |
| 文件管理 | `/files` | 本地文件浏览、分类、搜索与管理（待开发） |
| 自动化 | `/automation` | 定时采集综述、智能复习、工作流编排与定时任务（待开发） |
| 设置 | `/settings` | 系统配置、模型接入与个性化设置 |

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 核心框架 | Next.js 16 · React 19 · TypeScript 5 |
| UI 组件 | shadcn/ui 4.18 · Lucide React |
| 样式 | Tailwind CSS 4 |
| 包管理 | pnpm 10（workspace 支持） |

---

## 环境要求

- **Node.js**：18.17.0 或更高版本（推荐 20.x）
- **包管理器**：pnpm 10.x

> 项目使用 `pnpm` 作为包管理器，且依赖 `pnpm-lock.yaml` 锁定版本，因此不建议使用 npm 或 yarn 安装依赖。

## 快速开始

```bash
# 1. 切换到正确的 Node.js 版本（如果你使用 nvm）
nvm use 20

# 2. 安装 pnpm（如果尚未安装）
npm install -g pnpm

# 3. 安装依赖
pnpm install

# 4. 启动开发服务器
pnpm dev

# 构建生产版本
pnpm build

# 代码检查
pnpm lint
```

### 常见问题

**Q：为什么必须用 pnpm？**

pnpm 是一个快速、节省磁盘空间的包管理器。本项目在 `package.json` 中通过 `packageManager` 字段指定了 pnpm，并且使用 `pnpm-lock.yaml` 锁定依赖版本。用 npm/yarn 安装可能导致依赖不一致。

**Q：执行 `pnpm dev` 报错 `Cannot find module 'node:events'`？**

这说明当前 Node.js 版本过低。请使用 `nvm use 20` 切换到 Node 20，然后重新执行命令。

---

## 项目文档

详尽的项目文档位于 `docs/` 目录下，主要面向 AI 与项目维护者：

| 文档 | 说明 |
|------|------|
| [架构设计](docs/architecture.md) | 系统分层架构、模块划分、技术选型理由、数据流 |
| [AI Agent 设计](docs/agent-design.md) | Agent 核心能力、架构规划、子模块说明 |
| [接口设计](docs/interfaces.md) | RESTful API、WebSocket 通信、插件 SDK 接口 |
| [目录结构说明](docs/structure.md) | 项目中每个目录和关键文件的用途 |
| [开发规范](docs/conventions.md) | 配色、组件样式、命名约定、技术约定 |
| [开发日志](docs/changelog.md) | 按日期记录的变更流水账 |

---

## 路线图

- [x] 项目初始化与技术选型
- [x] 基础 UI 框架搭建（侧边栏抽屉/常驻、PageHeader、Footer、全站响应式三档断点）
- [x] 核心页面 UI mock（总览、Agent 对话、知识库 7 section、工具中心、设置框架）
- [ ] 工具中心：图片压缩、OCR、格式转换等工具真实实现
- [ ] 文件管理：本地文件浏览与操作
- [ ] AI Agent：模型接入、知识库优先问答（RAG）、对话与工具调用
- [ ] 知识库：真实存储、采集、AI 整理与语义检索
- [ ] 自动化：定时采集综述、智能复习、工作流编排
- [ ] 插件系统：支持第三方工具扩展
