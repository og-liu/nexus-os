import Link from "next/link";

import packageJson from "../../../package.json";

/**
 * 页脚（《界面设计规范》§5.2 / §5.3）。挂在主内容区下方。
 *
 * 备案信息当前是**模拟占位号**（按迁移要求，沿用旧界面的写法）；
 * nexusos.work 的真实备案号下来后替换这两行文案。
 *
 * 版本号取自 package.json，构建时内联进产物：页脚显示的就是线上跑的那一版，
 * 所以它同时是「部署成功了没有」的肉眼凭据——发布时间号没变，就是没上去。
 */
export function Footer() {
  return (
    <footer className="bg-[#ECECEC] px-4 py-3 md:px-6">
      <div className="flex flex-col items-center gap-1 text-xs text-[#A0A8B4] lg:flex-row lg:gap-4">
        <span>
          © {new Date().getFullYear()} Nexus OS v{packageJson.version}
        </span>
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
