import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";
import { requireGuest } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "注册",
};

export default async function RegisterPage() {
  // 已经登录就不再走注册流程
  await requireGuest();

  return (
    <AuthCard
      title="创建账号"
      description="注册后即可进入你的工作空间"
      footer={
        <>
          已有账号？
          <Link
            href="/login"
            className="ml-1 text-[#000000] underline-offset-2 hover:underline"
          >
            登录
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthCard>
  );
}
