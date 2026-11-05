/**
 * 九维人格坐标：定义、四档文案、评分公式（纯函数，零依赖）。
 *
 * 与旧六维（EE/ST/AC/HX/RB/SR）的关系：
 *   九维是**独立的测量体系**，量表是五档（1–5），公式是
 *   score = round(((mean - 1) / 4) * 100)，
 *   与旧的「选项 effects 累加 / 分母归一到 0..1」是两套完全不同的算法。
 *
 * 本文件是九维的**唯一权威源**：坐标名、四档文案、顺序、量纲都在这里，
 * 任何展示层都从这里读，不得另行抄写一份（抄多份必然分叉）。
 */

/** 九维坐标 ID（顺序即展示顺序 01–09，不得重排） */
export const NINE_KEYS = [
  'MS', // 01 闷骚指数
  'FC', // 02 反差浓度
  'WS', // 03 猥琐浓度
  'SB', // 04 社牛装逼指数
  'CX', // 05 畜生没母指数
  'JH', // 06 嘉豪浓度
  'ZQ', // 07 嘴欠指数
  'AB', // 08 抽象浓度
  'KD', // 09 口嗨兑现率
] as const;

export type NineKey = (typeof NINE_KEYS)[number];

export interface NineDimDef {
  /** 01–09，严格展示顺序 */
  readonly order: number;
  readonly key: NineKey;
  /** 坐标名称（用户定稿，不得润色） */
  readonly name: string;
  /** 测量定义：这个维度真正测什么（给作者看，不对外展示） */
  readonly measures: string;
  /** 反向计分：answerScore = 6 - 原始分。只有明确反向的维度才为 true。 */
  readonly reverse: boolean;
  /** 四档文案，索引 0–3 分别对应 低分态 / 过渡态1 / 过渡态2 / 高分态 */
  readonly states: readonly [string, string, string, string];
}

/**
 * 九维定义表。坐标名称、四档文案、顺序**逐字取自用户定稿**，
 * 不得改写、不得调整顺序、不得替换用词。
 */
export const NINE_DIMS: readonly NineDimDef[] = [
  {
    order: 1,
    key: 'MS',
    name: '闷骚指数',
    measures: '隐藏想法、暧昧玩笑倾向、内在表达欲与外在克制程度。',
    reverse: false,
    states: ['纯情没开荤', '暗地憋骚劲', '满脑黄废料', '骚得能滴脓'],
  },
  {
    order: 2,
    key: 'FC',
    name: '反差浓度',
    measures: '一个人在不同场景、不同对象面前的行为、表达和形象差异。',
    reverse: false,
    states: ['表里都老实', '渐露两面性', '白天装纯良', '夜里浪翻天'],
  },
  {
    order: 3,
    key: 'WS',
    name: '猥琐浓度',
    measures: '容易想歪、低俗联想和擦边玩笑倾向。只测娱乐性表达倾向，不等于真实行为。',
    reverse: false,
    states: ['纯情大傻子', '眼神爱乱瞟', '看啥都想歪', '看狗都带荤'],
  },
  {
    order: 4,
    key: 'SB',
    name: '社牛装逼指数',
    measures: '社交主动性、表现欲、展示自己的意愿以及在人群中争取关注的倾向。',
    reverse: false,
    states: ['角落当透明', '敢凑小热闹', '抢镜爱表现', '装逼压全场'],
  },
  {
    order: 5,
    key: 'CX',
    name: '畜生没母指数',
    measures: '损友式整活、无伤害恶作剧、缺德玩笑和调皮捣蛋倾向。'
      + '不得把违法行为、欺凌、伤害或恶意骚扰当作高分标准。',
    reverse: false,
    states: ['老实怂包蛋', '暗地使小坏', '缺德带冒烟', '畜生都喊哥'],
  },
  {
    order: 6,
    key: 'JH',
    name: '嘉豪浓度',
    measures: '刻意耍帅、凹造型、经营酷炫人设和用力过猛的程度。不得根据真实外貌打分。',
    reverse: false,
    states: ['松弛不硬凹', '刻意耍帅范', '硬凹帅人设', '油得能煎蛋'],
  },
  {
    order: 7,
    key: 'ZQ',
    name: '嘴欠指数',
    measures: '抬杠、调侃、毒舌、接梗和快速反击的倾向。'
      + '不得把恶意辱骂、仇恨攻击或校园欺凌当作普通嘴欠。',
    reverse: false,
    states: ['说话挺正常', '抬杠不饶人', '开口就扎心', '嘴臭熏死人'],
  },
  {
    order: 8,
    key: 'AB',
    name: '抽象浓度',
    measures: '思维跳跃、奇怪联想、非传统表达和无厘头行为倾向。',
    reverse: false,
    states: ['正常普通人', '偶尔抽下风', '思路总跑偏', '脑干已失踪'],
  },
  {
    order: 9,
    key: 'KD',
    name: '口嗨兑现率',
    measures: '说过的话、做出的承诺、制定的计划与实际执行情况的一致程度。高分代表说到做到。',
    // 方向为正：得分越高说明兑现能力越强，**不得反向处理**
    reverse: false,
    states: ['张嘴就画饼', '半吹半实干', '说到就做到', '吹的全落地'],
  },
] as const;

