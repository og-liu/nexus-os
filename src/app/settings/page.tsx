import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";

export default function SettingsPage() {
  return (
    <>
      <PageHeader description="配置 AI 模型、工具目录、系统偏好等" />
      <div className="space-y-6 px-6 py-4">
        {/* Placeholder sections */}
        <div className="space-y-4">
          <Card className="border-0 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">AI 模型配置</CardTitle>
              <CardDescription className="text-xs">
                接入 AI 大模型，配置 API Key 与模型参数
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-dashed border-border bg-[#F8FAFC] p-8 text-center">
                <p className="text-sm text-muted-foreground">该功能开发中...</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">工具目录</CardTitle>
              <CardDescription className="text-xs">
                管理工具安装路径、缓存和运行偏好
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-dashed border-border bg-[#F8FAFC] p-8 text-center">
                <p className="text-sm text-muted-foreground">该功能开发中...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
