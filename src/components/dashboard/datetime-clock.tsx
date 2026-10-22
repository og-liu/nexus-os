"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { retryDelayForAttempt } from "@/lib/datetime/day-change";
import { formatClock, formatDateKey } from "@/lib/datetime/format";
import { shanghaiParts } from "@/lib/datetime/shanghai";

/**
 * 面板上的秒级时钟（《功能/日期时间面板》§2.4、§七）——整个面板**唯一**的客户端组件。
 *
 * 为什么只有它跑在客户端：秒数每秒都要变，服务端给不了；而农历、节日、节气、年度进度
 * 一天只变一次，全在服务端算好当 props 传进来（把 lunar-javascript 挡在浏览器外面）。
 *
 * 三条硬约束：
 * 1. **首帧用服务端那份字符串**（`useState(initialTime)`），水合前后逐字一致；
 *    挂载后才接管成浏览器当前时间，所以不会出现「--:--:--」或跳变（§七「水合不匹配」）。
 * 2. **页面在后台就停表**：监听 `visibilitychange`，隐藏时清定时器、可见时立即对一次表，
 *    否则切走半小时回来会看到「连跳」（§七「后台仍在跑定时器」、§6 验收第 9 条）。
 * 3. **跨天让服务端重算**：日期键与服务端给的对不上就 `router.refresh()`，
 *    日期、农历、节日、年度进度一起换新（§6 验收第 11 条）。浏览器钟可能比服务器快几秒，
 *    所以这条请求按 0 / 5s / 20s / 60s 有上限地重试，两端日期对上就停（`day-change.ts`）。
 *
 * 读屏：整块 `aria-hidden`——秒每秒钟都在变，交给辅助技术逐秒播报就是噪音
 * （§七「秒级刷屏读屏」）。注意 `aria-hidden` 会罩住里面的 `<time>`，所以时钟**不提供**
 * 无障碍语义；日期那条语义由面板日期行的 `<time dateTime>` 承担，读屏要「今天几号」走那里。
 */
interface DatetimeClockProps {
  /** 服务端算好的北京时间 `HH:MM:SS`，首帧原样渲染。 */
  initialTime: string;
  /** 服务端算好的北京时间 `YYYY-MM-DD`，用来判断跨没跨天。 */
  dateKey: string;
  className?: string;
}

interface ClockDisplay {
  time: string;
  dateKey: string;
}

export function DatetimeClock({
  initialTime,
  dateKey: serverDateKey,
  className,
}: DatetimeClockProps) {
  const router = useRouter();
  const [display, setDisplay] = useState<ClockDisplay>({
    time: initialTime,
    dateKey: serverDateKey,
  });
  /** 服务端最近一次给出的日期键：它变了说明 refresh 已经落地。 */
  const serverDateKeyRef = useRef(serverDateKey);

  useEffect(() => {
    serverDateKeyRef.current = serverDateKey;
  }, [serverDateKey]);

  useEffect(() => {
    /** 页面可见时才允许排下一次计时；隐藏 / 卸载后置 false，回调里就不再续期。 */
    let visible = true;
    let timer: number | null = null;
    /** 跨天重试：已经试了几次、上次请求在什么时候（见 `day-change.ts` 的节奏表）。 */
    let dayChangeAttempts = 0;
    let lastRefreshAt = 0;

    const clearTimer = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const tick = () => {
      const now = new Date();
      const parts = shanghaiParts(now);
      const key = formatDateKey(parts);
      setDisplay({ time: formatClock(parts), dateKey: key });

      // 跨天：服务端那份数据还是昨天的，请它重算。
      // 浏览器钟可能比服务器快几秒，第一次请求可能踩在服务端午夜之前，所以按
      // 0 / 5s / 20s / 60s 有上限地重试；两端日期一对上就清零（`day-change.ts`）。
      if (key === serverDateKeyRef.current) {
        dayChangeAttempts = 0;
      } else {
        const delay = retryDelayForAttempt(dayChangeAttempts);
        if (delay !== null && now.getTime() - lastRefreshAt >= delay) {
          dayChangeAttempts += 1;
          lastRefreshAt = now.getTime();
          router.refresh();
        }
      }

      if (!visible) return;
      // 对齐到整秒再唤醒：不对齐的话定时器会漂移，某些秒会被显示两遍或直接跳过
      timer = window.setTimeout(tick, 1000 - (Date.now() % 1000));
    };

    const handleVisibilityChange = () => {
      visible = !document.hidden;
      clearTimer();
      if (visible) tick(); // 回到前台先对一次表，再接着跑
    };

    tick();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      visible = false;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [router]);

  return (
    <div aria-hidden="true" className={className}>
      <time dateTime={`${display.dateKey}T${display.time}`}>
        {/*
          字号跟着**面板自己的宽度**缩放（容器查询单位 cqi），不是跟视口：
          面板在 ≥ xl 时只有 1 列宽（约 430px），手机上更窄，视口断点估不准。
          7cqi ≈ 面板宽 × 7%：430px 时 30px，343px 时 24px，280px 时 20px（clamp 下限）。
          配合 whitespace-nowrap：容器再窄也只会让字变小，不会把这串时间折成两行。
          等宽 + tabular-nums：1 和 8 同宽，秒数跳动时整块不会左右晃（§七「数字宽度抖动」）。
        */}
        <span className="whitespace-nowrap font-mono text-[clamp(1.25rem,7cqi,1.875rem)] font-semibold tabular-nums text-[#000000]">
          {display.time}
        </span>
      </time>
    </div>
  );
}
