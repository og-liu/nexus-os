// 知识库集合路由（K1 采集入口）。
//
// 职责边界：route 层只做三件事——参数解析、HTTP 语义映射（400/404/500）、调 store。
// 数据清洗和业务校验都在 store 层完成（K0 定下的分层），这里不重复造轮子，
// 未来 Agent 工具直接复用 store 时行为与 HTTP 入口完全一致。
//
// 为什么 counts 放进 GET 响应而不是单独接口：前端导航要显示各状态计数角标，
// 列表和计数几乎总是同时需要，一次往返拿齐比拆两次请求更省也更不容易出现
// 「列表刷新了、角标还是旧值」的不同步。

import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import {
  countsByStatus,
  createItem,
  listItems,
  purgeExpiredTrash,
  type KnowledgeKind,
  type KnowledgeStatus,
} from "@/lib/knowledge/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // 每次请求都读最新库，不做任何缓存

/** 状态白名单校验：非法值在这里拦下返回 400（客户端错），不让它流进 store 变成 500（服务端错） */
function parseStatus(raw: string | null): KnowledgeStatus | undefined | "invalid" {
  if (raw == null || raw === "") return undefined;
  return raw === "inbox" || raw === "kept" || raw === "discarded" || raw === "trashed"
    ? (raw as KnowledgeStatus)
    : "invalid";
}

/** 出身白名单校验：captured（采集）/ note（手写文章） */
function parseKind(raw: string | null): KnowledgeKind | undefined | "invalid" {
  if (raw == null || raw === "") return undefined;
  return raw === "captured" || raw === "note" ? (raw as KnowledgeKind) : "invalid";
}

// GET /api/knowledge?status=inbox&kind=captured&q=关键词&tag=标签&limit=50&offset=0
// 返回 { items, total, counts }
export async function GET(req: NextRequest) {
  const status = parseStatus(req.nextUrl.searchParams.get("status"));
  if (status === "invalid") {
    return NextResponse.json(
      { error: "status 仅允许 inbox / kept / discarded / trashed" },
      { status: 400 },
    );
  }
  const kind = parseKind(req.nextUrl.searchParams.get("kind"));
  if (kind === "invalid") {
    return NextResponse.json(
      { error: "kind 仅允许 captured / note" },
      { status: 400 },
    );
  }

  // 分页参数：parseInt 失败（NaN）时回落默认值，limit 封顶交给 store 再兜一道底
  const sp = req.nextUrl.searchParams;
  const parsedLimit = parseInt(sp.get("limit") ?? "", 10);
  const parsedOffset = parseInt(sp.get("offset") ?? "", 10);

  try {
    const db = getDb();
    // 懒清理：列表请求顺手把过期回收站条目物理删除。单机 SQLite 不值得为
    // 这件事养定时任务，过期内容反正不会出现在任何视图里
    purgeExpiredTrash(db);
    const result = listItems(db, {
      status,
      // 调用方没点名要回收站时，常规列表不掺已删内容——分页计数才不会错位。
      // 显式传 status=trashed 的查询（回收站视图）不受影响
      notStatus: status === undefined ? "trashed" : undefined,
      kind,
      q: sp.get("q") ?? undefined,
      tag: sp.get("tag") ?? undefined,
      limit: Number.isNaN(parsedLimit) ? undefined : parsedLimit,
      offset: Number.isNaN(parsedOffset) ? undefined : parsedOffset,
    });
    return NextResponse.json({ ...result, counts: countsByStatus(db) });
  } catch (e) {
    console.error("[knowledge:list]", e);
    return NextResponse.json({ error: "读取知识列表失败" }, { status: 500 });
  }
}

// POST /api/knowledge —— 创建条目，两种出身：
//   默认（采集）：粘贴文本 / Markdown，落库进 inbox 待拍板
//   kind=note（手写文章）：创建即 kept——自己写的东西不需要拍板
// body: { title?, content, tags?, source?, kind? }
export async function POST(req: NextRequest) {
  // json() 可能因空 body / 非 JSON 抛异常，catch 成 null 统一走 400
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求体必须是 JSON 对象" }, { status: 400 });
  }

  const isNote = body.kind === "note";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  let title = typeof body.title === "string" ? body.title.trim() : "";

  if (!title && !content) {
    return NextResponse.json({ error: "标题和正文至少填一项" }, { status: 400 });
  }

  // 用户只粘了一大段没写标题：从正文第一行截一段当标题，采集体验才顺滑。
  // 截断逻辑放 route 层而不是 store：这是「手动采集」的产品约定，
  // 未来 RSS 自动采集等入口可能有自己的标题来源，不该被这条规则绑死。
  // 笔记允许暂无标题（草稿期），由前端显示「无标题文章」兜底。
  if (!title && !isNote) {
    const firstLine = content.split("\n")[0].trim();
    title = firstLine.length > 40 ? `${firstLine.slice(0, 40)}…` : firstLine;
  }

  try {
    const item = createItem(getDb(), {
      title,
      content,
      // 采集条目标注来源；笔记的 source 是自己，不标采集渠道
      source:
        !isNote && typeof body.source === "string" && body.source
          ? body.source
          : null,
      tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
      kind: isNote ? "note" : undefined,
      // 出身决定起点状态：采集进待拍板、笔记直接保留。约定写在 route 层，
      // store 保持通用能力，未来 Agent 工具复用 store 时自行选择语义
      status: isNote ? "kept" : undefined,
    });
    return NextResponse.json(item, { status: 201 });
  } catch (e) {
    console.error("[knowledge:create]", e);
    return NextResponse.json({ error: "创建知识条目失败" }, { status: 500 });
  }
}
