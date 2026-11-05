import { useCallback, useEffect, useState } from 'react';
import { HomePage } from './pages/HomePage';
import { QuizPage } from './pages/QuizPage';
import { ResultPage } from './pages/ResultPage';
import { Page } from './components/Page';
import { computeNine } from './lib/nine';
import type { RankedPersona } from './lib/api';
import { checkUnlock } from '../shared/unlock';
import { RitualOverlay } from './components/RitualOverlay';
import {
  fetchPersonas,
  fetchQuestions,
  runMatch,
  type Answers,
} from './lib/api';
import { buildShareUrl, clearTokenInUrl, decodeAnswers, readTokenFromUrl } from './lib/share';
import type { Dims, Persona, Question, ThemeConfig } from '../shared/types';
import type { ResultPersona } from './pages/ResultPage';
import { prefersReducedMotion, shouldSkipRitual } from './lib/motion';

/** 仪式期间背后保留一张静态底纸，避免露出空白 */
function QuizPlaceholder() {
  return (
    <Page>
      <div style={{ minHeight: '60vh' }} aria-hidden="true" />
    </Page>
  );
}
import './styles/app.css';
import './styles/motion.css';

/**
 * 回填白名单：从原始档案补齐时**只允许**这些展示字段。
 * 新增回填字段必须先加进这里——把"只补展示"从注释承诺变成编译期约束，
 * 防止以后有人往这里加排序相关字段而悄悄影响结果。
 */
type DisplayOnlyFill = Pick<ResultPersona, 'desc' | 'placeholder' | 'imageUrl'>;

type Screen = 'home' | 'quiz' | 'result';
type LoadState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; message: string };

const EMPTY_DIMS: Dims = { EE: 50, ST: 50, AC: 50, HX: 50, RB: 50, SR: 50 };

/** 答题进度落 sessionStorage：微信里切后台 / 误刷新不丢答案 */
const PROGRESS_KEY = 'pa.quiz.v1';

interface Progress {
  index: number;
  answers: Answers;
  /** 有未完成的答题进度时，刷新/切后台回来应落回答题页而不是首页 */
  screen: Screen;
}

function loadProgress(): Progress {
  try {
    const raw = sessionStorage.getItem(PROGRESS_KEY);
    if (!raw) return { index: 0, answers: {}, screen: 'home' };
    const p = JSON.parse(raw) as Partial<Progress>;
    const screen: Screen = p.screen === 'quiz' || p.screen === 'result' ? p.screen : 'home';
    return {
      index: typeof p.index === 'number' && p.index >= 0 ? p.index : 0,
      answers: p.answers && typeof p.answers === 'object' ? (p.answers as Answers) : {},
      screen,
    };
  } catch {
    return { index: 0, answers: {}, screen: 'home' };
  }
}

function saveProgress(p: Progress | null): void {
  try {
    if (p) sessionStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
    else sessionStorage.removeItem(PROGRESS_KEY);
  } catch {
    /* 隐私模式禁用存储时降级为纯内存 */
  }
}

