import { Page } from '../components/Page';
import type { Answers } from '../lib/api';
import type { Question } from '../../shared/types';

interface Props {
  questions: Question[];
  index: number;
  answers: Answers;
  onPick: (questionId: string, optionId: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onFinish: () => void;
}

const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

export function QuizPage({ questions, index, answers, onPick, onPrev, onNext, onFinish }: Props) {
  const q = questions[index];
  if (!q) return null;

  const picked = answers[q.id];
  const isLast = index === questions.length - 1;
  const num = String(index + 1).padStart(2, '0');
  const total = String(questions.length).padStart(2, '0');

  return (
    <Page
      action={
        <span className="pager mono" data-testid="quiz-progress-text">
          {num} / {total}
        </span>
      }
    >
      <div className="quiz">
        {/* 进度：一排存档卡槽，走过的槽盖上朱红印 */}
        <div className="progress" aria-hidden="true">
          <div className="progress__slots">
            {questions.map((item, i) => (
              <span
                key={item.id}
                className={
                  'progress__slot' +
                  (i < index ? ' is-done' : '') +
                  (i === index ? ' is-now' : '')
                }
              />
            ))}
          </div>
          <div className="progress__meta">
            <span className="mono">
              {num} / {total}
            </span>
            <span className="progress__hint">{isLast ? '最后一题' : `还剩 ${questions.length - index - 1} 题`}</span>
          </div>
        </div>

        {/* key 变化触发轻量淡入，不打断点击 */}
        <section className="question" key={q.id}>
          <p className="kicker">
            第 {num} 题 · 鉴定
          </p>
          <h1 className="question__title">{q.title}</h1>

          <div className="options" role="group" aria-label={q.title}>
            {q.options.map((opt, i) => {
              const active = picked === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`option${active ? ' is-picked' : ''}`}
                  aria-pressed={active}
                  onClick={() => onPick(q.id, opt.id)}
                >
                  <span className="option__key" aria-hidden="true">
                    {KEYS[i] ?? i + 1}
                  </span>
                  <span className="option__label">{opt.label}</span>
                  <span className="option__mark" aria-hidden="true">
                    {active ? '✓' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="quiz__foot">
          {index > 0 ? (
            <button type="button" className="btn btn--ghost" onClick={onPrev}>
              上一题
            </button>
          ) : (
            <span className="quiz__foot-spacer" aria-hidden="true" />
          )}
          <button
            type="button"
            className="btn btn--primary"
            onClick={isLast ? onFinish : onNext}
            disabled={!picked}
            data-state={picked ? 'ready' : 'idle'}
          >
            {!picked ? '请先选择' : isLast ? '查看我的档案' : '下一题'}
            {picked && (
              <span className="btn__arrow" aria-hidden="true">
                →
              </span>
            )}
          </button>
        </div>

        {/* 底部馆藏注记：填补大面积留白，同时保持档案气质 */}
        <div className="quiz__caption" aria-hidden="true">
          <span className="mono">ARCHIVE · 六维人格鉴定</span>
          <span>本页作答仅保存在本机</span>
        </div>
      </div>
    </Page>
  );
}
