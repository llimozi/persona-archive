import { useEffect, useState } from 'react';
import { Page } from '../components/Page';
import { prefersReducedMotion, pulse } from '../lib/motion';
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
  const reduced = prefersReducedMotion();
  // 切题时给旧题一个离场帧，新题再入场（只用 transform/opacity）
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    setLeaving(false);
  }, [index]);

  const go = (fn: () => void) => {
    if (reduced) {
      fn();
      return;
    }
    setLeaving(true);
    window.setTimeout(() => {
      fn();
      // 无论 index 是否变化，都必须复位：否则最后一题/边缘情况下会卡在离场态
      setLeaving(false);
    }, 170);
  };

  return (
    <Page
      className="page--quiz"
      action={
        <span className="pager mono" data-testid="quiz-progress-text">
          {num} / {total}
        </span>
      }
    >
      <div className={`quiz${isLast ? ' is-last' : ''}`}>
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
        <section className={`question${leaving ? ' is-leaving' : ' is-entering'}`} key={q.id}>
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
                  onClick={(e) => {
                    onPick(q.id, opt.id);
                    if (!reduced) pulse(e.currentTarget, 'is-sealing', 320);
                  }}
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
            <button type="button" className="btn btn--ghost" onClick={() => go(onPrev)}>
              上一题
            </button>
          ) : (
            <span className="quiz__foot-spacer" aria-hidden="true" />
          )}
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              // 最后一题直接交卷：不走离场延迟，避免出现「题目已淡出但仪式未挂上」的空档
              if (isLast) onFinish();
              else go(onNext);
            }}
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
