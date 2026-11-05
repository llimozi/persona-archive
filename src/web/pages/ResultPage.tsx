import { useEffect, useState } from 'react';
import { Page } from '../components/Page';
import { PosterSheet } from '../components/PosterSheet';
import { DIM_LABEL, dimMeaning } from '../lib/dims';
import { DIM_KEYS } from '../../shared/types';
import type { Dims } from '../../shared/types';
import { archiveNo, categoryLabel, categoryTone, splitName, tidySubtitle } from '../lib/display';
import { attachTilt, countUp, prefersReducedMotion, pulse } from '../lib/motion';

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
function ArchivePortrait({
  persona,
  size = 'lg',
  rootRef,
}: {
  persona: ResultPersona;
  size?: 'lg' | 'sm';
  rootRef?: (el: HTMLDivElement | null) => void;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { main } = splitName(persona.name);
  const showImg = Boolean(persona.imageUrl) && !failed;
  const tone = categoryTone(persona.category);

  return (
    <div className={`portrait portrait--${size} portrait--${tone}`} ref={rootRef}>
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

  const reduced = prefersReducedMotion();
  const [shownPercent, setShownPercent] = useState(reduced ? (top?.percent ?? 0) : 0);
  const [stamping, setStamping] = useState(false);
  const [eggTaps, setEggTaps] = useState(0);
  const [stampEl, setStampEl] = useState<HTMLSpanElement | null>(null);
  const [portraitEl, setPortraitEl] = useState<HTMLDivElement | null>(null);
  const [descOpen, setDescOpen] = useState(false);

  // 匹配度滚动计数
  useEffect(() => {
    if (top == null) return;
    if (reduced) {
      setShownPercent(top.percent);
      return;
    }
    const cancel = countUp(0, top.percent, 900, setShownPercent);
    return cancel;
  }, [top, reduced]);

  // 印章落下
  useEffect(() => {
    if (!top || reduced) {
      setStamping(false);
      return;
    }
    const t = window.setTimeout(() => setStamping(true), 420);
    return () => window.clearTimeout(t);
  }, [top, reduced]);

  // 头像相框倾斜视差
  useEffect(() => {
    if (!portraitEl) return;
    return attachTilt(portraitEl, 5);
  }, [portraitEl]);

  const isGold = (top?.percent ?? 0) > 95;

  // 连续点击印章的彩蛋
  const tapStamp = () => {
    if (reduced) return;
    const next = eggTaps + 1;
    setEggTaps(next);
    if (next >= 5) {
      pulse(stampEl, 'is-easter-egg', 920);
      setEggTaps(0);
    }
  };

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

            {/* 首屏焦点：大相框 + 超大匹配度 */}
            <div className="record__main">
              <ArchivePortrait persona={top} size="lg" rootRef={setPortraitEl} />

              <div className="record__score-block">
                <div className="record__score">
                  <span
                    className={`record__score-num mono${isGold ? ' is-gold' : ''}`}
                    data-testid="result-percent"
                  >
                    {shownPercent}
                  </span>
                  <span className="record__score-unit">%</span>
                </div>
                <span className="record__score-cap">
                  娱乐匹配度
                  <em>非心理测量，仅供娱乐</em>
                </span>
              </div>
            </div>

            {/* 大名字：独占一整行，按长度自动缩号 */}
            <h1 className="record__name" data-testid="result-name">
              {name.main}
            </h1>
            {name.sub && <p className="record__sub">{tidySubtitle(name.sub)}</p>}

            {top.tags?.length > 0 && (
              <div className="record__tags">
                {top.tags.slice(0, 3).map((t, i) => (
                  <span className="tag" key={t} style={{ ['--i' as string]: String(i) }}>
                    {t}
                  </span>
                ))}
              </div>
            )}

            {/* 简介默认收起：只露一句，点开看全文 */}
            {top.desc && (
              <div className={`record__desc-wrap${descOpen ? ' is-open' : ''}`}>
                <p className="record__desc">{top.desc}</p>
                <button
                  type="button"
                  className="record__more"
                  aria-expanded={descOpen}
                  onClick={() => setDescOpen((v) => !v)}
                >
                  {descOpen ? '收起' : '展开简介'}
                  <span aria-hidden="true">{descOpen ? '︿' : '﹀'}</span>
                </button>
              </div>
            )}

            {/* 印章：落在卡片右下角留白处；点击可触发彩蛋 */}
            <span
              className={`stamp${isGold ? ' stamp--gold' : ''}${stamping ? ' is-stamping' : ''}`}
              ref={setStampEl}
              role="img"
              aria-label="已鉴定印章"
              onClick={tapStamp}
            >
              <span className="stamp__inner">
                已
                <br />
                鉴定
              </span>
            </span>
          </section>

          {/* ── 六维：次要层级，紧凑条形 + 一句话含义 ── */}
          <section className="section section--dims">
            <div className="section__head">
              <h2 className="section__title">六维坐标</h2>
              <span className="section__hint mono">0 — 100</span>
            </div>
            <div className="dims">
              {DIM_KEYS.map((k) => {
                const v = dims[k];
                const high = v >= 60;
                return (
                  <div className={`dim${high ? ' is-high' : ' is-low'}`} key={k} data-testid={`dim-${k}`}>
                    <div className="dim__row">
                      <span className="dim__name">{DIM_LABEL[k] ?? k}</span>
                      <span className="dim__track" role="img" aria-label={`${DIM_LABEL[k] ?? k} ${v}`}>
                        <span
                          className="dim__fill"
                          style={{ ['--fill' as string]: String(Math.max(2, v) / 100) }}
                        />
                        <span className="dim__tick dim__tick--50" aria-hidden="true" />
                      </span>
                      <span className="dim__value mono">{v}</span>
                    </div>
                    <p className="dim__meaning">{dimMeaning(k, v)}</p>
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
                    <div className="slip" key={p.id} data-testid="similar-persona" style={{ ['--i' as string]: String(others.indexOf(p)) }}>
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
