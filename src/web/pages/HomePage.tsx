import { Page } from '../components/Page';

interface Props {
  personaCount: number | null;
  questionCount: number | null;
  onStart: () => void;
  disabled: boolean;
}

export function HomePage({ personaCount, questionCount, onStart, disabled }: Props) {
  const fmt = (n: number | null) => (n === null ? '—' : String(n).padStart(2, '0'));

  return (
    <Page>
      <section className="hero">
        <p className="kicker">六维人格档案</p>
        <h1 className="title-xl">
          你像互联网上的
          <br />
          哪一号人物？
        </h1>
        <p className="body">
          做几道选择题，比对六维人格坐标，
          <br />
          生成一份属于你的档案卡。
        </p>

        <div className="hero__cards">
          <div className="hero__card">
            <div className="hero__card-label">档案</div>
            <div className="hero__card-value">{fmt(personaCount)}</div>
          </div>
          <div className="hero__card">
            <div className="hero__card-label">题目</div>
            <div className="hero__card-value">{fmt(questionCount)}</div>
          </div>
          <div className="hero__card">
            <div className="hero__card-label">维度</div>
            <div className="hero__card-value">06</div>
          </div>
        </div>

        <p className="hero__note">
          约 2 分钟。不需要注册，答案只留在本机。
        </p>
      </section>

      <div className="hero__cta">
        <button
          type="button"
          className="btn btn--primary"
          onClick={onStart}
          disabled={disabled}
        >
          {disabled ? '题库准备中…' : '开始答题'}
        </button>
      </div>
    </Page>
  );
}
