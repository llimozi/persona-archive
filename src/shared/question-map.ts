/**
 * 题目 → 九维映射层（question-v2）。
 *
 * 这里只做一件事：把现有 25 道题的选项，翻译成九维的「五档原始分 1–5 + 方向」。
 *
 * 为什么需要这一层：现有题目是**四选一情境题**，不是五档量表。
 * 用户要求「如果当前项目采用其他答案选项，先分析现有结构，再建立明确的数值映射，
 * 不要破坏现有交互」，所以保留四选一交互，在数据侧给出每题一个唯一的线性刻度：
 *
 *   optionScore: 该选项在这道题刻度上的位置，1–5
 *   reverse:     该题是否反向计分（answerScore = 6 - 原始分）
 *
 * 设计约束：
 *  - 每题只归属**一个**维度（避免重复计算）；
 *  - 选项分值必须由「这个选项在这方面到底有多明显」决定，不按 ABCD 位置排序；
 *  - 同一道题的 4 个选项在各题之间允许不等间隔，但必须单调、可解释。
 */

import type { NineKey } from './nine-dims.js';

export interface QuestionMapping {
  readonly questionId: string;
  readonly dimensionId: NineKey;
  /** 反向计分：answerScore = 6 - 原始分 */
  readonly reverse: boolean;
  /** optionId → 该选项的原始分（1–5）。允许小数，表示档位之间的细微差别。 */
  readonly optionScore: Readonly<Record<string, number>>;
  /** 题目摘要（报告与审查用） */
  readonly summary: string;
  /** 为什么归到这个维度（报告用，防止拍脑袋分配） */
  readonly rationale: string;
}

/**
 * 25 道题到九维的归属。
 *
 * 逐题读过题目与全部选项后确定。每维有效题数见 DIM_QUESTION_COUNT 的注释。
 */
