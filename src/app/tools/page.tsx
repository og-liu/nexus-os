import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import {
  Wrench,
  Image,
  ScanLine,
  FolderOpen,
  FileText,
  Search,
} from "lucide-react";

const tools = [
  {
    name: "图片压缩",
    description: "智能压缩图片体积，保持画质",
    icon: Image,
    color: "text-blue-500",
    bg: "bg-blue-50",
    status: "可用",
  },
  {
    name: "图片格式转换",
    description: "PNG、JPG、WebP 等格式互转",
    icon: Image,
    color: "text-pink-500",
    bg: "bg-pink-50",
    status: "可用",
  },
  {
    name: "OCR 文字识别",
    description: "从图片或 PDF 中提取文字",
    icon: ScanLine,
    color: "text-green-500",
    bg: "bg-green-50",
    status: "可用",
  },
  {
    name: "以图找图",
    description: "在精灵图目录中定位图标位置",
    icon: Search,
    color: "text-purple-500",
    bg: "bg-purple-50",
    status: "开发中",
  },
  {
    name: "文件批量处理",
    description: "批量重命名、移动、转换",
    icon: FolderOpen,
    color: "text-orange-500",
    bg: "bg-orange-50",
    status: "开发中",
  },
  {
    name: "文本处理",
    description: "JSON 格式化、编码转换、正则测试",
    icon: FileText,
    color: "text-cyan-500",
    bg: "bg-cyan-50",
    status: "可用",
  },
];

export default function ToolsPage() {
  return (
    <>
      <PageHeader description="高频使用的小工具集合，将重复性工作变成一键操作" />
      <div className="space-y-6 px-6 py-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tools.map((tool) => (
            <Card
              key={tool.name}
              className="border-0 shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:shadow-md transition-shadow cursor-pointer"
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className={`rounded-xl ${tool.bg} p-2.5`}>
                    <tool.icon className={`h-5 w-5 ${tool.color}`} />
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      tool.status === "可用"
                        ? "bg-green-50 text-green-600"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {tool.status}
                  </span>
                </div>
                <CardTitle className="text-sm mt-3">{tool.name}</CardTitle>
                <CardDescription className="text-xs">
                  {tool.description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
