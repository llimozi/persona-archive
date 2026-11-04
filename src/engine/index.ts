/**
 * 六维匹配引擎对外出口。
 *
 * 使用方：
 *   - src/api 调 `match()` 出结果（纯函数，可放进路由 handler 里同步执行）
 *   - src/web 调 `match()` 出结果，**只消费 MatchResult，不得自行再算一遍**
 *   - tests 用 `match()` + `example/` 下的固定输入做回归与手工复算
 *
 * ⚠️ 「前端不得自行算分」这条是**测试保证的，不是注释保证的**（主控 2026-11-05 裁定）：
 *   能执行的规则是测试；注释拦不住事故——曾经就有前端自造 normalizeDims 把六维
 *   压平到 50 附近的事故，本注释一句都没拦住。真正的守卫是
 *   `tests/**` 里「结果页六维 === 引擎 user.x*100」这条断言。
 *
 * ⚠️ 全部阈值均为 06/05 的**设计值**，不是实测值；百分比是**娱乐匹配度**不是心理测量。
 */

export {
  ENGINE_VERSION,
  DEFAULT_CONFIG,
  DEFAULT_SIGMA_BY_RARITY,
  DEFAULT_THEME_WEIGHTS,
  match,
  scoreAnswers,
  formatPercent,
} from './match.js';

export type {
  DimKey,
  DimScore,
  UserVector,
  EngineQuestion,
  EngineOption,
  EngineAnswer,
  EnginePersona,
  PersonaRelation,
  EngineTheme,
  HiddenRule,
  UserTagRule,
  MatchConfig,
  MatchInput,
  MatchResult,
  MatchPick,
  ScoredPersona,
  DimContribution,
  QuestionAttribution,
  Explanation,
  MatchWarning,
  PercentDisplay,
} from './types.js';

export { DIM_KEYS, DIM_LABELS } from './types.js';

export { parseExpression, evaluateExpression, evalCondition, wildcardMatch } from './expression.js';
