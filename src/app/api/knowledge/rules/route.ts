// 自动归档规则接口（阶段4 P2）。
//
// GET    /api/knowledge/rules            → 规则列表
// POST   /api/knowledge/rules            → 新增规则（body: { type, pattern, tag }）
// PATCH  /api/knowledge/rules?id=1       → 停用/启用（body: { enabled }）
// DELETE /api/knowledge/rules?id=1       → 删规则
//
// 静态段 rules 优先于 /api/knowledge/[id] 动态段，Next.js 路由天然分流，
// 不会把 "rules" 误当条目 id

import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import {
  addRule,
  listRules,
  removeRule,
  setRuleEnabled,
  type RuleType,
} from "@/lib/knowledge/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RULE_TYPES: RuleType[] = ["domain", "keyword"];

export async function GET() {
  return NextResponse.json({ rules: listRules(getDb()) });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const type = body?.type;
  const pattern = typeof body?.pattern === "string" ? body.pattern : "";
  const tag = typeof body?.tag === "string" ? body.tag : "";

  if (!RULE_TYPES.includes(type)) {
    return NextResponse.json(
      { error: "type 仅允许 domain / keyword" },
      { status: 400 },
    );
  }
  try {
    const rule = addRule(getDb(), { type, pattern, tag });
    return NextResponse.json({ rule }, { status: 201 });
  } catch (e) {
    const reason = e instanceof Error ? e.message : "未知原因";
    return NextResponse.json({ error: reason }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const id = parseInt(req.nextUrl.searchParams.get("id") ?? "", 10);
  const body = await req.json().catch(() => null);
  if (Number.isNaN(id) || typeof body?.enabled !== "boolean") {
    return NextResponse.json(
      { error: "需要 ?id= 和 body { enabled: boolean }" },
      { status: 400 },
    );
  }
  if (setRuleEnabled(getDb(), id, body.enabled)) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "规则不存在" }, { status: 404 });
}

export async function DELETE(req: NextRequest) {
  const id = parseInt(req.nextUrl.searchParams.get("id") ?? "", 10);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "需要 ?id= 参数" }, { status: 400 });
  }
  if (removeRule(getDb(), id)) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "规则不存在" }, { status: 404 });
}
