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
 * 页身是档案纸 —— 最底层是馆藏纸底图（网格卡 / 装订孔 / 骑缝线 / 已归档印章），
 * 其上叠了噪点与暗角两层固定背景，卡片因此"浮"在纸上。
 * 底部按需挂一行极小的免责声明。
 */
export function Page({ children, action, className, disclaimer = false }: Props) {
  return (
    <div className={`page ${className ?? ''}`}>
      {/* 纸底图 + 噪点 + 暗角：都是固定定位，不参与滚动重排 */}
      <div className="paper-bg" aria-hidden="true" />
      <div className="paper-noise" aria-hidden="true" />
      <div className="paper-vignette" aria-hidden="true" />

      <div className="page__inner page-enter">
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
