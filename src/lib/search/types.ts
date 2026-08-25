/**
 * 搜索供应商抽象层
 *
 * 设计思路：定义统一接口，具体实现（Tavily / Serper / Brave / 自建）
 * 只需实现 SearchProvider，业务代码通过 createSearchProvider() 工厂获取实例，
 * 切换供应商只需改环境变量，不改工具和 Loop 代码。
 *
 * 文件结构：
 *   types.ts   — 接口定义（本文件）
 *   tavily.ts  — Tavily 实现
 *   index.ts   — 工厂函数，根据 SEARCH_PROVIDER 环境变量选择
 */

/** 单条搜索结果 */
export interface SearchResult {
  /** 网页标题 */
  title: string;
  /** 原始 URL，用于引用标注和跳转 */
  url: string;
  /** 短摘要（约 200 字），列表展示用 */
  snippet: string;
  /** 清洗后的正文片段（约 500 字），喂给模型做综合回答用；Tavily 有，其他供应商可能没有 */
  content?: string;
  /** 相关度评分 0~1，越高越相关 */
  score?: number;
  /** 文章发布日期（ISO 格式），部分结果有 */
  publishedDate?: string;
}

/** 搜索供应商必须实现的接口 */
export interface SearchProvider {
  /**
   * 执行搜索
   * @param query - 搜索关键词
   * @param opts.maxResults - 返回结果条数上限，默认 6
   */
  search(query: string, opts?: { maxResults?: number }): Promise<SearchResult[]>;
}
