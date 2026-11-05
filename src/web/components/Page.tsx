import type { ReactNode } from 'react';

interface Props {
  kicker?: string;
  children: ReactNode;
  /** 右上角动作，如进度或重测 */
  action?: ReactNode;
  className?: string;
}

/** 三屏共用骨架：安全区、最大宽度、品牌条、页脚。 */
export function Page({ kicker, children, action, className }: Props) {
  return (
    <div className={`page ${className ?? ''}`}>
      <div className="page__inner">
        <header className="brandbar">
          <span className="brandbar__mark">
            <span className="brandbar__dot" aria-hidden="true" />
            互联网人物档案馆
          </span>
          {action}
        </header>
        {children}
        <footer className="footnote">
          {kicker ?? '人物配图来自公开网络资料，仅供娱乐展示；未取得配图人物或形象的商业授权。'}
        </footer>
      </div>
    </div>
  );
}
