import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-[#ECECEC] px-6 py-3">
      <div className="flex items-center justify-center gap-4 text-xs text-[#A0A8B4]">
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
