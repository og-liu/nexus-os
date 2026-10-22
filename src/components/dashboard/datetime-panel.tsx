import type { TodaySnapshot } from "@/lib/datetime/today";
import { DatetimeClock } from "./datetime-clock";

/**
 * 总览页顶部的「日期时间面板」（《功能/日期时间面板》§2.2、§2.3）。
 *
 * **服务端组件**：问候、日期、农历、节日、年度进度都已经是算好的 props
 * （`getTodaySnapshot()` 在页面里跑），这里只负责排版；客户端只有时钟那一小块。
 *
 * 版式（§2.3）：**任何宽度都是两列**——第 1 行「问候+日期 | 时钟（垂直居中）」，
 * 然后标签组、年度进度各占整行。时钟**永远不和问候语分家**：容器窄了缩的是时钟字号
 * （`datetime-clock` 里按容器宽度 `clamp`），不是把时钟挤到下一行。
 *
 * 为什么用 `col-start` / `row-start` 而不是 `order-*`：DOM 顺序始终是
 * 「问候 → 日期 → 标签 → 时钟 → 进度」，视觉上的两列只是把**时钟**摆到第 1 行右侧。
 * 时钟是 `aria-hidden` 的纯展示元素、不参与 Tab 焦点序，所以这里换位置不会让
 * 「焦点顺序与视觉顺序相反」（§2.3 那条禁令的用意）。
 * 总览页把三块摆进三列用的是同一套写法（见 `app/(app)/page.tsx`）。
 *
 * 标签组为空时整组不渲染：不留空行、不占高度（§2.4「节日为空」、§6 验收第 8 条）。
 */
interface DatetimePanelProps {
  /** 登录用户的展示名（`users.username`，保留原始大小写）。 */
  username: string;
  /** 服务端算好的当天数据。 */
  today: TodaySnapshot;
}

export function DatetimePanel({ username, today }: DatetimePanelProps) {
  return (
    <section
      aria-label="日期时间"
      className="@container grid grid-cols-[minmax(0,1fr)_auto] gap-4 rounded-[2px] bg-white p-5"
    >
      {/* 问候 + 日期（左区） */}
      <div className="col-start-1 row-start-1">
        {/*
          用户名最长 20 位，跟问候词一起在 1 列宽（约 430px）里会既挤又容易顶到下一行。
          所以两道限制：
          1. **最多占左区 60%**（`max-w-[60%]`）——不是"放得下就全放"：17 个字符的用户名
             和问候词几乎把左区占满，看着很拥挤（2026-10-22 联调反馈）；
          2. 超出就单行截断（省略号 + `title` 补全名）。
          问候词 `shrink-0`：永远完整、永远和用户名同一行。
        */}
        <p className="flex min-w-0 items-baseline gap-1 text-lg font-semibold text-[#000000] md:text-xl">
          <span className="max-w-[60%] truncate" title={username}>
            {username}
          </span>
          <span className="shrink-0">{today.greeting}</span>
        </p>
        <p className="mt-1 text-xs text-[#8A8A8A]">
          <time dateTime={today.dateKey}>{today.solarDate}</time>
          <span aria-hidden="true"> · </span>
          {today.lunarDate}
        </p>
      </div>

      {/*
        节日 / 节气标签组：三源合并后的全部标签，换行不截断。

        没有节日时**保留这一行的高度**（放一个 `invisible` 的同款标签占位）：
        否则同一天的卡片会因“今天没节日”矮一截，切换日子或换账号时面板高度乱跳。
        占位不上屏也不进读屏树（`visibility: hidden` + 整组 `aria-hidden`）。
      */}
      <ul
        aria-hidden={today.festivals.length === 0 || undefined}
        className="col-span-2 flex flex-wrap gap-2"
      >
        {today.festivals.length > 0 ? (
          today.festivals.map((festival) => (
            <li
              key={festival}
              className="rounded-[2px] bg-[#000000] px-1.5 py-0.5 text-[11px] text-white"
            >
              {festival}
            </li>
          ))
        ) : (
          <li className="invisible rounded-[2px] px-1.5 py-0.5 text-[11px]">
            占位
          </li>
        )}
      </ul>

      {/*
        秒级时钟：**任何宽度都在问候语右侧、同一行**，摆不下就缩小字号（见 datetime-clock）。
        不用 md: 之类的视口断点——面板在 ≥ xl 时只有 1 列宽（约 430px），
        视口再宽也未必放得下；字号按容器宽度缩放才不会把时钟挤到下一行。
      */}
      <DatetimeClock
        className="col-start-2 row-start-1 self-center"
        initialTime={today.clock}
        dateKey={today.dateKey}
      />

      {/* 年度进度：左说明 + 右百分比，下面一条 h-1 的进度条（§7.8） */}
      <div className="col-span-2">
        <div className="flex items-center justify-between gap-4 text-xs">
          <span className="text-[#8A8A8A]">{today.year} 年度进度</span>
          <span className="font-semibold tabular-nums text-[#000000]">
            {today.yearProgress.toFixed(1)}%
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={`${today.year} 年度进度`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={today.yearProgress}
          aria-valuetext={`${today.yearProgress.toFixed(1)}%`}
          className="mt-1.5 h-1 w-full bg-[#F0F0F0]"
        >
          <div
            className="h-full bg-[#000000]"
            style={{ width: `${today.yearProgress}%` }}
          />
        </div>
      </div>
    </section>
  );
}
