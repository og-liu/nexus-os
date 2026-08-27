// 知识流集合路由（K1 采集入口）。
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
  KNOWLEDGE_STATUSES,
  listItems,
  purgeExpiredTrash,
  type KnowledgeKind,
  type KnowledgeStatus,
} from "@/lib/knowledge/store";
import { syncEmbedding } from "@/lib/knowledge/embedding-sync";
import { fetchPage, isHttpUrl } from "@/lib/knowledge/fetch-page";
import {
  findDuplicateBySimhash,
  findDuplicateByUrl,
} from "@/lib/knowledge/dedupe";
import { simhash64 } from "@/lib/knowledge/simhash";
import { refetchItem } from "@/lib/knowledge/refetch";
import { scheduleInterpret } from "@/lib/knowledge/interpret";
import { applyRulesToItem } from "@/lib/knowledge/rules";
import { countAgedInbox } from "@/lib/knowledge/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // 每次请求都读最新库，不做任何缓存

/** 状态白名单校验：支持逗号分隔多值（「我的文章」要同时看 draft+kept）。
 *  非法值在这里拦下返回 400（客户端错），不让它流进 store 变成 500（服务端错） */
function parseStatus(
  raw: string | null,
): KnowledgeStatus[] | undefined | "invalid" {
  if (raw == null || raw === "") return undefined;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const bad = parts.find(
    (p) => !KNOWLEDGE_STATUSES.includes(p as KnowledgeStatus),
  );
  if (bad) return "invalid";
  return parts as KnowledgeStatus[];
}

/** 出身白名单校验：captured（采集）/ note（手写文章） */
function parseKind(raw: string | null): KnowledgeKind | undefined | "invalid" {
  if (raw == null || raw === "") return undefined;
  return raw === "captured" || raw === "note" ? (raw as KnowledgeKind) : "invalid";
}

/** http/https 判定挪去了 fetch-page.ts（refetch 也要用），这里 re-export 语义不变。
 *  URL → 域名，解析失败回落原串。isHttpUrl 已过滤过一次，这里是双保险：
 *  保证降级落库的 title 构造永远不会因为解析失败再抛一次异常 */
function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// 降级条目的后台自动重试登记表：哪些条目已经排了「45 秒后自动重抓」。
// 没有这张表，同一条降级条目存两次就会排两个定时器、抓两次——
// 不是灾难（第二次原地更新幂等），但白耗上游流量且日志难看。
// 进程内的 Map 就够：dev 重启 / HMR 会丢登记，丢了也只是少一次自动重试，
// 手动重试按钮永远兜底
const pendingAutoRefetch = new Set<string>();

/** 降级落库后安排一次延迟自动重抓：很多「抓不到」其实是瞬时的
 *  （网络抖动 / 站点限流），45 秒后重试一次有可观的自动痊愈率。
 *  fire-and-forget：请求早就返回了，重试结果只写库不打扰用户；
 *  失败就失败（条目保持降级态，按钮还在） */
function scheduleAutoRefetch(id: string) {
  if (pendingAutoRefetch.has(id)) return;
  pendingAutoRefetch.add(id);
  setTimeout(() => {
    pendingAutoRefetch.delete(id);
    // 模块级getDb()：Next 路由模块是常驻的，这里拿到的和请求里是同一个连接
    void refetchItem(getDb(), id).catch((e) =>
      console.error("[knowledge:auto-refetch]", e),
    );
  }, 45_000);
}

// GET /api/knowledge?status=inbox&kind=captured&q=关键词&tag=标签&limit=50&offset=0
// 返回 { items, total, counts }。tag 可重复传多个，命中者需同时拥有所有选中标签（AND 交集）
export async function GET(req: NextRequest) {
  const statuses = parseStatus(req.nextUrl.searchParams.get("status"));
  if (statuses === "invalid") {
    return NextResponse.json(
      {
        error: `status 仅允许 ${KNOWLEDGE_STATUSES.join(" / ")}，多值用逗号分隔`,
      },
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
      status: statuses?.length === 1 ? statuses[0] : undefined,
      statuses: statuses && statuses.length > 1 ? statuses : undefined,
      // 调用方没点名状态时，常规列表不掺已删内容——分页计数才不会错位。
      // 显式点名状态的查询（回收站视图、我的文章）不受影响
      notStatus: statuses ? undefined : "trashed",
      kind,
      q: sp.get("q") ?? undefined,
      tags: sp.getAll("tag"),
      limit: Number.isNaN(parsedLimit) ? undefined : parsedLimit,
      offset: Number.isNaN(parsedOffset) ? undefined : parsedOffset,
    });

    // 阶段4 P2·过期清理（提示版）：待处理堆积计数。默认 30 天阈值，
    // KNOWLEDGE_INBOX_AGING_DAYS 可调；KNOWLEDGE_INBOX_AGING=0/off 彻底
    // 关掉提示（方案里这项「默认关」——但提示本身无破坏性，默认开、
    // 嫌烦的人关，比反过来更符合「堆积可见」的初衷）
    const agingOff = ["0", "off", "false"].includes(
      (process.env.KNOWLEDGE_INBOX_AGING ?? "").toLowerCase(),
    );
    const agingDays = Math.max(
      1,
      parseInt(process.env.KNOWLEDGE_INBOX_AGING_DAYS ?? "30", 10) || 30,
    );

    return NextResponse.json({
      ...result,
      counts: {
        ...countsByStatus(db),
        agedInbox: agingOff ? 0 : countAgedInbox(db, agingDays),
      },
    });
  } catch (e) {
    console.error("[knowledge:list]", e);
    return NextResponse.json({ error: "读取知识列表失败" }, { status: 500 });
  }
}

