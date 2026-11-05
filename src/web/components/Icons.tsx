/**
 * 内联图标组件（源自 Lucide，ISC 许可）。
 *
 * 为什么内联而不是 <img> 或图标字体：
 *   1. 零额外网络请求，首屏更快；
 *   2. 颜色继承 currentColor，跟着主题走；
 *   3. 不会因为外链资源加载失败而出现空白。
 */
import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 20, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function ArchiveIcon(props: IconProps) {
  return <Base {...props}><rect width="20" height="5" x="2" y="3" rx="1" /> <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /> <path d="M10 12h4" /></Base>;
}

export function StampIcon(props: IconProps) {
  return <Base {...props}><path d="M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-6 0c0 2 1 2 1 3.5V13" /> <path d="M20 15.5a2.5 2.5 0 0 0-2.5-2.5h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1z" /> <path d="M5 22h14" /></Base>;
}

export function ChevronDownIcon(props: IconProps) {
  return <Base {...props}><path d="m6 9 6 6 6-6" /></Base>;
}

export function ChevronRightIcon(props: IconProps) {
  return <Base {...props}><path d="m9 18 6-6-6-6" /></Base>;
}

export function ShareIcon(props: IconProps) {
  return <Base {...props}><circle cx="18" cy="5" r="3" /> <circle cx="6" cy="12" r="3" /> <circle cx="18" cy="19" r="3" /> <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" /> <line x1="15.41" x2="8.59" y1="6.51" y2="10.49" /></Base>;
}

export function ImageIcon(props: IconProps) {
  return <Base {...props}><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /> <circle cx="9" cy="9" r="2" /> <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></Base>;
}

export function ArrowRightIcon(props: IconProps) {
  return <Base {...props}><path d="M5 12h14" /> <path d="m12 5 7 7-7 7" /></Base>;
}

export function ResetIcon(props: IconProps) {
  return <Base {...props}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /> <path d="M3 3v5h5" /></Base>;
}

export function ScanIcon(props: IconProps) {
  return <Base {...props}><path d="M3 7V5a2 2 0 0 1 2-2h2" /> <path d="M17 3h2a2 2 0 0 1 2 2v2" /> <path d="M21 17v2a2 2 0 0 1-2 2h-2" /> <path d="M7 21H5a2 2 0 0 1-2-2v-2" /> <path d="M7 12h10" /></Base>;
}