export const QUESTION_MAP: readonly QuestionMapping[] = [
  {
    questionId: 'q-gen-001',
    dimensionId: 'AB',
    reverse: false,
    optionScore: { A: 5, B: 4, C: 2, D: 1 },
    summary: "刷到一个新梗，你一晚上看了三十遍。第二天你脑子里：",
    rationale: "归入抽象浓度；选项分值为该情境下的 AB 强度。",
  },
  {
    questionId: 'q-gen-002',
    dimensionId: 'FC',
    reverse: false,
    optionScore: { D: 5, A: 4, B: 2.5, C: 1 },
    summary: "你在群里发了一段自己觉得巨好笑的语音，三分钟没人回。",
    rationale: "归入反差浓度；选项分值为该情境下的 FC 强度。",
  },
  {
    questionId: 'q-gen-003',
    dimensionId: 'SB',
    reverse: false,
    optionScore: { A: 5, B: 2, C: 1.5, D: 4.5 },
    summary: "临时被拉进一个五百人的陌生群，要你做自我介绍。",
    rationale: "归入社牛装逼指数；选项分值为该情境下的 SB 强度。",
  },
  {
    questionId: 'q-gen-004',
    dimensionId: 'KD',
    reverse: false,
    optionScore: { A: 5, B: 1 },
    summary: "二选一：你更受不了哪种人？",
    rationale: "归入口嗨兑现率；选项分值为该情境下的 KD 强度。",
  },
  {
    questionId: 'q-gen-005',
    dimensionId: 'MS',
    reverse: false,
    optionScore: { A: 1, B: 3, C: 5, D: 4 },
    summary: "朋友临时想改你早就定好的周末计划，你：",
    rationale: "归入闷骚指数；选项分值为该情境下的 MS 强度。",
  },
  {
    questionId: 'q-gen-006',
    dimensionId: 'FC',
    reverse: false,
    optionScore: { A: 5, B: 3.5, C: 1.5, D: 2.5 },
    summary: "同一件事，你在熟人面前和在不熟的人面前，说法一样吗？",
    rationale: "归入反差浓度；选项分值为该情境下的 FC 强度。",
  },
  {
    questionId: 'q-gen-007',
    dimensionId: 'FC',
    reverse: false,
    optionScore: { A: 3.5, B: 2.5, C: 5, D: 2 },
    summary: "有人在公开场合委婉地否了你的方案。你当下：",
    rationale: "归入反差浓度；选项分值为该情境下的 FC 强度。",
  },
  {
    questionId: 'q-gen-008',
    dimensionId: 'AB',
    reverse: false,
    optionScore: { A: 3, B: 5, C: 2, D: 1 },
    summary: "你说了一个自己觉得很妙的梗，全场沉默。",
    rationale: "归入抽象浓度；选项分值为该情境下的 AB 强度。",
  },
  {
    questionId: 'q-gen-009',
    dimensionId: 'JH',
    reverse: false,
    optionScore: { A: 5, B: 3.5, C: 1, D: 2.5 },
    summary: "新同事入职第一天，你要带他熟悉环境。你：",
    rationale: "归入嘉豪浓度；选项分值为该情境下的 JH 强度。",
  },
  {
    questionId: 'q-gen-010',
    dimensionId: 'KD',
    reverse: false,
    optionScore: { A: 5, B: 4.43, C: 3.29, D: 1 },
    summary: "一件事你其实已经放弃了，又被人叫回去救场。",
    rationale: "归入口嗨兑现率；选项分值为该情境下的 KD 强度。",
  },
  {
    questionId: 'q-gen-011',
    dimensionId: 'ZQ',
    reverse: false,
    optionScore: { A: 5, B: 2.33, C: 3.67, D: 1 },
    summary: "开会时你发现领导的方案有个明显漏洞，全场没人吭声。你：",
    rationale: "归入嘴欠指数；选项分值为该情境下的 ZQ 强度。",
  },
  {
    questionId: 'q-gen-012',
    dimensionId: 'FC',
    reverse: false,
    optionScore: { A: 5, D: 4.5, B: 3, C: 1 },
    summary: "朋友转给你一个「只有懂的人才懂」的梗，你其实没懂。你：",
    rationale: "归入反差浓度；选项分值为该情境下的 FC 强度。",
  },
  {
    questionId: 'q-gen-013',
    dimensionId: 'ZQ',
    reverse: false,
    optionScore: { A: 5, B: 1, C: 2.33, D: 3.67 },
    summary: "看到一条明显不实但传得很广的消息。你：",
    rationale: "归入嘴欠指数；选项分值为该情境下的 ZQ 强度。",
  },
  {
    questionId: 'q-gen-014',
    dimensionId: 'MS',
    reverse: false,
    optionScore: { A: 1, B: 5 },
    summary: "二选一：你更怕哪一种自己？",
    rationale: "归入闷骚指数；选项分值为该情境下的 MS 强度。",
  },
  {
    questionId: 'q-gen-015',
    dimensionId: 'SB',
    reverse: false,
    optionScore: { A: 5, B: 2.71, C: 1, D: 3.29 },
    summary: "你被拉进一个话题完全插不上嘴的饭局。你：",
    rationale: "归入社牛装逼指数；选项分值为该情境下的 SB 强度。",
  },
  {
    questionId: 'q-gen-016',
    dimensionId: 'JH',
    reverse: false,
    optionScore: { A: 5, B: 1.5, C: 1, D: 2.5 },
    summary: "有人当着大家的面夸你，夸得有点过。你：",
    rationale: "归入嘉豪浓度；选项分值为该情境下的 JH 强度。",
  },
  {
    questionId: 'q-gen-017',
    dimensionId: 'KD',
    reverse: false,
    optionScore: { A: 4, B: 5, C: 3, D: 1 },
    summary: "一个合作的人反复拖延，第三次跟你说「明天一定」。你：",
    rationale: "归入口嗨兑现率；选项分值为该情境下的 KD 强度。",
  },
  {
    questionId: 'q-gen-018',
    dimensionId: 'MS',
    reverse: false,
    optionScore: { A: 5, B: 1, C: 3, D: 2 },
    summary: "你花两小时做的梗图/段子，发出去零点赞。你：",
    rationale: "归入闷骚指数；选项分值为该情境下的 MS 强度。",
  },
  {
    questionId: 'q-gen-019',
    dimensionId: 'ZQ',
    reverse: false,
    optionScore: { A: 5, B: 2, C: 1, D: 3 },
    summary: "一个你不太熟的人公开说了句冒犯你的话。你：",
    rationale: "归入嘴欠指数；选项分值为该情境下的 ZQ 强度。",
  },
  {
    questionId: 'q-gen-020',
    dimensionId: 'CX',
    reverse: false,
    optionScore: { A: 5, B: 3.5, C: 1, D: 2 },
    summary: "群里有人发了张同事睡着流口水的抓拍。你：",
    rationale: "归入畜生没母指数；选项分值为该情境下的 CX 强度。",
  },
  {
    questionId: 'q-gen-021',
    dimensionId: 'JH',
    reverse: false,
    optionScore: { A: 5, B: 3.5, C: 1, D: 2.5 },
    summary: "聚会合照出来了，你发现自己那张拍得有点糊。你：",
    rationale: "归入嘉豪浓度；选项分值为该情境下的 JH 强度。",
  },
  {
    questionId: 'q-gen-022',
    dimensionId: 'ZQ',
    reverse: false,
    optionScore: { A: 5, B: 2, C: 3.5, D: 1.5 },
    summary: "深夜刷到一条把你气到的内容。你：",
    rationale: "归入嘴欠指数；选项分值为该情境下的 ZQ 强度。",
  },
  {
    questionId: 'q-gen-023',
    dimensionId: 'MS',
    reverse: false,
    optionScore: { A: 1, B: 5 },
    summary: "二选一：如果只能保留一个，你选：",
    rationale: "归入闷骚指数；选项分值为该情境下的 MS 强度。",
  },
  {
    questionId: 'q-gen-024',
    dimensionId: 'AB',
    reverse: false,
    optionScore: { A: 5, B: 3.5, C: 1.5, D: 2.5 },
    summary: "有人跟你说了一句完全不着边际、毫无逻辑的话。你：",
    rationale: "归入抽象浓度；选项分值为该情境下的 AB 强度。",
  },
  {
    questionId: 'q-gen-025',
    dimensionId: 'AB',
    reverse: false,
    optionScore: { A: 3.67, B: 1.67, C: 1, D: 5 },
    summary: "你要在一个完全陌生的领域做决定，只有 10 分钟。你：",
    rationale: "归入抽象浓度；选项分值为该情境下的 AB 强度。",
  },
  {
    questionId: 'q-gen-026',
    dimensionId: 'WS',
    reverse: false,
    optionScore: { A: 5, B: 3.29, C: 1, D: 2.14 },
    summary: "朋友发来一张模棱两可的图，你第一眼盯住的是：",
    rationale: "归入猥琐浓度；选项分值为该情境下的 WS 强度。",
  },
  {
    questionId: 'q-gen-027',
    dimensionId: 'WS',
    reverse: false,
    optionScore: { A: 5, B: 3.5, C: 1.5, D: 2.5 },
    summary: "一群人吃饭，有人开了个擦边的玩笑。你：",
    rationale: "归入猥琐浓度；选项分值为该情境下的 WS 强度。",
  },
  {
    questionId: 'q-gen-028',
    dimensionId: 'WS',
    reverse: false,
    optionScore: { A: 5, B: 3.5, C: 2, D: 1 },
    summary: "看到一件日常小事，你脑子里最先冒出来的画面是：",
    rationale: "归入猥琐浓度；选项分值为该情境下的 WS 强度。",
  },
  {
    questionId: 'q-gen-029',
    dimensionId: 'CX',
    reverse: false,
    optionScore: { A: 5, B: 3.5, C: 1.5, D: 2.5 },
    summary: "同事的椅子被人悄悄挪歪了，大家都看见了。你：",
    rationale: "归入畜生没母指数；选项分值为该情境下的 CX 强度。",
  },
  {
    questionId: 'q-gen-030',
    dimensionId: 'SB',
    reverse: false,
    optionScore: { A: 5, B: 3.5, C: 1.5, D: 2.5 },
    summary: "电梯里遇到一个只见过两面的人，还要一起待 18 层。你：",
    rationale: "归入社牛装逼指数；选项分值为该情境下的 SB 强度。",
  },
  {
    questionId: 'q-gen-031',
    dimensionId: 'SB',
    reverse: false,
    optionScore: { A: 5, B: 3.5, C: 1, D: 2.5 },
    summary: "年会抽奖抽到你上台表演，台下三百人。你：",
    rationale: "归入社牛装逼指数；选项分值为该情境下的 SB 强度。",
  },
  {
    questionId: 'q-gen-032',
    dimensionId: 'CX',
    reverse: false,
    optionScore: { A: 5, B: 3.5, C: 1, D: 2.5 },
    summary: "室友说好今晚回来，你正好在家无聊。你会：",
    rationale: "归入畜生没母指数；选项分值为该情境下的 CX 强度。",
  },
  {
    questionId: 'q-gen-033',
    dimensionId: 'CX',
    reverse: false,
    optionScore: { A: 5, B: 3.5, C: 1.5, D: 2.5 },
    summary: "朋友新剪了头发，问你好不好看。其实很像锅盖。你：",
    rationale: "归入畜生没母指数；选项分值为该情境下的 CX 强度。",
  },
  {
    questionId: 'q-gen-034',
    dimensionId: 'JH',
    reverse: false,
    optionScore: { A: 5, B: 3.5, C: 1, D: 2.5 },
    summary: "你刚在朋友圈发了一张精修三小时的自拍，第一条评论是「这修过吧」。你：",
    rationale: "归入嘉豪浓度；选项分值为该情境下的 JH 强度。",
  },
  {
    questionId: 'q-gen-036',
    dimensionId: 'KD',
    reverse: true,
    optionScore: { A: 3, B: 2, C: 5, D: 1 },
    summary: "年初立的「今年一定瘦十斤」，现在 12 月了。你：",
    rationale: "归入口嗨兑现率（反向计分）；选项分值为该情境下的 KD 强度。",
  },
  {
    questionId: 'q-gen-037',
    dimensionId: 'WS',
    reverse: false,
    optionScore: { A: 5, B: 3.5, C: 2, D: 1 },
    summary: "一句本身很正常的话，你有没有本事把它听出别的意思？",
    rationale: "归入猥琐浓度；选项分值为该情境下的 WS 强度。",
  },
];

export const QUESTION_MAP_BY_ID: Readonly<Record<string, QuestionMapping>> = Object.freeze(
  Object.fromEntries(QUESTION_MAP.map((m) => [m.questionId, m])),
);

/** 某维度下的题目映射 */
export function mappingsFor(dimensionId: NineKey): QuestionMapping[] {
  return QUESTION_MAP.filter((m) => m.dimensionId === dimensionId);
}
