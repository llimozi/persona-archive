/**
 * 共享类型与常量（前端 / 后端 / 引擎都可用，零依赖）。
 * 本文件由后端（BE）维护。前端 / 算法需要新增字段，找 BE 或在自己目录里扩展，
 * 不要各写一套同名结构。
 */

/** 六维代号 */
export type DimKey = 'EE' | 'ST' | 'AC' | 'HX' | 'RB' | 'SR';

export const DIM_KEYS: readonly DimKey[] = ['EE', 'ST', 'AC', 'HX', 'RB', 'SR'] as const;

/** 六维中文名（前端展示用，避免各端各写一份） */
export const DIM_LABELS: Readonly<Record<DimKey, string>> = {
  EE: '情绪表达',
  ST: '稳定度',
  AC: '行动力',
  HX: '反差感',
  RB: '关系边界',
  SR: '疏离度',
} as const;

/**
 * 六维分值。**量纲约定：一律 0–100 百分制**，六键必须齐全。
 *
 * ⚠️ 为什么这条必须写死在契约里：引擎内部高斯核工作在 0–1，
 * 它会用「六键齐全 + 全在 0..100 + 存在 >1 的值」来识别百分制并统一 /100。
 * 这个自动识别**只是历史数据兜底，新数据不得依赖它**——
 * 若传入 `{EE: 1}` 这种值（本意 1% 还是 0.01 的笔误无从判断），
 * 引擎会判成 0–1 制、按 1.0 处理，**静默错掉一整档，且没有任何类型错误或断言失败**。
 *
 * 因此：生产方（data、API、前端）一律按 0–100 输出；消费方不要假设是 0–1。
 * 校验脚本和测试应当直接断言六维都在 [0,100]。
 */
export type Dims = Record<DimKey, number>;

/** 六维取值的合法区间，供数据校验与测试断言复用 */
export const DIM_MIN = 0;
export const DIM_MAX = 100;

/** 判断一组 dims 是否全部落在 [0,100] */
export function isDimsInRange(d: Partial<Record<DimKey, unknown>>): boolean {
  return DIM_KEYS.every((k) => {
    const v = d[k];
    return typeof v === 'number' && Number.isFinite(v) && v >= DIM_MIN && v <= DIM_MAX;
  });
}

/** 证据等级（与全队证据口径一致） */
export type EvidenceLevel = 'VERIFIED' | 'OBSERVED' | 'INFERRED' | 'UNKNOWN' | 'BLOCKED';

/** 素材卡形态：首版一律 text，不引第三方图片 */
export type CardType = 'text' | 'image';

/**
 * 人物稀有度。四档均出自第一阶段 06：
 *  - common / rare / hidden：06:657 的 sigma 默认值表覆盖这三档
 *  - limited：06:365（意外组合抽取）与 06:633（"rarity = limited / hidden 的人物不加分"）
 *    都把 limited 当作合法档位使用；但 06:657 的默认值表里**没有**它的 sigma 建议值。
 *
 * 具体 sigma 数值**不在本文件约定**，唯一权威源是
 * `src/engine/match.ts` 的 `DEFAULT_SIGMA_BY_RARITY`，要改只改那一处。
 * 不要在 shared / 文档 / 注释里再抄一份数值——抄多份必然分叉。
 *
 * 注意：`restricted`（合规受限）**不是**稀有度，它属于 `compliance.restricted`
 * 与 `compliance.restrictedReason`，两者是不同维度，不得混用。
 */
export type Rarity = 'common' | 'rare' | 'limited' | 'hidden';

/**
 * 维度容差 σ。缺省时由引擎按 rarity 取默认值；
 * 06 §9 U-06-6 明确 sigma 统一口径「未定」，这里只是落到实现层的临时约定，
 * 不等于该问题已解决。
 */
export type SigmaMap = Partial<Record<DimKey, number>>;

/** 第三方素材受限原因 */
export type RestrictedReason = 'thirdPartyIP' | 'realPersonControversy';

/** 单个人物的合规元数据（版权 / 真人风险） */
export interface PersonaCompliance {
  /** true 表示有 IP 或真人风险，必须只做文字卡、不可商用 */
  restricted: boolean;
  restrictedReason: RestrictedReason[];
  /** 是否允许进入匹配池 */
  matchPool: boolean;
  /** 是否允许出现在结果卡 */
  resultCardEnabled: boolean;
}

/** 人物档案 */
export interface Persona {
  id: string;
  name: string;
  /** 别名 / 变体说明（可缺省） */
  alias?: string;
  category: string;
  tags: string[];
  dims: Dims;
  /** 稀有度，缺省由引擎按 common 处理；'restricted' 由引擎单独排他 */
  rarity?: Rarity;
  /** rarity 的判定依据（引用资料卡字段，便于复核，不参与计算） */
  rarityBasis?: string;
  /**
   * 维度容差 σ（可选覆盖）。缺省时由引擎按 rarity 取默认值，
   * 默认值见 `src/engine/match.ts` 的 `DEFAULT_SIGMA_BY_RARITY`，本文件不重复抄写。
   */
  sigma?: SigmaMap;
  desc: string;
  /** 素材形态，首版全为 text */
  cardType?: CardType;
  /** 占位素材标记，MVP 一律为 true，不引第三方图片 */
  placeholder?: boolean;
  /** 事实溯源：资料卡文件 + 锚点 */
  source?: string;
  /** 该条事实的证据等级 */
  evidence?: EvidenceLevel;
  /** 合规元数据 */
  compliance?: PersonaCompliance;
  /** 文案使用约束（给人看，禁止哪些写法） */
  usageNote?: string;
}

/** 题型 */
export type QuestionType = 'meme' | 'scenario' | 'forced' | 'single';

/**
 * 主题配置（06 §4.2）。归属 `data/questions.json` 顶层 `theme` 字段，
 * 由内容数据维护；引擎的 `DEFAULT_THEME_WEIGHTS` 只作兜底。
 *
 * `weights` 必须和为 1.0，引擎不静默归一。
 */
export interface ThemeConfig {
  themeId: string;
  /** 六维权重向量，设计值要求 Σ=1.0 */
  weights: Dims;
  /** 出处标注，例如 "06 §9.1" */
  source?: string;
  /** true 表示这是设计值、非实测值，对外表述要照此写 */
  isDesignValue?: boolean;
}

/** 题目选项 */
export interface QuestionOption {
  id: string;
  label: string;
  /** 选项对各维的贡献分（可为负） */
  effects: Partial<Dims>;
}

/** 题目 */
export interface Question {
  id: string;
  title: string;
  options: QuestionOption[];
  /** 题型，可缺省 */
  type?: QuestionType;
  /** 所属主题，可缺省 */
  themeId?: string;
  /** 本题覆盖的维度，可缺省 */
  dims?: DimKey[];
}

/** JSON 数据文件的加载结果 */
export interface LoadResult<T> {
  items: T[];
  /** 数据来源：file 正常读取 / empty 文件缺失 / invalid 解析失败 */
  source: 'file' | 'empty' | 'invalid';
  file: string;
  error?: string;
}

/** 列表接口统一响应外壳 */
export interface ListResponse<T> {
  items: T[];
  source: LoadResult<T>['source'];
  total: number;
  /** 部分记录被丢弃时的说明 */
  warning?: string;
}
