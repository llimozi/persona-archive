import { useState } from 'react';
import { Page } from '../components/Page';
import { PosterSheet } from '../components/PosterSheet';
import { DIM_LABEL } from '../lib/dims';
import { DIM_KEYS } from '../../shared/types';
import type { Dims } from '../../shared/types';
import { archiveNo, categoryLabel, categoryTone, splitName, tidySubtitle } from '../lib/display';

/** 结果页展示所需的最小人物字段 */
export interface ResultPersona {
  id: string;
  name: string;
  category: string;
  tags: string[];
  /** 引擎给出的娱乐匹配度百分比 = round(M' × 100)；**排序与选择完全由引擎决定** */
  percent: number;
  /** 以下字段仅用于展示，按 id 从原始档案回填，不参与排序 */
  desc?: string;
  placeholder?: boolean;
  imageUrl?: string;
}

interface Props {
  top: ResultPersona | null;
  others: ResultPersona[];
  dims: Dims;
  onRestart: () => void;
  onShare: () => void;
  shareHint: string;
  shareUrl: string;
}

/**
 * 人物「档案照片」框：统一相框 + 分类底色 + 大字 + 编号。
 * 真图与占位图走同一个框，换图后观感一致；加载失败退回首字，不留空白。
 */
function ArchivePortrait({ persona, size = 'lg' }: { persona: ResultPersona; size?: 'lg' | 'sm' }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { main } = splitName(persona.name);
  const showImg = Boolean(persona.imageUrl) && !failed;
  const tone = categoryTone(persona.category);

  return (
    <div className={`portrait portrait--${size} portrait--${tone}`}>
      <div className="portrait__frame">
        {/* 首字底衬常驻：图片未就绪或失败时都不会出现空白格 */}
        <div
          className={`portrait__glyph${showImg && loaded ? ' is-hidden' : ''}`}
          data-testid={showImg ? undefined : 'result-avatar-fallback'}
          aria-hidden="true"
        >
          {main.slice(0, 1)}
        </div>
        {showImg && (
          <img
            className={`portrait__img${loaded ? ' is-loaded' : ''}`}
            src={persona.imageUrl}
            alt={`${main} 档案照片`}
            loading="eager"
            decoding="async"
            data-testid="result-avatar-img"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        )}
        {/* 相框四角：档案照片的装裱角 */}
        <span className="portrait__corner portrait__corner--tl" aria-hidden="true" />
        <span className="portrait__corner portrait__corner--tr" aria-hidden="true" />
        <span className="portrait__corner portrait__corner--bl" aria-hidden="true" />
        <span className="portrait__corner portrait__corner--br" aria-hidden="true" />
      </div>
    </div>
  );
}

export function ResultPage({ top, others, dims, onRestart, onShare, shareHint, shareUrl }: Props) {
  const [posterOpen, setPosterOpen] = useState(false);
  const name = top ? splitName(top.name) : { main: '', sub: '' };

  return (
    <Page
      action={
        <button type="button" className="linkbtn" onClick={onRestart}>
          重测
        </button>
      }
      disclaimer
    >
      {top ? (
        <>
          {/* ── 档案卡主体 ── */}
          <section className="record" data-testid="result-card">
            <div className="record__top">
              <span className="mono record__no">{archiveNo(top.id)}</span>
              <span className="record__cat">{categoryLabel(top.category)}</span>
            </div>

            <div className="record__main">
              <ArchivePortrait persona={top} size="lg" />

              <div className="record__id">
                <h1 className="record__name">{name.main}</h1>
                {name.sub && <p className="record__sub">{tidySubtitle(name.sub)}</p>}

                <div className="record__score">
                  <span className="record__score-num mono" data-testid="result-percent">
                    {top.percent}
                  </span>
                  <span className="record__score-unit">%</span>
                  <span className="record__score-cap">
                    娱乐匹配度
                    <em>非心理测量，仅供娱乐</em>
                  </span>
                </div>
              </div>

              {/* 印章位置由样式固定在卡片右下角 */}
            </div>

            {top.tags?.length > 0 && (
              <div className="record__tags">
                {top.tags.map((t) => (
                  <span className="tag" key={t}>
                    {t}
                  </span>
                ))}
              </div>
            )}

            <p className="record__desc">{top.desc}</p>

            {/* 印章放在卡片右下角留白处，不压正文 */}
            <span className="stamp" aria-hidden="true">
              <span className="stamp__inner">
                已
                <br />
                鉴定
              </span>
            </span>
          </section>

          {/* ── 六维：带填充的条形 + 刻度 ── */}
          <section className="section">
            <div className="section__head">
              <h2 className="section__title">六维坐标</h2>
              <span className="section__hint mono">0 — 100</span>
            </div>
            <div className="dims">
              {DIM_KEYS.map((k) => {
                const v = dims[k];
                return (
                  <div className="dim" key={k} data-testid={`dim-${k}`}>
                    <span className="dim__name">{DIM_LABEL[k] ?? k}</span>
                    <span className="dim__track" role="img" aria-label={`${DIM_LABEL[k] ?? k} ${v}`}>
                      <span className="dim__fill" style={{ width: `${Math.max(2, v)}%` }} />
                      <span className="dim__tick dim__tick--50" aria-hidden="true" />
                    </span>
                    <span className="dim__value mono">{v}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── 还有几分像：小档案条 ── */}
          {others.length > 0 && (
            <section className="section">
              <div className="section__head">
                <h2 className="section__title">还有几分像</h2>
                <span className="section__hint">副册</span>
              </div>
              <div className="slips">
                {others.map((p) => {
                  const n = splitName(p.name);
                  return (
                    <div className="slip" key={p.id} data-testid="similar-persona">
                      <ArchivePortrait persona={p} size="sm" />
                      <div className="slip__body">
                        <p className="slip__name">{n.main}</p>
                        {n.sub && <p className="slip__sub">{tidySubtitle(n.sub)}</p>}
                        <span className="slip__cat">{categoryLabel(p.category)}</span>
                      </div>
                      <span className="slip__pct mono">{p.percent}%</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      ) : (
        <section className="empty">
          <div className="empty__mark" aria-hidden="true">
            ∅
          </div>
          <h1 className="title-lg">这一格档案暂时是空的</h1>
          <p className="body">
            匹配需要人物档案数据，当前还没调阅到。
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
          data={{
            personaId: top.id,
            personaName: top.name,
            category: top.category,
            tags: top.tags,
            percent: top.percent,
            dims,
            desc: top.desc,
            imageUrl: top.imageUrl,
          }}
        />
      )}

      {top && (
        <div className="cta cta--split">
          <button type="button" className="btn btn--ghost" onClick={() => setPosterOpen(true)}>
            生成档案海报
          </button>
          <button type="button" className="btn btn--primary" onClick={onShare}>
            分享这份档案
          </button>
        </div>
      )}
      {top && <p className="share-hint">{shareHint}</p>}
    </Page>
  );
}
