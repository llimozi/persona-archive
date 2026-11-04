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
  const pct = Math.round(((index + 1) / questions.length) * 100);

  return (
    <Page action={<span className="progress__text muted">{index + 1} / {questions.length}</span>}>
      <div className="quiz">
        <div className="progress">
          <div className="progress__track">
            <div className="progress__fill" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <section className="question">
          <p className="kicker">
            第 {index + 1} 题 · 单选
          </p>
          <h1 className="question__title">{q.title}</h1>

          <div className="options" role="group" aria-label={q.title}>
            {q.options.map((opt, i) => (
              <button
                key={opt.id}
                type="button"
                className="option"
                aria-pressed={picked === opt.id}
                onClick={() => onPick(q.id, opt.id)}
              >
                <span className="option__key" aria-hidden="true">
                  {KEYS[i] ?? i + 1}
                </span>
                <span className="option__label">{opt.label}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="quiz__foot">
          {index > 0 && (
            <button type="button" className="btn btn--ghost" onClick={onPrev}>
              上一题
            </button>
          )}
          <button
            type="button"
            className="btn btn--primary"
            onClick={isLast ? onFinish : onNext}
            disabled={!picked}
          >
            {isLast ? '看结果' : '下一题'}
          </button>
        </div>
      </div>
    </Page>
  );
}
