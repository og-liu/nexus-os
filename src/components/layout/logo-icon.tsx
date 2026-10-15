/**
 * 品牌 Logo：内联 SVG，单路径 + currentColor，
 * 因此可随父级文字颜色一起反色（黑底上自动变白）。
 */
export function LogoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M1024 0v768L768 412.611765V0h256zM0 256l256 355.388235V1024H0V256zM281.6 0l12.047059 16.564706L768 671.623529v-1.505882l256 352.376471v1.505882H742.4L677.647059 935.152941 0 0h281.6z"
        fill="currentColor"
      />
    </svg>
  );
}
