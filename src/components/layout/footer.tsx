import Link from "next/link";

import packageJson from "../../../package.json";

/**
 * 备案号链接（工信部要求：展示 + 可点进查询页）。
 * 抽成组件是因为它要出现在两处——应用外壳的页脚、以及未登录时的登录/注册页底部。
 * 备案号只在这一处维护，换号不用满仓库找。
 */
export function BeianLink() {
  return (
    <Link
      href="https://beian.miit.gov.cn/"
      target="_blank"
      rel="noopener noreferrer"
      className="transition-colors hover:text-[#000000]"
    >
      鄂ICP备2026039441号
    </Link>
  );
}

/**
 * 页脚（《界面设计规范》§5.2 / §5.3）。挂在主内容区下方。
 *
 * 备案号是工信部核发的真实 ICP 号（湖北），必须挂在页脚并链接到工信部查询页，
 * 这是国内经营性/非经营性网站的硬性要求。
 *
 * 公安联网备案（beian.mps.gov.cn）是**另一套**备案，我们还没办，
 * 所以这里不挂——挂一个编造的号属于虚假备案信息，比不挂更糟，
 * 等公网安备真办下来再补一行。
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
        <BeianLink />
      </div>
    </footer>
  );
}
