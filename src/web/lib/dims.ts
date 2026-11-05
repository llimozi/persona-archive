/** 六维中文标签（与 shared/types 的 DimKey 对齐） */
export const DIM_LABEL: Record<string, string> = {
  EE: '情绪浓度',
  ST: '表达风格',
  AC: '行动力',
  HX: '复杂性',
  RB: '反叛度',
  SR: '社交半径',
};

/**
 * 每个维度「高分意味着什么」的一句话说明（仅用于结果页展示）。
 *
 * 目的：让 0–100 的数字有可读的含义，而不是一串裸分数。
 * 措辞保持中性好懂，不做心理诊断式断言。
 */
export const DIM_HIGH_MEANING: Record<string, string> = {
  EE: '情绪写在脸上，藏不住也懒得藏',
  ST: '表达欲强，话多且愿意被听见',
  AC: '想到就动手，先做再修正',
  HX: '看问题绕得远，喜欢多想一层',
  RB: '不太吃规矩那一套，爱顶一下',
  SR: '社交半径大，认识的人多且杂',
};

/** 低分侧的含义 */
export const DIM_LOW_MEANING: Record<string, string> = {
  EE: '情绪内收，很少外露',
  ST: '表达克制，更愿意先观察',
  AC: '行动前想得多，节奏偏慢',
  HX: '喜欢直接了当，绕得少',
  RB: '愿意配合规则，不主动冲突',
  SR: '社交圈小而稳，重质量',
};

/** 按分值取当前侧的说明 */
export function dimMeaning(key: string, value: number): string {
  return value >= 50 ? (DIM_HIGH_MEANING[key] ?? '') : (DIM_LOW_MEANING[key] ?? '');
}
