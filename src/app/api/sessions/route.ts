import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const sessions = db
    .prepare(`SELECT * FROM sessions ORDER BY updated_at DESC`)
    .all();
  return NextResponse.json({ sessions });
}

export async function POST() {
  const db = getDb();
  const now = Date.now();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)`,
  ).run(id, "新会话", now, now);
  const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id);
  return NextResponse.json({ session }, { status: 201 });
}