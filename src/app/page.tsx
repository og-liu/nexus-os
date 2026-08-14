import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import {
  Wrench,
  FolderOpen,
  Bot,
  BookOpen,
  Zap,
  Image,
  FileText,
  ScanLine,
  ArrowRight,
  Clock,
  TrendingUp,
} from "lucide-react";

const quickTools = [
  { name: "图片压缩", icon: Image, color: "text-blue-500", bg: "bg-blue-50" },
  {
    name: "OCR 识别",
    icon: ScanLine,
    color: "text-green-500",
    bg: "bg-green-50",
  },
  {
    name: "以图找图",
    icon: Image,
    color: "text-purple-500",
    bg: "bg-purple-50",
  },
  {
    name: "文件批处理",
    icon: FolderOpen,
    color: "text-orange-500",
    bg: "bg-orange-50",
  },
  {
    name: "格式转换",
    icon: FileText,
    color: "text-pink-500",
    bg: "bg-pink-50",
  },
  {
    name: "文本处理",
    icon: FileText,
    color: "text-cyan-500",
    bg: "bg-cyan-50",
  },
];

const recentActivities = [
  {
    action: "图片压缩",
    detail: "处理了 12 张图片，压缩率 68%",
    time: "2 小时前",
  },
  { action: "OCR 识别", detail: "识别文档 scan_001.pdf", time: "昨天" },
  {
    action: "以图找图",
    detail: "在 sprites 目录中查找 icon_sword",
    time: "3 天前",
  },
];

export default function HomePage() {
  return (
    <>
      {/* Page Header */}
      <PageHeader description="串联工具、知识与智能，新一代私人专属数字操作系统" />
      <div className="space-y-6 px-6 py-4">
        {/* Top Row: Two Cards Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* System Overview Card */}
          <Card className="border-0 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-[#1890FF]" />
                  <CardTitle className="text-base">系统概览</CardTitle>
                </div>
                <Badge variant="secondary" className="text-xs font-normal">
                  v0.1.0
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg bg-[#F0F9FF] p-3">
                  <p className="text-xs text-muted-foreground">可用工具</p>
                  <p className="mt-1 text-xl font-semibold text-[#1890FF]">6</p>
                </div>
                <div className="rounded-lg bg-[#F6FDF6] p-3">
                  <p className="text-xs text-muted-foreground">已处理文件</p>
                  <p className="mt-1 text-xl font-semibold text-green-600">
                    128
                  </p>
                </div>
                <div className="rounded-lg bg-[#FFF7F0] p-3">
                  <p className="text-xs text-muted-foreground">自动化任务</p>
                  <p className="mt-1 text-xl font-semibold text-orange-500">
                    3
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI Agent Status Card */}
          <Card className="border-0 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-[#1890FF]" />
                  <CardTitle className="text-base">AI Agent</CardTitle>
                </div>
                <Badge className="bg-green-50 text-green-600 hover:bg-green-50 border-0">
                  就绪
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">模型</span>
                  <span className="font-medium">未配置</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">今日对话</span>
                  <span className="font-medium">0</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">知识库条目</span>
                  <span className="font-medium">0</span>
                </div>
                <button className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[#1890FF] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#40a9ff]">
                  <span>开始对话</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Tools Section */}
        <Card className="border-0 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-[#1890FF]" />
                <CardTitle className="text-base">快捷工具</CardTitle>
              </div>
              <button className="flex items-center gap-1 text-xs text-[#1890FF] hover:underline">
                查看全部 <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            <CardDescription className="text-xs">
              常用工具一键直达，将重复性工作变成简单操作
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {quickTools.map((tool) => (
                <button
                  key={tool.name}
                  className="flex flex-col items-center gap-2 rounded-lg p-4 transition-colors hover:bg-gray-50"
                >
                  <div className={`rounded-xl ${tool.bg} p-3`}>
                    <tool.icon className={`h-5 w-5 ${tool.color}`} />
                  </div>
                  <span className="text-xs text-foreground">{tool.name}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Bottom Row: Recent Activity */}
        <Card className="border-0 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-[#1890FF]" />
              <CardTitle className="text-base">最近活动</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentActivities.map((activity, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-lg bg-[#F8FAFC] px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-[#E6F4FF] flex items-center justify-center">
                      <Zap className="h-4 w-4 text-[#1890FF]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {activity.action}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {activity.detail}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {activity.time}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
