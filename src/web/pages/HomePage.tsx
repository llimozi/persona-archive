import { Page } from '../components/Page';

interface Props {
  personaCount: number | null;
  questionCount: number | null;
  onStart: () => void;
  disabled: boolean;
}

/** 六维中文名（馆藏数据里列出来，让「06 维度」有实感） */
const DIMS = ['情绪浓度', '表达风格', '行动力', '复杂性', '反叛度', '社交半径'];

export function HomePage({ personaCount, questionCount, onStart, disabled }: Props) {
  const pad = (n: number | null) => (n === null ? '—' : String(n).padStart(2, '0'));

  return (
    <Page disclaimer>
      {/* ── 视觉主角：档案柜抽屉 ── */}
      <section className="cabinet" aria-hidden="true">
        <div className="cabinet__head">
          <span className="mono">馆藏 · 第 01 柜</span>
          <span className="mono">1987—2026</span>
        </div>
        <div className="cabinet__drawers">
          {[0, 1, 2].map((i) => (
            <div className={`drawer drawer--${i}`} key={i}>
              <span className="drawer__label mono">A—{String(i + 1).padStart(2, '0')}</span>
              <span className="drawer__handle" />
              <span className="drawer__tabs">
                {Array.from({ length: 6 }).map((_, k) => (
                  <span className="drawer__tab" key={k} />
                ))}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="hero">
        <p className="kicker">
          <span className="kicker__rule" aria-hidden="true" />
          六 维 人 格 档 案
        </p>
        <h1 className="title-xl">
          你像互联网上的
          <br />
          <em>哪一号人物</em>？
        </h1>
        <p className="body">
          翻几页馆藏，比对六维人格坐标，
          <br />
          为你立一张属于自己的档案卡。
        </p>
      </section>

      {/* ── 馆藏数据：像卡片目录一样排 ── */}
      <section className="ledger" aria-label="馆藏数据">
        <div className="ledger__item">
          <span className="ledger__label">馆藏档案</span>
          <span className="ledger__value mono">{pad(personaCount)}</span>
          <span className="ledger__unit">号</span>
        </div>
        <div className="ledger__item">
          <span className="ledger__label">鉴定题</span>
          <span className="ledger__value mono">{pad(questionCount)}</span>
          <span className="ledger__unit">题</span>
        </div>
        <div className="ledger__item ledger__item--wide">
          <span className="ledger__label">计量维度</span>
          <span className="ledger__value mono">06</span>
          <span className="ledger__unit">维</span>
          <div className="ledger__dims">
            {DIMS.map((d) => (
              <span className="ledger__dim" key={d}>
                {d}
              </span>
            ))}
          </div>
        </div>
      </section>

      <p className="hero__note">
        <span className="mono">约 02 分钟</span> ｜ 无需登记，作答只留在本机
      </p>

      <div className="cta">
        <button type="button" className="btn btn--primary btn--block" onClick={onStart} disabled={disabled}>
          {disabled ? '正在调阅档案…' : '开始鉴定'}
          <span className="btn__arrow" aria-hidden="true">
            →
          </span>
        </button>
      </div>
    </Page>
  );
}