// POST /api/knowledge —— 创建条目，三种入口：
//   粘贴 URL：智能分流——订阅地址引导去「自动」页；普通网页抓正文进待处理；
//            抓不到正文也降级存链接，绝不因网络抖动丢掉用户想存的东西
//   默认（粘贴文本 / Markdown）：落库进待处理等拍板
//   kind=note（手写文章）：方案 B——创建即 draft 草稿，点「加入知识流」才转
//            kept 进 AI 检索，写一半的稿子不该被 AI 当成品引用
// body: { title?, content?, tags?, source?, kind?, url? }
export async function POST(req: NextRequest) {
  // json() 可能因空 body / 非 JSON 抛异常，catch 成 null 统一走 400
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求体必须是 JSON 对象" }, { status: 400 });
  }

  const isNote = body.kind === "note";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  let title = typeof body.title === "string" ? body.title.trim() : "";

  // ── URL 智能分流：贴的是链接而不是文本时，先去抓一次页面再落库 ──
  // 为什么在 POST 做而不是前端直连抓取：分流的结局要么引导要么落库，
  // 抓取 + 落库在一次请求内闭环，前端拿到手直接是最终状态，无需二次轮询。
  // isNote 排除在外：手写文章走自己的草稿流程，不掺采集语义
  if (!isNote && typeof body.url === "string" && isHttpUrl(body.url)) {
    const url = body.url;

    // ── 重复检测第一关：URL 归一化查重（抓正文之前先查，省一次抓取）──
    // 「收藏过又忘了」是高频场景：同一链接带着 utm 参数再存一遍，
    // 不拦的话待处理和知识流会慢慢堆满同一篇文章
    const urlDup = findDuplicateByUrl(getDb(), url);
    if (urlDup) {
      const where =
        urlDup.status === "inbox"
          ? "已在「待处理」里"
          : urlDup.status === "kept"
            ? "已在「知识流」里"
            : "已在「我的文章」里";
      return NextResponse.json(
        { duplicate: urlDup, message: `这篇${where}，不再重复保存` },
        { status: 200 },
      );
    }

    const fetched = await fetchPage(url);

    // 订阅地址不是「一篇文章」而是「一个持续更新的源」，语义上属于
    // 「自动」页的自动关注——不硬存成文章，引导用户去那边添加
    if (fetched.kind === "feed") {
      return NextResponse.json(
        { rss: url, message: "这是订阅地址，去「自动」页添加关注后会自动抓取更新" },
        { status: 200 },
      );
    }

    // 普通网页：抓到正文按采集落库，进待处理等拍板
    if (fetched.kind === "page") {
      // ── 重复检测第二关：内容指纹查重 ──
      // 同一篇文章换个链接（转载 / 镜像 / 手动采集撞上 RSS 抓取）拦在这：
      // URL 不同但正文指纹几乎一致时视为重复
      const fingerprint = simhash64(`${fetched.title}\n${fetched.text}`);
      const simDup = findDuplicateBySimhash(getDb(), fingerprint);
      if (simDup) {
        const where =
          simDup.status === "inbox"
            ? "已在「待处理」里"
            : simDup.status === "kept"
              ? "已在「知识流」里"
              : "已在「我的文章」里";
        return NextResponse.json(
          { duplicate: simDup, message: `链接不同但这篇${where}（内容一样），不再重复保存` },
          { status: 200 },
        );
      }

      try {
        const item = createItem(getDb(), {
          title: fetched.title || safeHost(url),
          // 摘要拼在正文最前：拍板前先扫一眼「这页讲什么」，去留决定更快
          content: fetched.description
            ? `${fetched.description}\n\n${fetched.text}`
            : fetched.text,
          source: safeHost(url),
          source_url: url,
          tags: [],
          kind: "captured",
          status: "inbox",
          // 永久快照 + 内容指纹：原文 404 后本地仍可读；下次再碰到同文能查重
          snapshot_html: fetched.html,
          simhash: fingerprint,
        });
        void syncEmbedding(getDb(), item.id, item.title, item.content);
        // 自动解读（阶段3 P1）：抓到正文的采集立即排队解读。fire-and-forget——
        // LLM 要跑几秒，不能让「保存」按钮等它；解读完成前详情页照常打开，
        // 只是还没有 AI 导读区块，生成完刷新即可见
        scheduleInterpret(item.id);
        // 自动打标（阶段4 P2）：域名/关键词规则在这里挂上，与解读互不依赖
        applyRulesToItem(getDb(), item.id);
        return NextResponse.json({ item }, { status: 201 });
      } catch (e) {
        console.error("[knowledge:create:url]", e);
        return NextResponse.json({ error: "创建知识条目失败" }, { status: 500 });
      }
    }

    // 抓取失败（超时 / 403 / 反爬）：降级落库占位。宁可存一条只有链接的
    // 条目，也不能因为网络抖动丢掉用户想存的东西——丢链接可以补，
    // 丢「存进去就放心了」的信任补不回来。前端靠 degraded 标记提示用户。
    // 落库后 45 秒自动重抓一次（很多失败是瞬时的），手动重试按钮永远兜底
    try {
      const host = safeHost(url);
      const item = createItem(getDb(), {
        title: `来自 ${host} 的链接（未抓到正文）`,
        content: `${fetched.reason}\n${url}`,
        source: host,
        source_url: url,
        tags: [],
        kind: "captured",
        status: "inbox",
        degraded: 1,
      });
      void syncEmbedding(getDb(), item.id, item.title, item.content);
      scheduleAutoRefetch(item.id);
      // 自动打标（阶段4 P2）：降级条目也有域名，domain 规则照常能挂；
      // keyword 规则要等重抓补全正文后才有料——refetch 成功后不重跑规则，
      // 打标不全会由「AI 先帮我看看」的候选标签兜住，够用
      applyRulesToItem(getDb(), item.id);
      return NextResponse.json(
        { item, degraded: fetched.reason },
        { status: 201 },
      );
    } catch (e) {
      console.error("[knowledge:create:url-degraded]", e);
      return NextResponse.json({ error: "创建知识条目失败" }, { status: 500 });
    }
  }

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

  // ── 重复检测（文本路径）：同一篇文字粘两次是高频手误 ──
  // 只拦采集文本：手写文章创建 draft 语义特殊（用户可能故意重写），
  // md 批量导入走 import 路由有自己的标题级查重，都不掺和这条
  const textFingerprint = isNote ? "" : simhash64(`${title}\n${content}`);
  if (textFingerprint) {
    const dup = findDuplicateBySimhash(getDb(), textFingerprint);
    if (dup) {
      const where =
        dup.status === "inbox"
          ? "已在「待处理」里"
          : dup.status === "kept"
            ? "已在「知识流」里"
            : "已在「我的文章」里";
      return NextResponse.json(
        { duplicate: dup, message: `这段内容${where}，不再重复保存` },
        { status: 200 },
      );
    }
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
      // 出身决定起点状态：采集进待处理；手写文章按方案 B 起草——
      // 创建即 draft（只在「我的文章」可见、不进 AI 检索），点「加入知识流」
      // 才转 kept。约定写在 route 层，store 保持通用能力，未来 Agent 工具
      // 复用 store 时自行选择语义
      status: isNote ? "draft" : undefined,
      // 文本指纹随行落库：它自己将来也是被查重的对象
      simhash: textFingerprint || null,
    });
    // 写入钩子：顺手生成语义指纹（K4）。
    // 用 void 不等待——嵌入要几百毫秒，不该拖慢保存响应；
    // 本地常驻进程里 fire-and-forget 是安全的，失败内部只记日志，
    // 缺指纹的条目会被回填脚本认领
    void syncEmbedding(getDb(), item.id, item.title, item.content);
    // 文本采集同样排队解读；手写文章（note）不解读——自己写的东西自己最清楚，
    // 「值不值得读」的判断场景不成立，白烧一次 LLM
    if (!isNote) scheduleInterpret(item.id);
    // 自动打标（阶段4 P2）：采集文本同样过一遍规则
    if (!isNote) applyRulesToItem(getDb(), item.id);
    return NextResponse.json(item, { status: 201 });
  } catch (e) {
    console.error("[knowledge:create]", e);
    return NextResponse.json({ error: "创建知识条目失败" }, { status: 500 });
  }
}
