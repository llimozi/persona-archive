import { useEffect, useState } from 'react';
import { Page } from '../components/Page';
import { attachTilt, prefersReducedMotion } from '../lib/motion';

interface Props {
  personaCount: number | null;
  questionCount: number | null;
  onStart: () => void;
  disabled: boolean;
}

/**
 * 首页主视觉：**错落露出的档案卡**。
 *
 * 不是骨架屏——每张都是真档案：有馆藏编号、姓名、印章、分类，
 * 像被手指拨开的一叠卡；同时承担"这产品是什么"的信息职责。
 */
const CARD_FACES = [
  { no: '0003', name: 'coke老师', cat: '网络热梗', seal: '已归档', pending: false },
  { no: '0012', name: '酱板鸭', cat: '短剧角色', seal: '已归档', pending: false },
  { no: '0047', name: 'Faker', cat: '电竞选手', seal: '待鉴定', pending: true },
];

export function HomePage({ personaCount, questionCount, onStart, disabled }: Props) {
  const pad = (n: number | null) => (n === null ? '—' : String(n).padStart(2, '0'));
  const [stackEl, setStackEl] = useState<HTMLElement | null>(null);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    if (!stackEl) return;
    return attachTilt(stackEl, 6);
  }, [stackEl]);

  const stagger = (i: number) => (reduced ? undefined : { ['--i' as string]: String(i) });

  return (
    <Page disclaimer className="home-tight">
      {/* ── 主视觉：三张错落露出的档案卡 ── */}
      <section className="stack stagger" style={stagger(0)} ref={setStackEl} aria-hidden="true">
        {CARD_FACES.map((c, i) => (
          <article className={`stack__card stack__card--${i}`} key={c.no}>
            <header className="stack__top">
              <span className="mono stack__no">ARCH·{c.no}</span>
              <span className="stack__cat">{c.cat}</span>
            </header>
            <div className="stack__body">
              <div className="stack__photo">
                <span>{c.name.slice(0, 1)}</span>
              </div>
              <div className="stack__id">
                <p className="stack__name">{c.name}</p>
                <span className={`stack__seal${c.pending ? ' is-pending' : ''}`}>{c.seal}</span>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="hero stagger" style={stagger(1)}>
        <p className="kicker">
          <span className="kicker__rule" aria-hidden="true" />
          六 维 人 格 档 案
        </p>
        <h1 className="title-xl">
          你像互联网上的
          <br />
          <em>哪一号人物</em>？
        </h1>
      </section>

      {/* ── 馆藏数据：一行横排，占位极小 ── */}
      <section className="ledger stagger" aria-label="馆藏数据" style={stagger(2)}>
        <div className="ledger__item">
          <span className="ledger__value mono">{pad(personaCount)}</span>
          <span className="ledger__label">馆藏档案</span>
        </div>
        <div className="ledger__item">
          <span className="ledger__value mono">{pad(questionCount)}</span>
          <span className="ledger__label">鉴定题</span>
        </div>
        <div className="ledger__item">
          <span className="ledger__value mono">06</span>
          <span className="ledger__label">计量维度</span>
        </div>
      </section>

      <div className="cta stagger" style={stagger(3)}>
        <button
          type="button"
          className={`btn btn--primary btn--block${disabled || reduced ? '' : ' is-breathing'}`}
          onClick={onStart}
          disabled={disabled}
        >
          {disabled ? '正在调阅档案…' : '开始鉴定'}
          <span className="btn__arrow" aria-hidden="true">
            →
          </span>
        </button>
        <p className="hero__note">
          <span className="mono">约 02 分钟</span> ｜ 无需登记，作答只留在本机
        </p>
      </div>
    </Page>
  );
}
