// 回填端点（K4）：给缺语义指纹的条目批量补算向量。
//
// 为什么做成 HTTP 接口而不是本地脚本：项目没有独立的脚本运行时
// （tsx/ts-node 都没装），而 Next.js 的 route 本身就是现成的服务端入口——
// curl 一下就完成，还天然复用了 db 初始化和迁移逻辑。
// 幂等设计：跑一次和跑十次结果一样，随时可以放心重跑。
//
// 用法：curl -X POST http://localhost:3000/api/knowledge/backfill

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { backfillEmbeddings } from "@/lib/knowledge/embedding-sync";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await backfillEmbeddings(getDb());
    return NextResponse.json(result);
  } catch (e) {
    console.error("[knowledge:backfill]", e);
    return NextResponse.json(
      { error: "回填失败，请检查 SILICONFLOW_API_KEY 配置" },
      { status: 500 },
    );
  }
}
