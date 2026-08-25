// Tavily 搜索实现
// 文档：https://docs.tavily.com/documentation/api-reference/endpoint/search
// 免费额度：1000 次/月，无需信用卡

import type { SearchProvider, SearchResult } from "./types";

const TAVILY_ENDPOINT = "https://api.tavily.com/search";

interface TavilyResponse {
  results?: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
    published_date?: string;
  }>;
}

export class TavilySearchProvider implements SearchProvider {
  constructor(private apiKey: string) {}

  async search(query: string, opts?: { maxResults?: number }): Promise<SearchResult[]> {
    const maxResults = opts?.maxResults ?? 6;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const res = await fetch(TAVILY_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          query,
          max_results: maxResults,
          // search_depth: "advanced" 质量更高但慢且贵，basic 够日常用
          search_depth: "basic",
          // 返回清洗后的正文片段，不用再自己抓网页
          include_answer: false,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Tavily 搜索失败 (${res.status}): ${text.slice(0, 200)}`);
      }

      const data = (await res.json()) as TavilyResponse;

      return (data.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content.slice(0, 200),
        content: r.content.slice(0, 500),
        score: r.score,
        publishedDate: r.published_date,
      }));
    } finally {
      clearTimeout(timeout);
    }
  }
}
