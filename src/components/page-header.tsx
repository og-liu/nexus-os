import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  description: string;
  children?: ReactNode;
  className?: string;
}

export function PageHeader({
  description,
  children,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-b border-[#E8E8E8] bg-[#F5F5F5] px-6 py-4 text-black",
        className,
      )}
    >
      <h1 className="text-xl font-semibold text-[#000000]">{description}</h1>
      {children ? (
        <div className="flex items-center gap-3">{children}</div>
      ) : null}
    </div>
  );
}