export const NINE_DIM_BY_KEY: Readonly<Record<NineKey, NineDimDef>> = Object.freeze(
  Object.fromEntries(NINE_DIMS.map((d) => [d.key, d])) as Record<NineKey, NineDimDef>,
);

/** 五档量表文案（用户定稿） */
export const SCALE_LABELS = ['完全不像我', '不太像我', '看情况', '比较像我', '这说的就是我'] as const;

export const SCALE_MIN = 1;
export const SCALE_MAX = 5;
/** 一个维度至少需要几道有效题才算「测出来了」 */
export const MIN_QUESTIONS_PER_DIM = 2;

/** 四档状态：档位序号 + 文案 */
export interface DimLevel {
  /** 0=低分态 1=过渡态1 2=过渡态2 3=高分态 */
  readonly level: 0 | 1 | 2 | 3;
  /** 档位中文名 */
  readonly levelName: '低分态' | '过渡态1' | '过渡态2' | '高分态';
  /** 该档位的骚话文案，取自 NINE_DIMS[].states */
  readonly stateText: string;
}

const LEVEL_NAMES = ['低分态', '过渡态1', '过渡态2', '高分态'] as const;

/**
 * 分数 → 四档。
 *
 * 区间（闭区间，无重叠、无遗漏）：
 *   0–24 → 低分态      25–49 → 过渡态1
 *   50–74 → 过渡态2    75–100 → 高分态
 *
 * 实现刻意用 `<` 逐档上界判断，1224 行有专门的边界测试锁定
 * 24/25、49/50、74/75 这三对边界。
 */
export function levelOf(def: NineDimDef, score: number): DimLevel {
  const s = Math.min(100, Math.max(0, Math.round(score)));
  const level = (s <= 24 ? 0 : s <= 49 ? 1 : s <= 74 ? 2 : 3) as 0 | 1 | 2 | 3;
  return { level, levelName: LEVEL_NAMES[level], stateText: def.states[level] };
}

/**
 * 把一档原始答案换算成计分用的分数。
 * 正向：原值；反向：6 - 原值。
 */
export function toAnswerScore(raw: number, reverse: boolean): number {
  const v = Math.min(SCALE_MAX, Math.max(SCALE_MIN, raw));
  return reverse ? SCALE_MAX + SCALE_MIN - v : v;
}

/** 单维得分公式：score = round(((mean - 1) / 4) * 100)，夹在 0–100 */
export function scoreFromMean(mean: number): number {
  const s = ((mean - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;
  return Math.min(100, Math.max(0, Math.round(s)));
}

/** 单维评分结果（页面与雷达图都读这一份，保证两处数字一致） */
export interface DimScore {
  readonly dimensionId: NineKey;
  readonly dimensionName: string;
  readonly order: number;
  /** 0–100 整数 */
  readonly score: number;
  readonly level: 0 | 1 | 2 | 3;
  readonly levelName: DimLevel['levelName'];
  /** 取自四档文案，禁止临时生成 */
  readonly stateText: string;
  /** 参与计算的题数 */
  readonly answered: number;
  /** 是否有足够题目支撑这个分数（answered >= MIN_QUESTIONS_PER_DIM） */
  readonly measured: boolean;
}

/** 一个维度的作答输入：答案原始分值 + 该题是否反向 */
export interface DimAnswer {
  readonly questionId: string;
  readonly raw: number;
  readonly reverse: boolean;
}

/**
 * 计算单个维度。
 *
 * 关键约束（都有对应测试）：
 *  - 未作答的题**不参与**均值，绝不把空值当中间分 3；
 *  - answered === 0 时 score 记 0 且 measured=false，不伪造测量；
 *  - answered < MIN_QUESTIONS_PER_DIM 时 measured=false（数据不足）。
 */
export function scoreDim(def: NineDimDef, answers: readonly DimAnswer[]): DimScore {
  const valid = answers.filter((a) => Number.isFinite(a.raw) && a.raw >= SCALE_MIN && a.raw <= SCALE_MAX);
  const answered = valid.length;
  if (answered === 0) {
    return {
      dimensionId: def.key,
      dimensionName: def.name,
      order: def.order,
      score: 0,
      ...levelOf(def, 0),
      answered: 0,
      measured: false,
    };
  }
  const sum = valid.reduce((acc, a) => acc + toAnswerScore(a.raw, a.reverse), 0);
  const mean = sum / answered;
  const score = scoreFromMean(mean);
  return {
    dimensionId: def.key,
    dimensionName: def.name,
    order: def.order,
    score,
    ...levelOf(def, score),
    answered,
    measured: answered >= MIN_QUESTIONS_PER_DIM,
  };
}

/** 九维整体评分结果 */
export interface NineResult {
  readonly version: 1;
  /** 严格按 01–09 顺序 */
  readonly dims: readonly DimScore[];
  /** 全部维度已测出（每维有效题数达标） */
  readonly complete: boolean;
  /** 未测出的维度 ID */
  readonly insufficient: readonly NineKey[];
  /** 总有效作答题数（用于进度与「未完成」展示） */
  readonly answeredCount: number;
}
