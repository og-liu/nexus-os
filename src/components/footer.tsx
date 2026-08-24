import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-[#ECECEC] px-4 py-3 md:px-6">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-[#A0A8B4]">
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
