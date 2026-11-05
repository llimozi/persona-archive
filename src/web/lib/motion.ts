/**
 * 动效基础设施（纯 CSS + 原生 JS，不引动画库）。
 *
 * 三个关键决策：
 *  1. **只用 transform / opacity 做动画**，不碰 width/height/top/left，避免反复触发重排；
 *  2. **尊重 prefers-reduced-motion**：开启时全部降为淡入，且比对仪式直接跳过；
 *  3. **测试可关**：URL 带 `?anim=off` 或 localStorage 里 `pa.anim=off` 时，
 *     所有动画时长归零、仪式跳过——E2E 靠这个稳定，线上行为不受影响。
 */

/** 是否为「减弱动效」环境（系统设置 / 测试开关） */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    if (new URLSearchParams(location.search).get('anim') === 'off') return true;
    if (localStorage.getItem('pa.anim') === 'off') return true;
  } catch {
    /* 隐私模式忽略 */
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** 是否跳过「比对中」仪式（减弱动效或 ?r= 直达） */
export function shouldSkipRitual(hasShareToken: boolean): boolean {
  return prefersReducedMotion() || hasShareToken;
}

/** 把元素动画到目标状态；减弱动效时立即完成 */
export function raf(cb: (t: number) => void): number {
  return requestAnimationFrame(cb);
}

/**
 * 数字滚动计数：用 rAF 驱动，只在必要时改写 textContent。
 * 返回取消函数，组件卸载时调用避免泄漏。
 */
export function countUp(from: number, to: number, duration: number, onTick: (v: number) => void): () => void {
  if (duration <= 0 || from === to) {
    onTick(to);
    return () => undefined;
  }
  const start = performance.now();
  let id = 0;
  const step = (now: number) => {
    const p = Math.min(1, (now - start) / duration);
    // easeOutCubic：先快后慢，收尾有停顿感
    const eased = 1 - Math.pow(1 - p, 3);
    onTick(Math.round(from + (to - from) * eased));
    if (p < 1) id = requestAnimationFrame(step);
  };
  id = requestAnimationFrame(step);
  return () => cancelAnimationFrame(id);
}

/**
 * 设备倾斜视差：监听 deviceorientation，把角度限制在 ±RANGE 度内。
 * 不支持的设备（iOS 需授权、桌面浏览器）静默降级为无动效。
 * 返回清理函数。
 */
export function attachTilt(el: HTMLElement, range = 6): () => void {
  if (prefersReducedMotion()) return () => undefined;
  if (typeof window === 'undefined' || !window.DeviceOrientationEvent) return () => undefined;

  let rafId = 0;
  let pending: { b: number; g: number } | null = null;

  const apply = () => {
    rafId = 0;
    if (!pending) return;
    const rx = Math.max(-1, Math.min(1, pending.b / 30)) * range;
    const ry = Math.max(-1, Math.min(1, pending.g / 30)) * range;
    el.style.setProperty('--tilt-x', `${rx.toFixed(2)}deg`);
    el.style.setProperty('--tilt-y', `${ry.toFixed(2)}deg`);
    pending = null;
  };

  const onOrient = (e: DeviceOrientationEvent) => {
    if (e.beta == null || e.gamma == null) return;
    pending = { b: e.beta, g: e.gamma };
    if (!rafId) rafId = requestAnimationFrame(apply);
  };

  window.addEventListener('deviceorientation', onOrient, { passive: true });
  return () => {
    window.removeEventListener('deviceorientation', onOrient);
    if (rafId) cancelAnimationFrame(rafId);
  };
}

/** 触发一次性的 CSS 动画（加类，动画结束后移除），用于一次性反馈 */
export function pulse(el: HTMLElement | null, cls: string, ms = 600): void {
  if (!el) return;
  el.classList.remove(cls);
  // 强制回流一次让动画能重播；只读 offsetWidth，不改样式
  void el.offsetWidth;
  el.classList.add(cls);
  window.setTimeout(() => el.classList.remove(cls), ms);
}
