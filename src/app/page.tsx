"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Solar } from "lunar-javascript";
import { PageHeader } from "@/components/page-header";
import { LogoIcon } from "@/components/logo-icon";
import {
  FolderOpen,
  Image,
  FileText,
  ScanLine,
  Search,
  ArrowRight,
  SkipBack,
  SkipForward,
  Play,
  Pause,
  Check,
  NotepadText,
  QrCode,
} from "lucide-react";

const stats = [
  { label: "可用工具", value: "6" },
  { label: "已处理文件", value: "128" },
  { label: "自动化任务", value: "3" },
  { label: "知识条目", value: "0" },
  { label: "已装插件", value: "0" },
];

const quickTools = [
  { name: "图片压缩", icon: Image },
  { name: "OCR 识别", icon: ScanLine },
  { name: "以图找图", icon: Search },
  { name: "文件批处理", icon: FolderOpen },
  { name: "格式转换", icon: FileText },
  { name: "文本处理", icon: FileText },
  { name: "便签", icon: NotepadText },
  { name: "二维码工具", icon: QrCode },
];

const recentActivities = [
  {
    action: "图片压缩",
    detail: "处理了 12 张图片，压缩率 68%",
    time: "2 小时前",
    icon: Image,
  },
  {
    action: "OCR 识别",
    detail: "识别文档 scan_001.pdf",
    time: "昨天",
    icon: ScanLine,
  },
  {
    action: "以图找图",
    detail: "在 sprites 目录中查找 icon_sword",
    time: "3 天前",
    icon: Search,
  },
];

const automationTasks = [
  { name: "每日照片备份", status: "正常", next: "明天 06:00", active: true },
  { name: "下载目录整理", status: "正常", next: "每小时", active: true },
  { name: "周报生成", status: "已暂停", next: "—", active: false },
];

const initialTodos = [
  { text: "配置 AI 模型", done: false },
  { text: "整理下载目录", done: false },
  { text: "撰写本周周报", done: true },
];

const stickyNotes = [
  { text: "服务器 8/20 到期，记得续费", time: "今天 09:42" },
  { text: "周五之前给项目录一版 demo 视频", time: "昨天 21:15" },
  { text: "买机械键盘键帽（PBT 原厂高度）", time: "8月11日" },
];

const latestArticles = [
  { title: "用 OCR 把纸质笔记搬进知识库", tag: "教程", date: "8月13日" },
  { title: "我的下载目录自动整理工作流", tag: "自动化", date: "8月11日" },
  { title: "本地优先：个人数据主权实践", tag: "随笔", date: "8月9日" },
  { title: "常见图片压缩算法对比笔记", tag: "技术", date: "8月6日" },
];

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-3.5 w-[3px] bg-[#000000]" />
      <h2 className="text-sm font-semibold text-[#000000]">{title}</h2>
    </div>
  );
}

