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

// GET /api/knowledge?status=inbox&q=关键词&tag=标签&limit=50&offset=0
// 返回 { items, total, counts }
export async function GET(req: NextRequest) {
  const status = parseStatus(req.nextUrl.searchParams.get("status"));
  if (status === "invalid") {
    return NextResponse.json(
      { error: "status 仅允许 inbox / kept / discarded / trashed" },
      { status: 400 },
    );
  }

  // 分页参数：parseInt 失败（NaN）时回落默认值，limit 封顶交给 store 再兜一道底
  const sp = req.nextUrl.searchParams;
  const parsedLimit = parseInt(sp.get("limit") ?? "", 10);
  const parsedOffset = parseInt(sp.get("offset") ?? "", 10);

  try {
    const db = getDb();
    const result = listItems(db, {
      status,
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

// POST /api/knowledge —— 手动采集入口：粘贴文本 / Markdown，落库进 inbox 待拍板
// body: { title?, content, tags?, source? }
export async function POST(req: NextRequest) {
  // json() 可能因空 body / 非 JSON 抛异常，catch 成 null 统一走 400
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求体必须是 JSON 对象" }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  let title = typeof body.title === "string" ? body.title.trim() : "";

  if (!title && !content) {
    return NextResponse.json({ error: "标题和正文至少填一项" }, { status: 400 });
  }

  // 用户只粘了一大段没写标题：从正文第一行截一段当标题，采集体验才顺滑。
  // 截断逻辑放 route 层而不是 store：这是「手动采集」的产品约定，
  // 未来 RSS 自动采集等入口可能有自己的标题来源，不该被这条规则绑死。
  if (!title) {
    const firstLine = content.split("\n")[0].trim();
    title = firstLine.length > 40 ? `${firstLine.slice(0, 40)}…` : firstLine;
  }

  try {
    const item = createItem(getDb(), {
      title,
      content,
      source: typeof body.source === "string" && body.source ? body.source : "手动采集",
      tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
      // 采集默认进「待拍板」由 store 保证（createItem 缺省 status=inbox），这里不显式传，
      // 让默认语义留在数据层单点维护
    });
    return NextResponse.json(item, { status: 201 });
  } catch (e) {
    console.error("[knowledge:create]", e);
    return NextResponse.json({ error: "创建知识条目失败" }, { status: 500 });
  }
}
