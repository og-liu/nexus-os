// 嵌入（Embedding）服务封装：把文字变成「意思指纹」。
//
// 原理一句话：嵌入模型读过海量文本，它给每段文字输出一个固定长度的
// 数字数组（向量），意思相近的文字，向量在空间里就挨得近。
// 于是「两句话像不像」这个模糊问题，变成了「两组数字夹角小不小」的
// 纯数学问题——这就是语义搜索的全部秘密。
//
// 供应商：硅基流动 SiliconFlow（OpenAI 兼容的 /v1/embeddings 接口）
// 模型：BAA/bge-m3 —— 智源研究院开源嵌入模型，多语言多粒度，
//       免费档可用；1024 维，单条输入上限 8192 token
//
// ⚠️ 本模块只能在服务端使用：API Key 只存在于服务端环境变量，
//    一旦被 import 进客户端 bundle，Key 就泄露了。

/** 与 db/store 约定的模型标识：换模型必须连旧向量一起作废重算 */
export const EMBEDDING_MODEL = "BAAI/bge-m3";
/** bge-m3 输出维度（写入时校验，防止脏数据入库） */
export const EMBEDDING_DIM = 1024;
/** 参与计算向量的最大字符数：8192 token ≈ 几千汉字，保守截断。
 * 超长内容只对开头算指纹——个人笔记场景开头基本代表全文主题 */
const MAX_CHARS = 2000;
/** 批量请求一次最多带几条：太小浪费往返，太大容易撞限流 */
const BATCH_SIZE = 16;

interface EmbeddingResponse {
  data?: Array<{ embedding: number[]; index: number }>;
  message?: string;
}

/**
 * L2 归一化：把向量缩放到长度恰好为 1。
 * 为什么必须做：归一化之后，「余弦相似度」就等于普通点积，
 * 计算更简单更快；且不同长短文本的向量公平可比。
 */
export function normalize(vec: number[]): Float32Array {
  let sumSq = 0;
  for (const v of vec) sumSq += v * v;
  const norm = Math.sqrt(sumSq);
  if (!Number.isFinite(norm) || norm === 0) {
    throw new Error("嵌入向量异常（长度为 0 或含非数值）");
  }
  return Float32Array.from(vec, (v) => v / norm);
}

/** 调用嵌入接口的核心函数：texts → 归一化后的向量数组 */
async function callEmbeddings(
  texts: string[],
  apiKey: string,
): Promise<Float32Array[]> {
  const res = await fetch("https://api.siliconflow.cn/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`嵌入接口异常 ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as EmbeddingResponse;
  if (!json.data?.length) {
    throw new Error(`嵌入接口返回空数据: ${json.message ?? "未知原因"}`);
  }

  // 按 index 还原顺序（规范保证与输入一一对应，但不假设服务端有序）
  const sorted = [...json.data].sort((a, b) => a.index - b.index);
  return sorted.map((d) => {
    if (d.embedding.length !== EMBEDDING_DIM) {
      throw new Error(
        `嵌入维度不符：期望 ${EMBEDDING_DIM}，实际 ${d.embedding.length}（模型配置可能变了）`,
      );
    }
    return normalize(d.embedding);
  });
}

/** 单条嵌入：给写入钩子和查询时用 */
export async function embedText(text: string): Promise<Float32Array> {
  const apiKey = process.env.SILICONFLOW_API_KEY;
  if (!apiKey) throw new Error("未配置 SILICONFLOW_API_KEY（.env.local）");

  const clipped =
    text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
  const [vec] = await callEmbeddings([clipped], apiKey);
  return vec;
}

/** 批量嵌入：给回填脚本用，自动分批 */
export async function embedMany(
  texts: string[],
): Promise<Float32Array[]> {
  const apiKey = process.env.SILICONFLOW_API_KEY;
  if (!apiKey) throw new Error("未配置 SILICONFLOW_API_KEY（.env.local）");

  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE).map((t) =>
      t.length > MAX_CHARS ? t.slice(0, MAX_CHARS) : t,
    );
    const vecs = await callEmbeddings(batch, apiKey);
    out.push(...vecs);
  }
  return out;
}

// ─── 向量的存取格式 ──────────────────────────────────────────
// SQLite 没有「数组」类型，我们存成 BLOB（原始二进制）：
// Float32Array 每个数占 4 字节，1024 维 = 4KB/条，紧凑且读取零解析成本。

export function vectorToBlob(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

export function blobToVector(blob: Buffer): Float32Array {
  return new Float32Array(
    blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength),
  );
}

/**
 * 余弦相似度：两个归一化向量的点积，范围 [-1, 1]，越接近 1 越相似。
 * 实践经验：中文语义检索里 >0.5 就值得看一眼，>0.7 基本就是相关内容。
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new Error("向量维度不一致，无法比较");
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}
