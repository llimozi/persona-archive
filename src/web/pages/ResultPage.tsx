import { useState } from 'react';
import { Page } from '../components/Page';
import { PosterSheet } from '../components/PosterSheet';
import { DIM_LABEL } from '../lib/dims';
import { DIM_KEYS } from '../../shared/types';
import type { Dims } from '../../shared/types';

/** 结果页展示所需的最小人物字段 */
export interface ResultPersona {
  id: string;
  name: string;
  category: string;
  tags: string[];
  /** 引擎给出的娱乐匹配度百分比 = round(M' × 100)；**排序与选择完全由引擎决定** */
  percent: number;
  /** 以下两个字段仅用于展示，按 id 从原始档案回填，不参与排序 */
  desc?: string;
  placeholder?: boolean;
}

interface Props {
  /** 引擎主匹配；无结果时 null */
  top: ResultPersona | null;
  /** 引擎次选 / 隐藏 / 意外 */
  others: ResultPersona[];
  /** 引擎 user.x × 100 */
  dims: Dims;
  onRestart: () => void;
  onShare: () => void;
  shareHint: string;
  /** 生成分享海报用的结果链接（失败降级展示） */
  shareUrl: string;
}

export function ResultPage({ top, others, dims, onRestart, onShare, shareHint, shareUrl }: Props) {
  const [posterOpen, setPosterOpen] = useState(false);
  return (
    <Page
      action={
        <button type="button" className="btn btn--quiet" onClick={onRestart}>
          重测
        </button>
      }
    >
      {top ? (
        <>
          <section className="result__hero">
            <p className="kicker">匹配结果</p>
            <h1 className="result__name">{top.name}</h1>
            <p className="muted" style={{ color: 'rgba(26,26,28,0.55)' }}>
              {top.category}
              {top.placeholder !== false ? ' · 纯文字占位卡' : ''}
            </p>
            {top.tags?.length > 0 && (
              <div className="result__tags">
                {top.tags.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
              </div>
            )}
            <p className="result__desc">{top.desc}</p>
          </section>

          <section className="section">
            <div className="section__head">
              <h2 className="section__title">你的六维坐标</h2>
              <span className="section__hint">0 – 100</span>
            </div>
            <div className="dims">
              {DIM_KEYS.map((k) => (
                <div className="dim" key={k}>
                  <span className="dim__name">{DIM_LABEL[k] ?? k}</span>
                  <span
                    className="dim__track"
                    role="img"
                    aria-label={`${DIM_LABEL[k] ?? k} ${dims[k]}`}
                  >
                    <span className="dim__fill" style={{ width: `${dims[k]}%` }} />
                  </span>
                  <span className="dim__value">{dims[k]}</span>
                </div>
              ))}
            </div>
          </section>

          {others.length > 0 && (
            <section className="section">
              <div className="section__head">
                <h2 className="section__title">还有几分像</h2>
              </div>
              <div className="persona-list">
                {others.map((p) => (
                  <div className="persona-card" key={p.id}>
                    <span className="persona-card__rank">#{p.id}</span>
                    <span className="persona-card__name">{p.name}</span>
                    <span className="tag tag--on-dark">{p.category}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <section className="section">
          <h1 className="title-lg">档案库还是空的</h1>
          <p className="body">
            匹配需要人物档案数据，当前还没加载到。
            <br />
            等数据补齐后重测就能看到结果。
          </p>
        </section>
      )}

      {top && (
        <PosterSheet
          open={posterOpen}
          onClose={() => setPosterOpen(false)}
          shareUrl={shareUrl}
          data={{ personaId: top.id, personaName: top.name, category: top.category, tags: top.tags, percent: top.percent, dims, desc: top.desc }}
        />
      )}

      <div className="quiz__foot">
        <button type="button" className="btn btn--ghost" onClick={() => top && setPosterOpen(true)} disabled={!top}>
          生成海报
        </button>
        <button type="button" className="btn btn--primary" onClick={onShare}>
          分享给朋友
        </button>
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        {shareHint}
      </p>
    </Page>
  );
}