function getGreeting(hour: number) {
  if (hour < 6) return "夜深了";
  if (hour < 9) return "早上好";
  if (hour < 12) return "上午好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function getLunarInfo(date: Date) {
  const solar = Solar.fromYmd(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
  );
  const lunar = solar.getLunar();
  return {
    lunarDate: `${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
    festivals: lunar.getFestivals(),
    jieQi: lunar.getJieQi(),
  };
}

function GreetingCard() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const { lunarDate, festivals, jieQi } = useMemo(
    () => (now ? getLunarInfo(now) : { lunarDate: "", festivals: [], jieQi: "" }),
    [now],
  );

  const yearStart = now ? new Date(now.getFullYear(), 0, 1).getTime() : 0;
  const yearEnd = now ? new Date(now.getFullYear() + 1, 0, 1).getTime() : 1;
  const yearProgress = now
    ? ((now.getTime() - yearStart) / (yearEnd - yearStart)) * 100
    : 0;

  const festivalTag = festivals[0] ?? jieQi ?? null;

  return (
    <div className="flex h-full flex-col justify-between rounded-[2px] bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xl font-semibold text-[#000000]">
            {now ? getGreeting(now.getHours()) : "你好"}
          </p>
          <p className="mt-1 flex items-center gap-2 text-xs text-[#8A8A8A]">
            {now
              ? now.toLocaleDateString("zh-CN", {
                  month: "long",
                  day: "numeric",
                  weekday: "long",
                })
              : ""}
            {lunarDate && <span>· 农历{lunarDate}</span>}
          </p>
          <div className="mt-2 min-h-[22px]">
            {festivalTag && (
              <span className="inline-block rounded-[2px] bg-[#000000] px-2 py-0.5 text-[11px] font-medium text-white">
                {festivalTag}
              </span>
            )}
          </div>
        </div>
        <p className="font-mono text-3xl font-semibold tabular-nums text-[#000000]">
          {now
            ? now.toLocaleTimeString("zh-CN", { hour12: false })
            : "--:--:--"}
        </p>
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-[#8A8A8A]">
          <span>{now ? `${now.getFullYear()} 年度进度` : "年度进度"}</span>
          <span className="tabular-nums">{yearProgress.toFixed(1)}%</span>
        </div>
        <div className="mt-1.5 h-1 w-full bg-[#F0F0F0]">
          <div
            className="h-full bg-[#000000] transition-[width]"
            style={{ width: `${yearProgress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function MusicPlayerCard() {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <div className="rounded-[2px] bg-white p-5">
      <SectionTitle title="正在播放" />
      <div className="mt-4 flex flex-col items-center">
        {/* 黑胶唱片（与右下角浮窗图标同款：黑圆底 + 白色 Logo） */}
        <div
          className={`flex h-24 w-24 items-center justify-center rounded-full bg-[#000000] ${
            isPlaying ? "animate-[spin_8s_linear_infinite]" : ""
          }`}
        >
          <LogoIcon className="h-10 w-10 text-white" />
        </div>
        <p className="mt-4 text-sm font-medium text-[#000000]">Lo-fi Beats</p>
        <p className="mt-0.5 text-xs text-[#8A8A8A]">专注歌单 · 未连接音源</p>
        {/* 进度条 */}
        <div className="mt-4 w-full">
          <div className="h-1 w-full bg-[#F0F0F0]">
            <div className="h-full w-[35%] bg-[#000000]" />
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-[#999999]">
            <span>1:24</span>
            <span>3:52</span>
          </div>
        </div>
        {/* 控制按钮 */}
        <div className="mt-2 flex items-center gap-5">
          <button className="text-[#666666] transition-colors hover:text-[#000000]">
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#000000] text-white transition-colors hover:bg-[#333333]"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="ml-0.5 h-4 w-4" />
            )}
          </button>
          <button className="text-[#666666] transition-colors hover:text-[#000000]">
            <SkipForward className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function TodoCard() {
  const [todos, setTodos] = useState(initialTodos);

  const toggleTodo = (index: number) => {
    setTodos((prev) =>
      prev.map((todo, i) =>
        i === index ? { ...todo, done: !todo.done } : todo,
      ),
    );
  };

  const doneCount = todos.filter((todo) => todo.done).length;

  return (
    <div className="rounded-[2px] bg-white p-5">
      <div className="flex items-center justify-between">
        <SectionTitle title="今日待办" />
        <span className="text-xs tabular-nums text-[#999999]">
          {doneCount}/{todos.length}
        </span>
      </div>
      <div className="mt-3 space-y-1">
        {todos.map((todo, index) => (
          <button
            key={todo.text}
            onClick={() => toggleTodo(index)}
            className="flex w-full items-center gap-2.5 rounded-[2px] p-2 text-left transition-colors hover:bg-[#F5F5F5]"
          >
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] border transition-colors ${
                todo.done
                  ? "border-[#000000] bg-[#000000]"
                  : "border-[#D0D0D0] bg-white"
              }`}
            >
              {todo.done && <Check className="h-3 w-3 text-white" />}
            </span>
            <span
              className={`text-sm ${
                todo.done
                  ? "text-[#999999] line-through"
                  : "text-[#000000]"
              }`}
            >
              {todo.text}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function DailyQuoteCard() {
  return (
    <div className="flex h-full flex-col rounded-[2px] bg-white p-5">
      <div className="flex items-center justify-between">
        <SectionTitle title="每日一句" />
        <span className="text-xs text-[#999999]">每天更新</span>
      </div>
      <div className="flex flex-1 flex-col justify-center">
        <p className="text-sm leading-relaxed text-[#000000]">
          每一个不曾起舞的日子，都是对生命的辜负。
        </p>
        <p className="mt-2 text-xs text-[#8A8A8A]">—— 尼采</p>
      </div>
    </div>
  );
}

function StickyNotesCard() {
  return (
    <div className="rounded-[2px] bg-white p-5">
      <div className="flex items-center justify-between">
        <SectionTitle title="便签" />
        <Link
          href="/tools"
          className="flex items-center gap-1 text-xs text-[#8A8A8A] transition-colors hover:text-[#000000]"
        >
          管理 <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="mt-3 space-y-2">
        {stickyNotes.map((note) => (
          <div key={note.text} className="rounded-[2px] bg-[#F5F5F5] p-3">
            <p className="text-[13px] leading-relaxed text-[#000000]">
              {note.text}
            </p>
            <p className="mt-1.5 text-[10px] text-[#999999]">{note.time}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      {/* Page Header */}
      <PageHeader description="串联工具、知识与智能，新一代私人专属数字操作系统" />
      <div className="grid grid-cols-1 gap-4 px-6 py-4 xl:grid-cols-3">
        {/* 左列（2/3）：问候时钟+每日一句、KPI、快捷工具、活动+自动化、最新文章 */}
        <div className="space-y-4 xl:col-span-2">
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="w-full md:w-[430px] md:flex-shrink-0">
              <GreetingCard />
            </div>
            <div className="flex-1">
              <DailyQuoteCard />
            </div>
          </div>

          {/* 系统概览 KPI 条 */}
          <div className="rounded-[2px] bg-white p-5">
            <div className="flex items-center justify-between">
              <SectionTitle title="系统概览" />
              <span className="text-xs text-[#999999]">v0.1.0</span>
            </div>
            <div className="mt-4 grid grid-cols-3 divide-[#F0F0F0] sm:grid-cols-5 sm:divide-x">
              {stats.map((stat) => (
                <div key={stat.label} className="px-4 first:pl-0 last:pr-0">
                  <p className="text-xs text-[#8A8A8A]">{stat.label}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-[#000000]">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* 快捷工具 */}
          <div className="rounded-[2px] bg-white p-5">
            <div className="flex items-center justify-between">
              <SectionTitle title="快捷工具" />
              <Link
                href="/tools"
                className="flex items-center gap-1 text-xs text-[#8A8A8A] transition-colors hover:text-[#000000]"
              >
                查看全部 <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {quickTools.map((tool, index) => (
                <Link
                  key={tool.name}
                  href="/tools"
                  className={`group items-center gap-2 rounded-[2px] bg-[#F5F5F5] p-2 transition-colors hover:bg-[#ECECEC] ${
                    index >= 6 ? "hidden xl:flex" : "flex"
                  }`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] bg-white transition-colors group-hover:bg-[#000000]">
                    <tool.icon className="h-4 w-4 text-[#1F1F1F] transition-colors group-hover:text-white" />
                  </div>
                  <span className="truncate text-[13px] text-[#000000]">
                    {tool.name}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {/* 最近活动 + 自动化状态 */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-[2px] bg-white p-5">
              <SectionTitle title="最近活动" />
              <div className="mt-2 divide-y divide-[#F0F0F0]">
                {recentActivities.map((activity) => (
                  <div
                    key={activity.action}
                    className="flex items-center justify-between py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] bg-[#F5F5F5]">
                        <activity.icon className="h-4 w-4 text-[#1F1F1F]" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[#000000]">
                          {activity.action}
                        </p>
                        <p className="truncate text-xs text-[#8A8A8A]">
                          {activity.detail}
                        </p>
                      </div>
                    </div>
                    <span className="ml-3 shrink-0 whitespace-nowrap text-xs text-[#999999]">
                      {activity.time}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2px] bg-white p-5">
              <div className="flex items-center justify-between">
                <SectionTitle title="自动化任务" />
                <Link
                  href="/automation"
                  className="flex items-center gap-1 text-xs text-[#8A8A8A] transition-colors hover:text-[#000000]"
                >
                  管理 <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="mt-2 divide-y divide-[#F0F0F0]">
                {automationTasks.map((task) => (
                  <div
                    key={task.name}
                    className="flex items-center justify-between py-3"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          task.active ? "bg-[#22C55E]" : "bg-[#D0D0D0]"
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[#000000]">
                          {task.name}
                        </p>
                        <p className="text-xs text-[#8A8A8A]">{task.status}</p>
                      </div>
                    </div>
                    <span className="ml-3 shrink-0 whitespace-nowrap text-xs text-[#999999]">
                      {task.next}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 最新文章 */}
          <div className="rounded-[2px] bg-white p-5">
            <div className="flex items-center justify-between">
              <SectionTitle title="最新文章" />
              <Link
                href="/knowledge"
                className="flex items-center gap-1 text-xs text-[#8A8A8A] transition-colors hover:text-[#000000]"
              >
                更多 <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="mt-2 divide-y divide-[#F0F0F0]">
              {latestArticles.map((article) => (
                <div
                  key={article.title}
                  className="flex items-center justify-between py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="shrink-0 rounded-[2px] bg-[#F5F5F5] px-1.5 py-0.5 text-[10px] text-[#666666]">
                      {article.tag}
                    </span>
                    <p className="cursor-pointer truncate text-sm text-[#000000] hover:underline">
                      {article.title}
                    </p>
                  </div>
                  <span className="ml-3 shrink-0 whitespace-nowrap text-xs text-[#999999]">
                    {article.date}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 右列（1/3）常驻栏：Agent、音乐、待办、便签 */}
        <div className="space-y-4">
          <div className="rounded-[2px] bg-white p-5">
            <div className="flex items-center justify-between">
              <SectionTitle title="AI Agent" />
              <span className="flex items-center gap-1.5 text-xs text-[#8A8A8A]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#D0D0D0]" />
                未配置
              </span>
            </div>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#8A8A8A]">模型</span>
                <span className="font-medium text-[#000000]">未配置</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#8A8A8A]">今日对话</span>
                <span className="font-medium text-[#000000]">0</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#8A8A8A]">知识库条目</span>
                <span className="font-medium text-[#000000]">0</span>
              </div>
              <Link
                href="/agent"
                className="flex w-full items-center justify-center gap-2 rounded-[2px] bg-[#000000] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333]"
              >
                <span>开始对话</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          <MusicPlayerCard />

          <TodoCard />

          <StickyNotesCard />
        </div>
      </div>
    </>
  );
}