export function App() {
  // 惰性初始化：首帧就读到存档，避免「空初始值先覆盖存档」的竞态
  const [initial] = useState<Progress>(() => {
    // 优先读 ?r=（他人分享的结果链接），其次读本地存档
    const token = readTokenFromUrl();
    const fromShare = token ? decodeAnswers(token) : null;
    if (fromShare) {
      const qs = Object.keys(fromShare);
      return { index: 0, answers: fromShare, screen: qs.length ? 'result' : 'home' };
    }
    return loadProgress();
  });
  const [screen, setScreen] = useState<Screen>(() => {
    const hasAnswers = Object.keys(initial.answers).length > 0;
    if (initial.screen === 'result' && hasAnswers) return 'result';
    if (initial.screen === 'quiz' && hasAnswers) return 'quiz';
    return 'home';
  });
  const [questions, setQuestions] = useState<LoadState<Question[]>>({ status: 'loading' });
  const [theme, setTheme] = useState<ThemeConfig | undefined>(undefined);
  const [personas, setPersonas] = useState<LoadState<Persona[]>>({ status: 'loading' });
  const [index, setIndex] = useState<number>(() => initial.index);
  const [answers, setAnswers] = useState<Answers>(() => initial.answers);
  // 「比对中」仪式：finish 后先播仪式再进结果页；?r= 直达或减弱动效时跳过
  const [ritual, setRitual] = useState(false);
  const reducedMotion = prefersReducedMotion();

  // 动效关闭时给根节点打标，CSS 侧同步降级
  useEffect(() => {
    if (prefersReducedMotion()) document.documentElement.classList.add('anim-off');
  }, []);

  useEffect(() => {
    saveProgress({ index, answers, screen });
  }, [index, answers, screen]);

  // 题库到达后把恢复出的题号夹回合法范围（题库可能变短）
  useEffect(() => {
    if (questions.status !== 'ready') return;
    const max = Math.max(questions.data.length - 1, 0);
    setIndex((i) => Math.min(Math.max(i, 0), max));
  }, [questions.status, questions.status === 'ready' ? questions.data.length : 0]);

  useEffect(() => {
    let alive = true;
    fetchQuestions()
      .then((r) => {
        if (!alive) return;
        setQuestions({ status: 'ready', data: r.items });
        // 权重权威源是 data/questions.json 的 theme，经 /api/questions 下发
        if (r.theme) setTheme(r.theme);
      })
      .catch((e: Error) => alive && setQuestions({ status: 'error', message: e.message }));
    fetchPersonas()
      .then((r) => alive && setPersonas({ status: 'ready', data: r.items }))
      .catch((e: Error) => alive && setPersonas({ status: 'error', message: e.message }));
    return () => {
      alive = false;
    };
  }, []);

  const qs = questions.status === 'ready' ? questions.data : [];
  const ps = personas.status === 'ready' ? personas.data : [];

  const pick = useCallback((questionId: string, optionId: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
  }, []);

  const restart = useCallback(() => {
    setAnswers({});
    setIndex(0);
    setScreen('home');
    try {
      sessionStorage.removeItem(PROGRESS_KEY);
    } catch {
      /* 忽略 */
    }
    // 清掉地址栏里的旧结果 token，避免重测后又分享出上一份结果
    clearTokenInUrl();
    window.scrollTo(0, 0);
  }, []);

  const share = useCallback(async () => {
    const text = '我测出了自己的互联网人物档案，你也来试试。';
    // 带上 ?r=，他人打开看到同一份结果；没有作答记录时退化为分享首页
    const url = Object.keys(answers).length ? buildShareUrl(answers) : location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: '互联网人物档案馆', text, url });
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        alert('结果链接已复制，粘到微信里发出去，打开的人能看到同一份档案。');
      }
    } catch {
      /* 用户取消分享，不提示 */
    }
  }, [answers]);

  /* —— 数据未就绪时的兜底 —— */
  if (questions.status === 'error') {
    return (
      <Page>
        <h1 className="title-lg">接口没连上</h1>
        <p className="body">后端似乎没起来，检查一下 /api 代理。</p>
        <p className="notice notice--danger" style={{ marginTop: 16 }}>
          {questions.status === 'error' ? questions.message : ''}
        </p>
      </Page>
    );
  }

  if (questions.status === 'loading') {
    return (
      <Page>
        <div className="skeleton" aria-label="加载中" aria-busy="true">
          <span className="skeleton__line" />
          <span className="skeleton__line" />
        </div>
      </Page>
    );
  }

  // 唯一计算路径：结果全部来自引擎 match()（提到分支前，供仪式与结果页共用）
  //
  // 未作答时不调用引擎：match-v2 对「零个已作答维度」会主动抛错（这是它的正确行为），
  // 而本组件在首页也会渲染，若无条件调用会在控制台刷「匹配失败」。
  // 这里前置判断，**不吞任何真实错误**——有作答时的异常仍然照常抛出。
  const hasAnswers = Object.keys(answers).length > 0;
  const result = hasAnswers ? runMatch(qs, ps, answers, theme) : null;
  const dims = EMPTY_DIMS; // 六维展示已由九维区块取代，这里仅保留类型占位
  // 九维坐标：独立于角色匹配的评分体系，用户自己的九个 0–100 分
  const nine = computeNine(qs, answers);

  // 隐藏角色：单独判定解锁资格，**不参与匹配排序**。
  // 数据侧该角色 matchPool=false，因此本就不会进 ranking；
  // 这里只在九维真分满足 unlock 条件时才把它作为额外结果展示出来。
  const hiddenUnlocked = ps.filter((p) => {
    const rule = (p as { unlock?: Record<string, number> }).unlock;
    if (!rule) return false;
    return checkUnlock({ id: p.id, name: p.name, unlock: rule as never }, nine.dims).unlocked;
  });
  const mainId = result?.main?.persona.id;
  const mainName = result?.main?.persona.name ?? '未匹配';

  // 比对仪式：必须在 screen 分支之前判断，否则会先命中 quiz 分支
  if (ritual) {
    const cands = ps.filter((p) => p.id !== mainId).slice(0, 24).map((p) => p.name);
    return (
      <>
        <QuizPlaceholder />
        <RitualOverlay
          candidates={cands}
          finalName={mainName}
          dims={dims}
          reduced={reducedMotion}
          onDone={() => {
            setRitual(false);
            setScreen('result');
            window.scrollTo(0, 0);
          }}
        />
      </>
    );
  }

  if (screen === 'home') {
    return (
      <HomePage
        personaCount={personas.status === 'ready' ? personas.data.length : null}
        questionCount={qs.length}
        disabled={qs.length === 0}
        onStart={() => {
          setIndex(0);
          setScreen('quiz');
        }}
      />
    );
  }

  if (screen === 'quiz') {
    return (
      <QuizPage
        questions={qs}
        index={index}
        answers={answers}
        onPick={pick}
        onPrev={() => setIndex((i) => Math.max(0, i - 1))}
        onNext={() => {
          setIndex((i) => Math.min(qs.length - 1, i + 1));
          window.scrollTo(0, 0);
        }}
        onFinish={() => {
          const direct = Boolean(readTokenFromUrl());
          if (shouldSkipRitual(direct)) {
            setScreen('result');
            window.scrollTo(0, 0);
          } else {
            setRitual(true);
          }
        }}
      />
    );
  }

  // 引擎 ScoredPersona 是扁平结构、不含档案正文；desc/placeholder 按 id 回填。
  // 约束：回填只允许补展示字段，必须在 DisplayOnlyFill 里显式声明；
  //       id/name/category/tags/percent 一律取自引擎，不取自 raw，排序不受回填影响。
  const toCard = (p: RankedPersona | null | undefined): ResultPersona | null => {
    if (!p) return null;
    const raw = ps.find((r) => r.id === p.id);
    const fill: DisplayOnlyFill = {
      desc: raw?.desc,
      placeholder: raw?.placeholder,
      imageUrl: raw?.imageUrl,
    };
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      tags: p.tags,
      percent: p.percent,
      ...fill,
    };
  };
  const top = toCard(result?.main?.persona);
  const others = [result?.secondary, result?.surprise]
    .map((p) => toCard(p?.persona))
    .filter((p): p is ResultPersona => p !== null);

  // 解锁的隐藏角色造一张卡：percent 用 100 表示「完全命中解锁条件」，
  // 并带上标记让结果页单独渲染，混进「还有几分像」列表会误导。
  const hiddenCards: ResultPersona[] = hiddenUnlocked.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    tags: p.tags,
    percent: 100,
    desc: p.desc,
    placeholder: (p as { placeholder?: boolean }).placeholder,
    imageUrl: (p as { imageUrl?: string }).imageUrl,
  }));

  return (
    <ResultPage
      top={top}
      others={others}
      dims={dims}
      nine={nine}
      hiddenUnlocked={hiddenCards}
      onRestart={restart}
      onShare={share}
      shareUrl={Object.keys(answers).length ? buildShareUrl(answers) : location.href}
      shareHint={
        !result
          ? '结果未能生成，请稍后重试。'
          : '分享出去的链接会重新比对一次档案库，档案更新后结果可能略有不同。'
      }
    />
  );
}
