"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { UserControl } from "@/components/layout/user-control";
import { CategoryChips } from "@/components/tools/category-chips";
import { ToolCard } from "@/components/tools/tool-card";
import { TOOLS } from "@/components/tools/tool-catalog";
import {
  ALL_CATEGORY,
  CATEGORY_FILTERS,
  filterTools,
  groupTools,
  type CategoryFilter,
} from "@/components/tools/tool-filter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * 工具中心视图（《功能/工具中心》）。
 *
 * 搜索词 / 分类 / 手机端搜索是否展开，这三个状态住在这里：
 * 页头右侧的控件与内容区的分组结果要共用同一份状态，所以整页是一个客户端组件。
 *
 * 页头右侧控件按宽度分三档（互斥显隐，不用 JS 断点判断，SSR 首屏就不会闪）：
 * - ≥ xl：完整搜索胶囊 + 分类并排；
 * - lg ~ xl：搜索收成图标（点开出现输入框）、分类收成黑底下拉；
 * - < lg：只剩搜索图标，分类在内容区顶部以 chips 横滑条呈现。
 */
export function ToolsView({ username }: { username: string }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryFilter>(ALL_CATEGORY);
  const [searchOpen, setSearchOpen] = useState(false);

  const filteredTools = useMemo(
    () => filterTools(TOOLS, searchQuery, selectedCategory),
    [searchQuery, selectedCategory],
  );
  const groupedTools = useMemo(
    () => groupTools(filteredTools, selectedCategory),
    [filteredTools, selectedCategory],
  );

  const toggleSearch = () => {
    // 收起搜索时把词清掉：下次展开是一张干净的白纸（复用旧界面行为）
    if (searchOpen) setSearchQuery("");
    setSearchOpen(!searchOpen);
  };

  return (
    <>
      <PageHeader
        title="工具"
        description="高频使用的小工具集合，将重复性工作变成一键操作"
      >
        {/* ≥ xl：完整搜索胶囊 + 分类并排 */}
        <div className="hidden items-center gap-1 rounded-[2px] bg-[#ECECEC] px-2 py-1.5 xl:flex">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#999999]" />
            <input
              type="text"
              placeholder="搜索工具"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-52 rounded-[2px] bg-white pl-9 pr-3 text-[13px] text-[#000000] placeholder:text-[#999999] outline-none"
            />
          </div>

          <div className="mx-1 h-4 w-px bg-[#E5E5E5]" />

          <CategoryChips
            variant="bar"
            categories={CATEGORY_FILTERS}
            selected={selectedCategory}
            onSelect={setSelectedCategory}
          />
        </div>

        {/* lg ~ xl：搜索收成图标，分类收成下拉 */}
        <div className="hidden items-center gap-1 rounded-[2px] bg-[#ECECEC] px-2 py-1.5 lg:flex xl:hidden">
          {searchOpen && (
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#999999]" />
              <input
                autoFocus
                type="text"
                placeholder="搜索工具"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-40 rounded-[2px] bg-white pl-9 pr-3 text-[13px] text-[#000000] placeholder:text-[#999999] outline-none"
              />
            </div>
          )}
          <button
            aria-label={searchOpen ? "关闭搜索" : "打开搜索"}
            onClick={toggleSearch}
            className="flex h-8 w-8 items-center justify-center rounded-[2px] text-[#666666] transition-colors hover:bg-white hover:text-[#000000]"
          >
            {searchOpen ? (
              <X className="h-3.5 w-3.5" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}
          </button>

          <div className="mx-1 h-4 w-px bg-[#E5E5E5]" />

          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-8 items-center gap-1.5 rounded-[2px] bg-[#000000] px-3 text-xs font-medium text-white outline-none">
              {selectedCategory}
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-28 rounded-[2px]">
              {CATEGORY_FILTERS.map((category) => (
                <DropdownMenuItem
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`rounded-[2px] text-[13px] ${
                    selectedCategory === category
                      ? "font-medium text-[#000000]"
                      : "text-[#666666]"
                  }`}
                >
                  {category}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* < lg：只剩一个搜索开关（分类与搜索条在内容区顶部） */}
        <div className="flex items-center gap-1 lg:hidden">
          <button
            aria-label={searchOpen ? "关闭搜索" : "打开搜索"}
            onClick={toggleSearch}
            className="flex h-9 w-9 items-center justify-center rounded-[2px] text-[#666666] transition-colors hover:bg-[#ECECEC] hover:text-[#000000]"
          >
            {searchOpen ? (
              <X className="h-4 w-4" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* 用户区（§7.10）：排在页面级控件之后 */}
        <UserControl username={username} />
      </PageHeader>

      {/* < lg：搜索条（点开时出现）+ 分类 chips 横滑条 */}
      <div className="space-y-3 px-4 pt-4 lg:hidden">
        {searchOpen && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#999999]" />
            <input
              autoFocus
              type="text"
              placeholder="搜索工具"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              // 16px 起步（§7.16 的 iOS 规则：小于 16px 聚焦会放大整页），md 起回落 14px
              className="h-10 w-full rounded-[2px] border border-[#E5E5E5] bg-white pl-9 pr-3 text-base text-[#000000] placeholder:text-[#999999] outline-none md:text-sm"
            />
          </div>
        )}
        <CategoryChips
          variant="scroll"
          categories={CATEGORY_FILTERS}
          selected={selectedCategory}
          onSelect={setSelectedCategory}
        />
      </div>

      {/* 内容区：分组式长页面（§5.3），一组一个 section */}
      <div className="space-y-8 px-4 py-4 md:px-6 md:py-6">
        {Object.keys(groupedTools).length === 0 ? (
          <div className="rounded-[2px] border border-dashed border-[#D9D9D9] bg-white p-12 text-center">
            <p className="text-sm text-[#A0A8B4]">未找到匹配的工具</p>
          </div>
        ) : (
          Object.entries(groupedTools).map(([category, items]) => (
            <section key={category} className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-3.5 w-[3px] bg-[#000000]" />
                <h2 className="text-sm font-semibold text-[#000000]">
                  {category}
                </h2>
                <span className="text-xs text-[#999999]">{items.length}</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {items.map((tool) => (
                  <ToolCard key={tool.name} tool={tool} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </>
  );
}
