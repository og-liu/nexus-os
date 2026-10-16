import Link from "next/link";

/**
 * 页脚（《界面设计规范》§5.2）。挂在主内容区下方。
 *
 * 备案信息当前是**模拟占位号**（按迁移要求，沿用旧界面的写法）；
 * nexusos.work 的真实备案号下来后替换这两行文案。
 */
export function Footer() {
  return (
    <footer className="bg-[#ECECEC] px-4 py-3 md:px-6">
      <div className="flex flex-col items-center gap-1 text-xs text-[#A0A8B4] lg:flex-row lg:gap-4">
        <span>© {new Date().getFullYear()} Nexus OS</span>
        <Link
          href="https://beian.miit.gov.cn/"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-[#000000]"
        >
          京ICP备2026008321号-1
        </Link>
        <Link
          href="https://beian.mps.gov.cn/"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-[#000000]"
        >
          京公网安备 11010802045678号
        </Link>
      </div>
    </footer>
  );
}
