import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** 右上角动作，如进度或重测 */
  action?: ReactNode;
  className?: string;
  /** 是否显示底部免责声明小字（按需求只在首页与结果页出现，答题页不放） */
  disclaimer?: boolean;
}

/**
 * 三屏共用骨架。
 *
 * 视觉语言：顶部是一条**深墨色馆藏条**（反白字 + 等宽编号），
 * 页身是档案纸，底部按需挂一行极小的免责声明。
 */
export function Page({ children, action, className, disclaimer = false }: Props) {
  return (
    <div className={`page ${className ?? ''}`}>
      <div className="page__inner">
        <header className="brandbar">
          <span className="brandbar__mark">
            <span className="brandbar__seal" aria-hidden="true">
              档
            </span>
            <span className="brandbar__name">互联网人物档案馆</span>
            <span className="brandbar__code mono" aria-hidden="true">
              ARCHIVE
            </span>
          </span>
          {action}
        </header>

        <main className="page__body">{children}</main>

        {disclaimer && (
          <footer className="footnote">
            人物配图来自公开网络资料，仅供娱乐展示，不构成任何专业判断。
          </footer>
        )}
      </div>
    </div>
  );
}
