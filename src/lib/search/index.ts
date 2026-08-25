// 搜索供应商工厂
// 根据环境变量选择搜索服务商，未来加 Serper/Brave 只需在这里扩展

import type { SearchProvider } from "./types";
import { TavilySearchProvider } from "./tavily";

let cachedProvider: SearchProvider | null = null;

export function createSearchProvider(): SearchProvider {
  if (cachedProvider) return cachedProvider;

  const provider = process.env.SEARCH_PROVIDER ?? "tavily";

  if (provider === "tavily") {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      throw new Error("未配置 TAVILY_API_KEY，请在 .env.local 中填写");
    }
    cachedProvider = new TavilySearchProvider(apiKey);
    return cachedProvider;
  }

  throw new Error(`不支持的搜索供应商: ${provider}`);
}

export type { SearchProvider, SearchResult } from "./types";
