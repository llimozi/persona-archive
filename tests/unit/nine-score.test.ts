/**
 * 九维评分系统契约测试。
 *
 * 覆盖用户明确要求的 10 个场景，外加题库映射的完整性断言。
 */
import { describe, expect, it } from 'vitest';
import {
  MIN_QUESTIONS_PER_DIM,
  NINE_DIMS,
  NINE_KEYS,
  levelOf,
  scoreDim,
  scoreFromMean,
  toAnswerScore,
  NINE_DIM_BY_KEY,
  type NineKey,
} from '../../src/shared/nine-dims';
import { scoreNine, type NineQuestion } from '../../src/shared/nine-score';
import { QUESTION_MAP } from '../../src/shared/question-map';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** 造一个只属于某维度的最小题库：n 道题，每题 5 个选项（1–5） */
function mkQuestions(dim: NineKey, n: number, reverse = false): NineQuestion[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${dim}-q${i + 1}`,
    dimensionId: dim,
    reverse,
    optionScore: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 },
    options: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }],
  }));
}

/** 全选同一个档位 */
function pickAll(questions: NineQuestion[], opt: string): Record<string, string> {
  return Object.fromEntries(questions.map((q) => [q.id, opt]));
}

function scoreOf(res: ReturnType<typeof scoreNine>, dim: NineKey): number {
  return res.dims.find((d) => d.dimensionId === dim)!.score;
}

describe('九维定义：名称 / 四档文案 / 顺序（逐字锁定）', () => {
  it('九个维度，顺序 01–09', () => {
    expect(NINE_DIMS).toHaveLength(9);
    expect(NINE_DIMS.map((d) => d.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(NINE_DIMS.map((d) => d.key)).toEqual([...NINE_KEYS]);
  });

  it('坐标名称逐字一致', () => {
    expect(NINE_DIMS.map((d) => d.name)).toEqual([
      '闷骚指数',
      '反差浓度',
      '猥琐浓度',
      '社牛装逼指数',
      '畜生没母指数',
      '嘉豪浓度',
      '嘴欠指数',
      '抽象浓度',
      '口嗨兑现率',
    ]);
  });

  it('四档文案逐字一致，且每维 4 条', () => {
    const table = NINE_DIMS.map((d) => [...d.states]);
    expect(table).toEqual([
      ['纯情没开荤', '暗地憋骚劲', '满脑黄废料', '骚得能滴脓'],
      ['表里都老实', '渐露两面性', '白天装纯良', '夜里浪翻天'],
      ['纯情大傻子', '眼神爱乱瞟', '看啥都想歪', '看狗都带荤'],
      ['角落当透明', '敢凑小热闹', '抢镜爱表现', '装逼压全场'],
      ['老实怂包蛋', '暗地使小坏', '缺德带冒烟', '畜生都喊哥'],
      ['松弛不硬凹', '刻意耍帅范', '硬凹帅人设', '油得能煎蛋'],
      ['说话挺正常', '抬杠不饶人', '开口就扎心', '嘴臭熏死人'],
      ['正常普通人', '偶尔抽下风', '思路总跑偏', '脑干已失踪'],
      ['张嘴就画饼', '半吹半实干', '说到就做到', '吹的全落地'],
    ]);
  });

  it('九个维度都不是反向计分（含口嗨兑现率，方向为正）', () => {
    for (const d of NINE_DIMS) expect(d.reverse, d.name).toBe(false);
    expect(NINE_DIM_BY_KEY.KD.reverse, '口嗨兑现率必须正向').toBe(false);
  });
});

describe('场景 1–2：正向题全选 1 分 / 5 分', () => {
  it('全部正向题选 1 分 → 0 分', () => {
    const qs = mkQuestions('MS', 3);
    const res = scoreNine(qs, pickAll(qs, '1'));
    expect(scoreOf(res, 'MS')).toBe(0);
  });

  it('全部正向题选 5 分 → 100 分', () => {
    const qs = mkQuestions('MS', 3);
    const res = scoreNine(qs, pickAll(qs, '5'));
    expect(scoreOf(res, 'MS')).toBe(100);
  });
});

describe('场景 3–4：反向题换算', () => {
  it('反向题选 1 分 → 折算 5 分', () => {
    expect(toAnswerScore(1, true)).toBe(5);
  });

  it('反向题选 5 分 → 折算 1 分', () => {
    expect(toAnswerScore(5, true)).toBe(1);
  });

  it('反向题全选 1 分 → 100 分；全选 5 分 → 0 分', () => {
    const qs = mkQuestions('FC', 2, true);
    expect(scoreOf(scoreNine(qs, pickAll(qs, '1')), 'FC')).toBe(100);
    expect(scoreOf(scoreNine(qs, pickAll(qs, '5')), 'FC')).toBe(0);
  });
});

describe('场景 5：四档边界（24/25、49/50、74/75、0/100）', () => {
  const def = NINE_DIM_BY_KEY.MS;
  const cases: Array<[number, number, string]> = [
    [0, 0, '纯情没开荤'],
    [24, 0, '纯情没开荤'],
    [25, 1, '暗地憋骚劲'],
    [49, 1, '暗地憋骚劲'],
    [50, 2, '满脑黄废料'],
    [74, 2, '满脑黄废料'],
    [75, 3, '骚得能滴脓'],
    [100, 3, '骚得能滴脓'],
  ];
  for (const [score, level, stateText] of cases) {
    it(`${score} 分 → 档位 ${level}「${stateText}」`, () => {
      const r = levelOf(def, score);
      expect(r.level).toBe(level);
      expect(r.stateText).toBe(stateText);
    });
  }

  it('任意分数都能落到唯一档位（无重叠、无遗漏）', () => {
    for (let s = 0; s <= 100; s += 1) {
      const { level } = levelOf(def, s);
      const expected = s <= 24 ? 0 : s <= 49 ? 1 : s <= 74 ? 2 : 3;
      expect(level, `score=${s}`).toBe(expected);
    }
  });
});

describe('场景 6：九个维度分别独立计算', () => {
  it('给不同维度不同答案，互不影响', () => {
    const all: NineQuestion[] = [];
    const answers: Record<string, string> = {};
    NINE_KEYS.forEach((k, i) => {
      const qs = mkQuestions(k, 2);
      all.push(...qs);
      // 第 i 个维度选 (i%5)+1，其余不同
      const opt = String((i % 5) + 1);
      for (const q of qs) answers[q.id] = opt;
    });
    const res = scoreNine(all, answers);
    res.dims.forEach((d, i) => {
      const opt = (i % 5) + 1;
      expect(d.score, d.dimensionName).toBe(Math.round(((opt - 1) / 4) * 100));
    });
  });
});

describe('场景 7：口嗨兑现率高分的文案', () => {
  it('100 分显示「吹的全落地」', () => {
    const qs = mkQuestions('KD', 3);
    const res = scoreNine(qs, pickAll(qs, '5'));
    const kd = res.dims.find((d) => d.dimensionId === 'KD')!;
    expect(kd.score).toBe(100);
    expect(kd.stateText).toBe('吹的全落地');
    expect(kd.levelName).toBe('高分态');
  });

  it('0 分显示「张嘴就画饼」', () => {
    const qs = mkQuestions('KD', 3);
    const res = scoreNine(qs, pickAll(qs, '1'));
    const kd = res.dims.find((d) => d.dimensionId === 'KD')!;
    expect(kd.stateText).toBe('张嘴就画饼');
  });
});

describe('场景 8：未作答不得当作中间分 3', () => {
  it('只答 1 题、其余未答 → 按已答的 1 题算，不是按 3 分算', () => {
    const qs = mkQuestions('AB', 3);
    const res = scoreNine(qs, { [qs[0]!.id]: '5' }); // 只答第一题，选 5
    // 若把未答当 3 分：mean=(5+3+3)/3=3.67 → 67；真实应为 5 → 100
    expect(scoreOf(res, 'AB')).toBe(100);
    expect(res.dims.find((d) => d.dimensionId === 'AB')!.answered).toBe(1);
  });

  it('完全没答的维度 answered=0，且 measured=false', () => {
    const qs = mkQuestions('AB', 3);
    const res = scoreNine(qs, {});
    const ab = res.dims.find((d) => d.dimensionId === 'AB')!;
    expect(ab.answered).toBe(0);
    expect(ab.measured).toBe(false);
  });

  it('空字符串答案视为未作答', () => {
    const qs = mkQuestions('AB', 2);
    const res = scoreNine(qs, { [qs[0]!.id]: '' });
    expect(res.dims.find((d) => d.dimensionId === 'AB')!.answered).toBe(0);
  });
});

describe('场景 9：不足有效题数 → 数据不足', () => {
  it(`答题数 < ${MIN_QUESTIONS_PER_DIM} 时 measured=false`, () => {
    const qs = mkQuestions('ZQ', 3);
    const res = scoreNine(qs, { [qs[0]!.id]: '4' });
    const zq = res.dims.find((d) => d.dimensionId === 'ZQ')!;
    expect(zq.answered).toBe(1);
    expect(zq.measured).toBe(false);
    expect(res.complete).toBe(false);
    expect(res.insufficient).toContain('ZQ');
  });

  it(`答题数 >= ${MIN_QUESTIONS_PER_DIM} 时 measured=true`, () => {
    const qs = mkQuestions('ZQ', 2);
    const res = scoreNine(qs, pickAll(qs, '3'));
    expect(res.dims.find((d) => d.dimensionId === 'ZQ')!.measured).toBe(true);
  });

  it('全部维度都答够 → complete=true', () => {
    const all: NineQuestion[] = [];
    const answers: Record<string, string> = {};
    for (const k of NINE_KEYS) {
      const qs = mkQuestions(k, MIN_QUESTIONS_PER_DIM);
      all.push(...qs);
      Object.assign(answers, pickAll(qs, '3'));
    }
    const res = scoreNine(all, answers);
    expect(res.complete).toBe(true);
    expect(res.insufficient).toEqual([]);
  });
});

describe('评分公式：score = round(((mean-1)/4)*100)', () => {
  it('均值 3 → 50 分', () => {
    const qs = mkQuestions('SB', 2);
    expect(scoreOf(scoreNine(qs, pickAll(qs, '3')), 'SB')).toBe(50);
  });
  it('均值 2 → 25 分', () => {
    expect(scoreFromMean(2)).toBe(25);
  });
  it('均值 4 → 75 分', () => {
    expect(scoreFromMean(4)).toBe(75);
  });
  it('均值 1.5 → 13 分（四舍五入）', () => {
    expect(scoreFromMean(1.5)).toBe(13);
  });
  it('结果夹在 0–100', () => {
    expect(scoreFromMean(0)).toBe(0);
    expect(scoreFromMean(6)).toBe(100);
  });
});

describe('维度结果字段完整性', () => {
  it('每维同时保存 dimensionId / dimensionName / score / level / stateText', () => {
    const qs = mkQuestions('JH', 2);
    const r = scoreDim(NINE_DIM_BY_KEY.JH, [
      { questionId: qs[0]!.id, raw: 4, reverse: false },
      { questionId: qs[1]!.id, raw: 4, reverse: false },
    ]);
    expect(r.dimensionId).toBe('JH');
    expect(r.dimensionName).toBe('嘉豪浓度');
    expect(r.score).toBe(75);
    expect(r.level).toBe(3);
    expect(r.stateText).toBe('油得能煎蛋');
  });
});

describe('题库映射：25 题完整归属 + 每维至少 2 题', () => {
  const root = resolve(__dirname, '../..');
  const bank = JSON.parse(readFileSync(resolve(root, 'data/questions.json'), 'utf8')) as {
    questions: Array<{ id: string; dimensionId: string; reverse: boolean; optionScore: Record<string, number> }>;
  };

  it('映射表覆盖题库每一道题', () => {
    const mapped = new Set(QUESTION_MAP.map((m) => m.questionId));
    for (const q of bank.questions) expect(mapped.has(q.id), q.id).toBe(true);
  });

  it('题库与映射表的维度/方向/分值完全一致', () => {
    for (const m of QUESTION_MAP) {
      const q = bank.questions.find((x) => x.id === m.questionId)!;
      expect(q.dimensionId, m.questionId).toBe(m.dimensionId);
      expect(q.reverse, m.questionId).toBe(m.reverse);
      expect(q.optionScore, m.questionId).toEqual(m.optionScore);
    }
  });

  it('每个维度至少 2 道有效题', () => {
    for (const k of NINE_KEYS) {
      const n = bank.questions.filter((q) => q.dimensionId === k).length;
      expect(n, NINE_DIM_BY_KEY[k].name).toBeGreaterThanOrEqual(MIN_QUESTIONS_PER_DIM);
    }
  });

  it('每道题只归一个维度（无重复计数）', () => {
    const ids = QUESTION_MAP.map((m) => m.questionId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('选项分值全部落在 1–5', () => {
    for (const q of bank.questions) {
      for (const v of Object.values(q.optionScore)) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(5);
      }
    }
  });
});
