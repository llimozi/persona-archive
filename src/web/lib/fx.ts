/**
 * 按需加载的重型特效（GSAP / canvas-confetti）。
 *
 * 为什么动态 import：
 *   这两个库只在「揭晓仪式」「彩蛋」等少数时刻用到，
 *   不该压进首屏包。Vite 会把它们切成独立 chunk，用到才下载。
 *
 * 失败兜底：任何加载失败都返回 null，调用方跳过特效继续走流程，
 * 绝不因为一个装饰性依赖把主流程卡死。
 */

/** gsap 的实例类型（含 fromTo / to / timeline 等） */
type GsapInstance = {
  fromTo: (
    target: unknown,
    from: Record<string, unknown>,
    to: Record<string, unknown>,
  ) => unknown;
};
type GsapModule = GsapInstance;

let gsapPromise: Promise<GsapModule | null> | null = null;

/** 懒加载 GSAP（只取核心，不引插件） */
export function loadGsap(): Promise<GsapModule | null> {
  if (!gsapPromise) {
    gsapPromise = import('gsap')
      .then((m) => {
        const mod = m as unknown as { gsap?: GsapModule; default?: GsapModule };
        return mod.gsap ?? mod.default ?? null;
      })
      .catch(() => null);
  }
  return gsapPromise;
}

type ConfettiFn = (opts?: Record<string, unknown>) => void;
let confettiPromise: Promise<ConfettiFn | null> | null = null;

/** 懒加载 canvas-confetti */
export function loadConfetti(): Promise<ConfettiFn | null> {
  if (!confettiPromise) {
    confettiPromise = import('canvas-confetti')
      .then((m) => ((m as { default?: ConfettiFn }).default ?? (m as unknown as ConfettiFn)))
      .catch(() => null);
  }
  return confettiPromise;
}

/** 朱红 / 暗金色纸屑（与全站配色一致，不用默认彩虹色） */
export const CONFETTI_COLORS = ['#b23a2e', '#9a7b3f', '#dfd3b8', '#1c1a17'];

/**
 * 揭晓彩蛋：朱红纸屑。减弱动效时直接跳过。
 * 数量克制（低端机友好），只从画面顶部两侧落下。
 */
export async function celebrate(reduced: boolean): Promise<void> {
  if (reduced) return;
  const confetti = await loadConfetti();
  if (!confetti) return;
  try {
    confetti({
      particleCount: 46,
      spread: 62,
      startVelocity: 32,
      gravity: 0.9,
      ticks: 150,
      scalar: 0.85,
      origin: { x: 0.5, y: 0.35 },
      colors: CONFETTI_COLORS,
      disableForReducedMotion: true,
    });
  } catch {
    /* 纯装饰，失败静默 */
  }
}
