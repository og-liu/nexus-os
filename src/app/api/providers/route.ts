import { NextResponse } from "next/server";
import { PROVIDERS, isProviderConfigured } from "@/lib/providers";

// 供应商 Key 配置状态查询。前端启动时拉一次，用于：
//   1. 模型选择器把「没配 Key」的模型置灰禁选，并标注提示；
//   2. 把默认选中的模型校正为「第一个可用的」。
// 只返回各供应商「是否配置了 Key」的布尔值，Key 本身永远不出服务端。
export async function GET() {
  const configured = Object.fromEntries(
    Object.keys(PROVIDERS).map((id) => [id, isProviderConfigured(id)]),
  );
  // 每次现算 + 禁缓存：dev 阶段补完 .env.local 重启即生效，不会读到旧状态
  return NextResponse.json(configured, {
    headers: { "Cache-Control": "no-store" },
  });
}
