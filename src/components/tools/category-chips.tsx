"use client";

import { cn } from "@/lib/utils";
import type { CategoryFilter } from "@/components/tools/tool-filter";

/**
 * 分类筛选按钮组（《界面设计规范》§7.9 的两种 chip 形态）。
 *
 * - `bar`：页头胶囊里的并排小按钮（≥ xl 使用），直角、未选中为灰字；
 * - `scroll`：手机内容区顶部的横滑条（< lg 使用），圆角、未选中为白底。
 */

interface CategoryChipsProps {
  categories: CategoryFilter[];
  selected: CategoryFilter;
  onSelect: (category: CategoryFilter) => void;
  variant: "bar" | "scroll";
}

export function CategoryChips({
  categories,
  selected,
  onSelect,
  variant,
}: CategoryChipsProps) {
  const chips = categories.map((category) => {
    const active = category === selected;
    return (
      <button
        key={category}
        onClick={() => onSelect(category)}
        className={cn(
          "whitespace-nowrap text-xs font-medium transition-all",
          variant === "bar"
            ? cn(
                "rounded-[2px] px-3 py-1.5",
                active
                  ? "bg-[#000000] text-white"
                  : "text-[#8A8A8A] hover:text-[#000000]",
              )
            : cn(
                "rounded-full px-3.5 py-1.5",
                active
                  ? "bg-[#000000] text-white"
                  : "bg-white text-[#8A8A8A] hover:text-[#000000]",
              ),
        )}
      >
        {category}
      </button>
    );
  });

  if (variant === "bar") {
    return <div className="flex items-center gap-0.5">{chips}</div>;
  }

  // 手机端横滑条：隐藏滚动条，并左右出血到屏边（-mx-4 抵消容器的 px-4）
  return (
    <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex w-max items-center gap-1.5">{chips}</div>
    </div>
  );
}
