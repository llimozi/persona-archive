import { useEffect, useRef, useState } from 'react';
import { countUp } from '../lib/motion';
import type { Dims } from '../../shared/types';
import { DIM_KEYS } from '../../shared/types';
import { DIM_LABEL } from '../lib/dims';

interface Props {
  /** 候选档案名（飞快翻过用） */
  candidates: string[];
  /** 最终匹配到的名字 */
  finalName: string;
  /** 引擎算出的六维（滚动目标） */
  dims: Dims;
  /** 减弱动效时立即完成 */
  reduced: boolean;
  onDone: () => void;
}

/**
 * 「比对中」仪式：约 2.4 秒。
 *
 * 阶段：
 *   0.0–0.9s  档案柜抽屉依次抽动 + 「比对中」标签
 *   0.9–1.7s  候选档案飞快翻过（每 70ms 换一个名字）
 *   1.7–2.2s  六维数值滚动到最终值、条形生长
 *   2.2–2.4s  定格到匹配人物，交给结果页盖印章
 *
 * 全部动画只用 transform / opacity；数值滚动由 rAF 驱动。
 * 减弱动效（reduced=true）时直接回调，不做任何过渡。
 */
export function RitualOverlay({ candidates, finalName, dims, reduced, onDone }: Props) {
  const [flipName, setFlipName] = useState(candidates[0] ?? '');
  const [shownDims, setShownDims] = useState<Dims>({ EE: 0, ST: 0, AC: 0, HX: 0, RB: 0, SR: 0 });
  const [phase, setPhase] = useState<'cabinet' | 'flip' | 'reveal' | 'final'>('cabinet');
  const timers = useRef<number[]>([]);
  const cancels = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (reduced) {
      onDone();
      return;
    }

    const after = (ms: number, fn: () => void) => {
      timers.current.push(window.setTimeout(fn, ms));
    };

    // 阶段 2：候选翻动（从第一帧就开始翻，不等抽屉动画结束）
    const pool = candidates.length ? candidates : [finalName];
    let i = 0;
    const flipTimer = window.setInterval(() => {
      i += 1;
      setFlipName(pool[i % pool.length] ?? finalName);
    }, 70);
    timers.current.push(flipTimer as unknown as number);

    after(880, () => setPhase('flip'));

    // 阶段 3：六维滚动（提前到 1.2s，和翻动重叠，观感更紧凑）
    after(1200, () => {
      window.clearInterval(flipTimer);
      setPhase('reveal');
      (Object.keys(dims) as Array<keyof Dims>).forEach((k, idx) => {
        const cancel = countUp(0, dims[k], 460 + idx * 40, (v) => {
          setShownDims((prev) => (prev[k] === v ? prev : { ...prev, [k]: v }));
        });
        cancels.current.push(cancel);
      });
    });

    // 阶段 4：定格
    after(2240, () => {
      setPhase('final');
      setFlipName(finalName);
    });
    after(2460, onDone);

    return () => {
      for (const t of timers.current) {
        window.clearTimeout(t);
        window.clearInterval(t);
      }
      for (const c of cancels.current) c();
    };
    // 只在挂载时启动一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  if (reduced) return null;

  return (
    <div className="ritual" role="status" aria-live="polite" data-testid="ritual-overlay">
      <p className="ritual__label">{phase === 'final' ? '比对完成' : '比对中'}</p>

      <div className="ritual__cabinet" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div className="ritual__drawer" style={{ ['--i' as string]: String(i) }} key={i} />
        ))}
      </div>

      <div className="ritual__flip" data-testid="ritual-flip">
        {phase === 'final' ? <span className="ritual__final">{finalName}</span> : flipName}
      </div>

      <div className="ritual__dims" aria-hidden="true">
        {DIM_KEYS.map((k) => (
          <div className="ritual__dim" key={k}>
            <div className="ritual__dim-value">{shownDims[k]}</div>
            <div className="ritual__dim-bar">
              <span
                className="ritual__dim-fill"
                style={{ animationDelay: `${Math.random() * 120}ms` }}
              />
            </div>
            <span className="ritual__dim-name">{DIM_LABEL[k] ?? k}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
