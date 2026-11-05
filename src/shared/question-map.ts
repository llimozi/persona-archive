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
    optionScore: {A: 4, B: 5, C: 2, D: 1.5},
    summary: '刷到新梗看三十遍，天亮时怎么做',
    rationale: '核心是「对一个梗的沉迷与再创作强度」，即抽象浓度的典型表现；不是社交主动性（虽含转发），故选 AB。',
  },
  {
    questionId: 'q-gen-002',
    dimensionId: 'FC',
    reverse: false,
    optionScore: {A: 4.33, B: 1, C: 5, D: 3},
    summary: '群里发语音没人回，你怎么收场',
    rationale: '测的是「公开场合的体面」与「私下的真实反应」是否分化：补一句嘴硬、直接问、当场撤，相差在表里是否一致。归 FC。',
  },
  {
    questionId: 'q-gen-003',
    dimensionId: 'SB',
    reverse: false,
    optionScore: {A: 5, B: 2, C: 1.5, D: 4.5},
    summary: '被拉进五百人群要做自我介绍',
    rationale: '直接测陌生人多人在场时的表现欲与控场欲，是社牛装逼指数最典型的情境。',
  },
  {
    questionId: 'q-gen-004',
    dimensionId: 'KD',
    reverse: false,
    optionScore: {A: 5, B: 1},
    summary: '二选一：说话算数但不熟，vs 嘴上没实话但真来',
    rationale: '「说话算数」正对应兑现率。选项 A（说到做到）记高分，B（口头承诺与实际不一致）记低分，方向为正。',
  },
  {
    questionId: 'q-gen-005',
    dimensionId: 'MS',
    reverse: false,
    optionScore: {A: 1, B: 3, C: 5, D: 4},
    summary: '朋友要改你定好的周末计划',
    rationale: '测的是心里是否有一套不愿明说的坚持：C「我有条线」是内里笃定但不解释，D 是暗地记一笔，均属闷骚式内在表达。',
  },
  {
    questionId: 'q-gen-006',
    dimensionId: 'KD',
    reverse: true,
    optionScore: {A: 3.29, B: 5, C: 4.43, D: 1},
    summary: '一个念头刚冒出来你怎么处理',
    rationale: '**反向题**。原题衡量「计划与执行的一致性」：D「想起来的都不算数」是典型画饼（计划落空），应得低分；'
      + 'A/B/C 都付诸执行。该题刻度写成「执行力」轴，故对 D 记 1、对 B 记 4.5。',
  },
  {
    questionId: 'q-gen-007',
    dimensionId: 'FC',
    reverse: false,
    optionScore: {A: 5, B: 3.67, C: 1, D: 3},
    summary: '方案被公开否定，你当下怎么反应',
    rationale: '测「表面反应」与「真实情绪」的分离度：A 当场就顶（表里一致）、C 脸上没表情回去才发作（分离最大），故 C 记最低。',
  },
  {
    questionId: 'q-gen-008',
    dimensionId: 'AB',
    reverse: false,
    optionScore: {A: 3, B: 5, C: 2, D: 1},
    summary: '说了个自认为很妙的梗，全场沉默',
    rationale: '沉默后仍继续加码（B 找更冷的接上去）是典型的「思路跑偏且自得其乐」，属抽象浓度的强信号。',
  },
  {
    questionId: 'q-gen-009',
    dimensionId: 'KD',
    reverse: false,
    optionScore: {A: 1, B: 5},
    summary: '二选一：被记住「一直在」，vs「从没让人失望过」',
    rationale: '「从来没让人失望过」是承诺兑现的自我期待，记高分；「一直都在」偏陪伴而非兑现，记中高。方向为正。',
  },
  {
    questionId: 'q-gen-010',
    dimensionId: 'KD',
    reverse: false,
    optionScore: {A: 5, B: 4.43, C: 3.29, D: 1},
    summary: '已经放弃的事被叫回去救场',
    rationale: '被叫回去就接下并当场拿下（A）是兑现能力的正面样本；D 明确不接，记低。方向为正。',
  },
  {
    questionId: 'q-gen-011',
    dimensionId: 'ZQ',
    reverse: false,
    optionScore: {A: 5, B: 2.33, C: 3.67, D: 1},
    summary: '开会发现领导方案有漏洞，全场没人吭声',
    rationale: '当场举手把问题摆到桌面（A）是最直接的「开口扎心」，D 完全不说记最低。归嘴欠而非社牛，因为核心是「敢不敢说难听的真话」。',
  },
  {
    questionId: 'q-gen-012',
    dimensionId: 'FC',
    reverse: false,
    optionScore: {A: 2.33, B: 4.33, C: 5, D: 1},
    summary: '别人发的梗你没懂，怎么回',
    rationale: '测「懂与不懂之间的表面处理」：A 装懂是表里分离，D 已读不回是回避。归 FC（表里一致性）。',
  },
  {
    questionId: 'q-gen-013',
    dimensionId: 'ZQ',
    reverse: false,
    optionScore: {A: 5, B: 1, C: 2.33, D: 3.67},
    summary: '看到一条明显不实但传得很广的消息',
    rationale: '直接发评论指出问题（A）是公开纠错，属嘴欠的正面表达；「心里有数就行」（B）最低。',
  },
  {
    questionId: 'q-gen-014',
    dimensionId: 'MS',
    reverse: false,
    optionScore: {A: 1, B: 5},
    summary: '二选一：更怕「说了一堆没留下」vs「憋了一堆没说」',
    rationale: '刻度直接写成「想说而不敢说」的强度：怕「憋了一堆话没说」（B）记 4.5，怕「说了没用」（A）记 1。'
      + '**这道题不标反向**——optionScore 已经按闷骚方向编码，再标 reverse 会翻两次，'
      + '把 B（更闷骚）算成 1.5，方向整个反掉（曾因此导致闷骚最高只能到 59 分）。',
  },
  {
    questionId: 'q-gen-015',
    dimensionId: 'SB',
    reverse: false,
    optionScore: {A: 5, B: 2.71, C: 1, D: 3.29},
    summary: '被拉进插不上话的饭局',
    rationale: '把话题带到自己熟的地方（A）是主动争取关注，低头吃饭等散场（C）是最低。归 SB。',
  },
  {
    questionId: 'q-gen-016',
    dimensionId: 'JH',
    reverse: false,
    optionScore: {A: 5, B: 1.5, C: 1, D: 2.5},
    summary: '有人当众夸你夸得有点过',
    rationale: '被夸时顺势接住再自夸一句（A）正是「经营酷炫人设、用力过猛」；赶紧摆手（B/C）最低。严禁按外貌打分，故只看回应方式。',
  },
  {
    questionId: 'q-gen-017',
    dimensionId: 'KD',
    reverse: false,
    optionScore: {A: 5, B: 5, C: 3, D: 1},
    summary: '合作的人第三次说「明天一定」',
    rationale: '面对拖延给出的处理方式反映你对「说到做到」的执行标准：把话挑明或自己补上（A/B）记高，算了但心里降级（D）最低。',
  },
  {
    questionId: 'q-gen-018',
    dimensionId: 'MS',
    reverse: false,
    optionScore: {A: 5, B: 1, C: 3, D: 2},
    summary: '花两小时做的梗图零点赞',
    rationale: '精心做的内容没人理，你怎么消化——删了改天再战（A）说明内里那股劲藏不住；留着「本来也是做给自己看的」（B）是最不闷骚的解释方式。',
  },
  {
    questionId: 'q-gen-019',
    dimensionId: 'ZQ',
    reverse: false,
    optionScore: {A: 5, B: 2, C: 1, D: 3},
    summary: '不太熟的人公开说了句冒犯你的话',
    rationale: '当场回一句（A）是嘴欠最典型的即时反击；先反思是不是误会（C）最低。',
  },
  {
    questionId: 'q-gen-020',
    dimensionId: 'CX',
    reverse: false,
    optionScore: {A: 5, B: 3, C: 1, D: 4},
    summary: '团队没人愿意干的麻烦事落到你头上',
    rationale: '用「接了之后怎么闹」来测缺德式整活的苗头：C 当众甩一句「为什么又是我们组」偏挑事但仍属正常抱怨。'
      + '本题在畜生没母轴上信息量偏弱，故分差收敛在 2–4，不制造极端值。',
  },
  {
    questionId: 'q-gen-021',
    dimensionId: 'JH',
    reverse: false,
    optionScore: {A: 2.33, B: 1, C: 3, D: 5},
    summary: '发现自己一直相信的小事其实是错的',
    rationale: '有点不服先找证据反驳（D）是「硬凹」：不肯承认、要把场子找回来；马上改口还讲给别人听（A）最松弛。归 JH 的「凹人设/用力过猛」侧。',
  },
  {
    questionId: 'q-gen-022',
    dimensionId: 'ZQ',
    reverse: false,
    optionScore: {A: 5, B: 2.5, C: 3.5, D: 2},
    summary: '深夜刷到把你看气的内容',
    rationale: '直接下场对线写到对方没词（A）是嘴欠的极端样本；截图存着先想清楚（D）最低。',
  },
  {
    questionId: 'q-gen-023',
    dimensionId: 'MS',
    reverse: false,
    optionScore: {A: 1, B: 5},
    summary: '二选一：说真话的自由 vs 被接纳的位置',
    rationale: '愿意为「被接纳」而少说两句（B）正是把话憋回去的内在克制，闷骚轴高分；宁可说真话没人认同（A）最低。',
  },
  {
    questionId: 'q-gen-024',
    dimensionId: 'ZQ',
    reverse: false,
    optionScore: {A: 3.86, B: 4.43, C: 1, D: 5},
    summary: '有人每次都能把天聊死',
    rationale: '顺着接梗（B）、直接把话挑明「你这聊法有点难接」（D）都是嘴欠的体现；尽量少接触（C）最低。',
  },
  {
    questionId: 'q-gen-025',
    dimensionId: 'AB',
    reverse: false,
    optionScore: {A: 3.67, B: 1.67, C: 1, D: 5},
    summary: '完全陌生领域、只有十分钟要做决定',
    rationale: '拖到最后一刻靠直觉（D）是典型的「不按常理出牌」；问懂行的人（C）最常规。归 AB（非传统行为倾向）。',
  },

  // ── 以下 4 题为九维缺口补充（旧六维体系里没有「猥琐浓度」这个测量对象）──
  {
    questionId: 'q-gen-026',
    dimensionId: 'WS',
    reverse: false,
    optionScore: {A: 5, B: 3.29, C: 1, D: 2.14},
    summary: '朋友发来一张模棱两可的图，你第一眼盯住什么',
    rationale: '直接测「容易想歪」的第一反应：先找能想歪的细节（A）最高，根本没往那想（D）最低。归 WS。',
  },
  {
    questionId: 'q-gen-027',
    dimensionId: 'WS',
    reverse: false,
    optionScore: {A: 5, B: 3.5, C: 1.5, D: 2.5},
    summary: '饭桌上有人开了个擦边玩笑，你怎么接',
    rationale: '测在公开场合接擦边玩笑的意愿：顺着往下接还能再抬一档（A）最高，低头夹菜（C）最低。归 WS。',
  },
  {
    questionId: 'q-gen-028',
    dimensionId: 'WS',
    reverse: false,
    optionScore: {A: 5, B: 3.29, C: 2.14, D: 1},
    summary: '脑子里那些不太正经的念头通常怎么处理',
    rationale: '测低俗联想的存在与表达倾向：三天内一定说出去（A）最高，很少有（D）最低。归 WS。',
  },
  {
    questionId: 'q-gen-029',
    dimensionId: 'CX',
    reverse: false,
    optionScore: {A: 5, B: 3.5, C: 1.5, D: 2.5},
    summary: '同事椅子被人挪歪了，大家都看见了',
    rationale: '测无伤害恶作剧的参与意愿：顺手再推远一点（A）最高，帮他挪回来（C）最低。'
      + '这是「缺德式整活」，不涉及伤害他人，符合维度定义里不得把欺凌当高分的约束。',
  },
];

export const QUESTION_MAP_BY_ID: Readonly<Record<string, QuestionMapping>> = Object.freeze(
  Object.fromEntries(QUESTION_MAP.map((m) => [m.questionId, m])),
);

/** 某维度下的题目映射 */
export function mappingsFor(dimensionId: NineKey): QuestionMapping[] {
  return QUESTION_MAP.filter((m) => m.dimensionId === dimensionId);
}
