// .md 文章批量导入（2026-08-27 阶段 1 定稿功能）。
//
// 为什么单独一个路由而不是让前端循环打 POST /api/knowledge：
// 批量导入的正确语义是「事务内要么整批走完、要么整体回滚」——中途断网
// 留下半批文章，用户根本分不清哪些进来了哪些没进来。事务包住整批，
// 结果一次说清（created / skipped 各自点名）。
//
// 查重口径：标题完全相同的 note（未删除的）视为重复跳过。为什么不用
// 正文哈希：个人笔记常有「同名不同版本」「模板文」的合理场景，标题级
// 查重误伤最小，真重复了用户在列表里一眼能看出来。

import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { createItem } from "@/lib/knowledge/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ImportFile {
  name: string;
  title?: string;
  content?: string;
  tags?: unknown;
}

// POST /api/knowledge/import —— body: { files: ImportFile[] }
// 返回 { created: number, skipped: string[] }（skipped 里是人话原因）
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !Array.isArray(body.files)) {
    return NextResponse.json(
      { error: "请求体必须是包含 files 数组的 JSON 对象" },
      { status: 400 },
    );
  }
  const files = body.files as ImportFile[];
  if (files.length === 0) {
    return NextResponse.json({ error: "files 不能为空" }, { status: 400 });
  }
  if (files.length > 200) {
    return NextResponse.json({ error: "单次最多导入 200 篇" }, { status: 400 });
  }

  const db = getDb();
  const created: string[] = [];
  const skipped: string[] = [];

  try {
    const findDup = db.prepare(
      `SELECT id FROM knowledge_items
       WHERE kind = 'note' AND title = ? AND status != 'trashed' LIMIT 1`,
    );

    db.transaction(() => {
      for (const f of files) {
        const content = typeof f.content === "string" ? f.content.trim() : "";
        if (!content) {
          skipped.push(`${f.name}（无正文）`);
          continue;
        }
        // 标题优先级：前端解析好的（frontmatter title）> 正文第一个 # 行 > 文件名
        const title =
          (typeof f.title === "string" && f.title.trim()) ||
          content.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
          f.name.replace(/\.(md|markdown|txt)$/i, "");
        // 事务内写入对同连接立即可见，所以批内重名同样会被拦下
        if (findDup.get(title)) {
          skipped.push(`${title}（已有同名文章）`);
          continue;
        }
        createItem(db, {
          title,
          content,
          kind: "note",
          // 与手写文章同一语义：导入 ≠ 入库，默认停在「我的文章」（draft），
          // 想给 AI 检索就在列表里勾选后「批量加入知识流」
          status: "draft",
          tags: Array.isArray(f.tags) ? f.tags.map(String) : [],
        });
        created.push(title);
      }
    })();

    return NextResponse.json({ created: created.length, skipped });
  } catch (e) {
    console.error("[knowledge:import]", e);
    return NextResponse.json(
      { error: "导入失败，本次未写入任何文章" },
      { status: 500 },
    );
  }
}
