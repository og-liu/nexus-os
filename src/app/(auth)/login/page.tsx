import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { requireGuest } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "登录",
};

export default async function LoginPage() {
  // 已经登录的人不该再看到登录页（否则容易被当成「登录没生效」）
  await requireGuest();

  return (
    <AuthCard
      title="登录"
      description="用用户名和密码进入你的工作空间"
      footer={
        <>
          还没有账号？
          <Link
            href="/register"
            className="ml-1 text-[#000000] underline-offset-2 hover:underline"
          >
            注册
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthCard>
  );
}
