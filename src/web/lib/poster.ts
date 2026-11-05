/**
 * 结果海报：**结果页那张档案卡的竖版（9:16）**。
 *
 * 设计原则（2026-11-05 视觉重做）：
 *  1. 版式自上而下按「信息块」推进，每块先测高再落笔，**名字与简介都完整显示**——
 *     名字按其最长一行自动缩号，简介按可用高度自动缩号并换行，不截断成省略号；
 *  2. 匹配度独占一行，绝不压在头像上；
 *  3. 与结果页共用同一套语义：馆藏编号 / 分类中文名 / 印章 / 六维条 / 站点名；
 *  4. 导出保持 ≥2x 清晰度（由调用方的 pickScale 保证）。
 *
 * 纯前端、零依赖；绘制函数单独导出，便于单测与 Playwright 取证。
 */
import type { Dims } from '../../shared/types';
import { categoryLabel, archiveNo as displayArchiveNo, splitName, tidySubtitle } from './display';

/** 海报版式：9:16 竖版（CSS px，导出时整体乘 scale） */
export const POSTER_LAYOUT = {
  width: 375,
  height: 667,
  pad: 20,
} as const;

/** 与 global.css 的 token 保持同一份值；改 token 必须同步改这里 */
const C = {
  paper: '#f2ead8',
  paper2: '#e9dfc8',
  paper3: '#dfd3b8',
  edge: '#cbbd9e',
  ink: '#1c1a17',
  ink2: '#4a453d',
  ink3: '#7a7266',
  seal: '#b23a2e',
  sealSoft: 'rgba(178,58,46,0.10)',
  inkPanel: '#232019',
  inkPanelInk: '#ede4d2',
} as const;

const FONT_SANS =
  "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Source Han Sans SC', sans-serif";
const FONT_SERIF = "'Songti SC', 'SimSun', 'Source Han Serif SC', Georgia, serif";
const FONT_MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";

/** 失败原因枚举：UI 按它给不同提示，测试按它断言 */
export type PosterFailReason =
  | 'CANVAS_UNSUPPORTED'
  | 'IMAGE_LOAD_FAILED'
  | 'CANVAS_TAINTED'
  | 'EXPORT_FAILED'
  | 'EXPORT_EMPTY'
  | 'FONT_FAILED';

export interface PosterData {
  personaId: string;
  personaName: string;
  category: string;
  tags: string[];
  percent: number | null;
  dims: Dims;
  desc?: string;
  imageUrl?: string;
  image?: CanvasImageSource | null;
  shareUrl?: string;
}

export type PosterResult =
  | {
      ok: true;
      url: string;
      blob: Blob;
      downloadable: boolean;
      width: number;
      height: number;
    }
  | { ok: false; reason: PosterFailReason; message: string };

export interface PosterDeps {
  devicePixelRatio: number;
  settleFonts: () => Promise<void>;
  createCanvas: (w: number, h: number) => HTMLCanvasElement | null;
  toBlob: (canvas: HTMLCanvasElement) => Promise<Blob | null>;
  toDataURL: (canvas: HTMLCanvasElement) => string;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  isCanvasTainted: (canvas: HTMLCanvasElement) => boolean;
  downloadable: boolean;
}

/** 产出倍数：至少 2x，最多 3x（避免大画布在低端机 OOM） */
export function pickScale(dpr: number): number {
  if (!Number.isFinite(dpr) || dpr <= 0) return 2;
  return Math.min(Math.max(dpr, 2), 3);
}

/** 馆藏编号 */
export function archiveNo(personaId: string): string {
  return displayArchiveNo(personaId);
}

/** 匹配度展示串：与引擎同口径（<10% 显示 `<10%`，无小数） */
export function formatPosterPercent(percent: number | null): string {
  if (percent === null || !Number.isFinite(percent)) return '—';
  const v = Math.max(0, Math.min(100, Math.round(percent)));
  return v < 10 ? '<10%' : `${v}%`;
}

export function defaultDeps(over?: Partial<PosterDeps>): PosterDeps {
  const dpr =
    typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1;
  return {
    devicePixelRatio: dpr,
    settleFonts: async () => {
      const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
      if (fonts?.ready) await fonts.ready;
    },
    createCanvas: (w, h) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    },
    toBlob: (canvas) =>
      new Promise<Blob | null>((resolve) => {
        try {
          canvas.toBlob((b) => resolve(b), 'image/png');
        } catch {
          resolve(null);
        }
      }),
    toDataURL: (canvas) => canvas.toDataURL('image/png'),
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    isCanvasTainted: () => false,
    downloadable: typeof document !== 'undefined',
    ...over,
  };
}

/* ─────────────── 绘制辅助 ─────────────── */

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** 按宽度折行（CJK 逐字、英文按空格），返回行数组 */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  const chars = Array.from(text);
  let line = '';
  for (const ch of chars) {
    const next = line + ch;
    if (ctx.measureText(next).width > maxW && line) {
      out.push(line);
      line = ch;
    } else {
      line = next;
    }
  }
  if (line) out.push(line);
  return out;
}

/** 判断一个错误是否属于「画布被跨域污染」 */
function isTaintedError(e: unknown): boolean {
  if (!e) return false;
  const err = e as { name?: unknown; message?: unknown };
  // 跨 realm 时 instanceof 不可靠，直接看 name/message 更稳
  const name = typeof err.name === 'string' ? err.name : '';
  const msg = typeof err.message === 'string' ? err.message : String(e);
  return name === 'SecurityError' || /taint/i.test(msg) || /SecurityError/i.test(String(e));
}

/** 在给定字号下把文本折进 maxLines 行；放不下就缩号（最低 minSize） */
function fitBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  maxLines: number,
  fontOf: (size: number) => string,
  startSize: number,
  minSize: number,
): { size: number; lines: string[]; lineH: number } {
  let size = startSize;
  for (;;) {
    ctx.font = fontOf(size);
    const lines = wrapLines(ctx, text, maxW);
    if (lines.length <= maxLines || size <= minSize) {
      return { size, lines, lineH: Math.round(size * 1.6) };
    }
    size -= 1;
  }
}

/* ─────────────── 主绘制 ─────────────── */

/**
 * 在已缩放的 ctx 上绘制海报（逻辑坐标 = CSS px）。
 */
export function paintPoster(ctx: CanvasRenderingContext2D, data: PosterData): void {
  const { width: W, height: H, pad } = POSTER_LAYOUT;
  const innerW = W - pad * 2;
  const name = splitName(data.personaName);
  const cat = categoryLabel(data.category);

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // ── 底：档案纸 + 极轻纸纹 ──
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1;
  for (let y = 0; y < H; y += 3) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();

  let y = 0;

  // ── 顶部墨条：馆藏条 ──
  const HEAD_H = 40;
  ctx.fillStyle = C.inkPanel;
  ctx.fillRect(0, 0, W, HEAD_H);
  ctx.fillStyle = C.seal;
  ctx.fillRect(pad, 11, 18, 18);
  ctx.fillStyle = C.inkPanelInk;
  ctx.font = `700 11px ${FONT_SANS}`;
  ctx.textAlign = 'center';
  ctx.fillText('档', pad + 9, 24);
  ctx.textAlign = 'left';
  ctx.fillStyle = C.inkPanelInk;
  ctx.font = `700 13px ${FONT_SERIF}`;
  ctx.fillText('互联网人物档案馆', pad + 26, 24);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(237,228,210,0.62)';
  ctx.font = `11px ${FONT_MONO}`;
  ctx.fillText(archiveNo(data.personaId), W - pad, 24);
  ctx.textAlign = 'left';

  y = HEAD_H + 18;

  // ── 信息行：分类 ──
  ctx.fillStyle = C.seal;
  ctx.font = `700 11px ${FONT_SANS}`;
  ctx.fillText(cat, pad, y + 10);
  ctx.strokeStyle = 'rgba(178,58,46,0.32)';
  ctx.lineWidth = 1;
  const catW = ctx.measureText(cat).width;
  ctx.strokeRect(pad - 4, y - 2, catW + 8, 17);
  y += 24;

  // ── 头像 + 名字 ──
  const AV = 88;
  const gapX = 14;
  const textW = innerW - AV - gapX;

  // 相框
  ctx.fillStyle = C.paper2;
  ctx.fillRect(pad, y, AV, AV);
  ctx.strokeStyle = C.edge;
  ctx.strokeRect(pad + 0.5, y + 0.5, AV - 1, AV - 1);
  ctx.strokeStyle = C.paper;
  ctx.lineWidth = 3;
  ctx.strokeRect(pad + 4, y + 4, AV - 8, AV - 8);
  ctx.lineWidth = 1;

  if (data.image) {
    ctx.save();
    roundRect(ctx, pad + 5, y + 5, AV - 10, AV - 10, 1);
    ctx.clip();
    try {
      ctx.drawImage(data.image, pad + 5, y + 5, AV - 10, AV - 10);
    } catch {
      /* 单图失败不影响整张海报 */
    }
    ctx.restore();
  } else {
    // 无图：首字占位，与页面同一套语言
    ctx.fillStyle = C.paper3;
    ctx.fillRect(pad + 5, y + 5, AV - 10, AV - 10);
    ctx.fillStyle = C.seal;
    ctx.font = `800 40px ${FONT_SERIF}`;
    ctx.textAlign = 'center';
    ctx.fillText(name.main.slice(0, 1), pad + AV / 2, y + AV / 2 + 14);
    ctx.textAlign = 'left';
  }

  // 名字：按最长行自动缩号，保证完整显示
  const nameStart = 26;
  const nameMin = 15;
  let nameSize = nameStart;
  let nameLines: string[] = [];
  for (;;) {
    ctx.font = `800 ${nameSize}px ${FONT_SERIF}`;
    nameLines = wrapLines(ctx, name.main, textW);
    if (nameLines.length <= 2 || nameSize <= nameMin) break;
    nameSize -= 1;
  }
  const nameLineH = Math.round(nameSize * 1.34);

  ctx.fillStyle = C.ink;
  ctx.font = `800 ${nameSize}px ${FONT_SERIF}`;
  let ny = y + nameSize + 2;
  for (const line of nameLines) {
    ctx.fillText(line, pad + AV + gapX, ny);
    ny += nameLineH;
  }

  // 副标题（括号内的著录行）
  if (name.sub) {
    const sub = fitBlock(
      ctx,
      tidySubtitle(name.sub),
      textW,
      2,
      (s) => `${s}px ${FONT_SANS}`,
      11,
      9,
    );
    ctx.fillStyle = C.ink3;
    ctx.font = `${sub.size}px ${FONT_SANS}`;
    let sy = ny + 4;
    for (const line of sub.lines) {
      ctx.fillText(line, pad + AV + gapX, sy);
      sy += sub.lineH;
    }
    ny = sy;
  }

  y = Math.max(y + AV, ny) + 14;

  // ── 匹配度：独占一行，不与头像重叠 ──
  ctx.fillStyle = C.sealSoft;
  ctx.fillRect(pad, y - 4, innerW, 54);
  ctx.strokeStyle = 'rgba(178,58,46,0.28)';
  ctx.strokeRect(pad + 0.5, y - 3.5, innerW - 1, 53);

  const pct = formatPosterPercent(data.percent);
  ctx.fillStyle = C.seal;
  ctx.font = `700 34px ${FONT_MONO}`;
  const pctW = ctx.measureText(pct).width;
  ctx.fillText(pct, pad + 14, y + 34);

  ctx.fillStyle = C.ink2;
  ctx.font = `700 12px ${FONT_SANS}`;
  ctx.fillText('娱乐匹配度', pad + 14 + pctW + 12, y + 20);
  ctx.fillStyle = C.ink3;
  ctx.font = `10px ${FONT_SANS}`;
  ctx.fillText('非心理测量，仅供娱乐', pad + 14 + pctW + 12, y + 36);

  // 右侧印章
  const sealR = 22;
  const cx = W - pad - sealR - 4;
  const cy = y + 24;
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = C.seal;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, sealR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = C.seal;
  ctx.font = `800 11px ${FONT_SERIF}`;
  ctx.textAlign = 'center';
  ctx.fillText('已鉴定', cx, cy - 1);
  ctx.fillText('存档', cx, cy + 13);
  ctx.textAlign = 'left';
  ctx.restore();

  y += 54 + 16;

  // ── 标签 ──
  if (data.tags?.length) {
    let tx = pad;
    const tagY = y;
    ctx.font = `11px ${FONT_SANS}`;
    for (const t of data.tags.slice(0, 6)) {
      const w = ctx.measureText(t).width + 16;
      if (tx + w > W - pad) break;
      ctx.fillStyle = C.paper2;
      roundRect(ctx, tx, tagY, w, 20, 10);
      ctx.fill();
      ctx.strokeStyle = C.edge;
      ctx.stroke();
      ctx.fillStyle = C.ink2;
      ctx.fillText(t, tx + 8, tagY + 14);
      tx += w + 6;
    }
    y += 20 + 16;
  }

  // ── 六维：带填充的条形 ──
  const DIMS: Array<[keyof Dims, string]> = [
    ['EE', '情绪浓度'],
    ['ST', '表达风格'],
    ['AC', '行动力'],
    ['HX', '复杂性'],
    ['RB', '反叛度'],
    ['SR', '社交半径'],
  ];

  ctx.fillStyle = C.ink;
  ctx.font = `800 13px ${FONT_SERIF}`;
  ctx.fillText('六维坐标', pad, y + 12);
  ctx.textAlign = 'right';
  ctx.fillStyle = C.ink3;
  ctx.font = `10px ${FONT_MONO}`;
  ctx.fillText('0 — 100', W - pad, y + 12);
  ctx.textAlign = 'left';
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, y + 18);
  ctx.lineTo(W - pad, y + 18);
  ctx.stroke();
  ctx.lineWidth = 1;
  y += 30;

  const labelW = 56;
  const valW = 28;
  const barW = innerW - labelW - valW - 16;
  for (const [key, label] of DIMS) {
    const v = Math.max(0, Math.min(100, data.dims[key]));
    ctx.fillStyle = C.ink2;
    ctx.font = `11px ${FONT_SANS}`;
    ctx.fillText(label, pad, y + 11);

    const bx = pad + labelW;
    ctx.fillStyle = C.paper3;
    ctx.fillRect(bx, y + 2, barW, 11);
    ctx.fillStyle = C.seal;
    ctx.fillRect(bx, y + 2, Math.max(2, (barW * v) / 100), 11);
    ctx.strokeStyle = C.edge;
    ctx.strokeRect(bx + 0.5, y + 2.5, barW - 1, 10);

    ctx.textAlign = 'right';
    ctx.fillStyle = C.ink;
    ctx.font = `700 11px ${FONT_MONO}`;
    ctx.fillText(String(v), W - pad, y + 12);
    ctx.textAlign = 'left';
    y += 24;
  }

  y += 8;

  // ── 简介：按剩余高度自动缩号，保证完整显示（不截断） ──
  const FOOT_H = 54;
  const descTop = y;
  const descAvail = H - FOOT_H - descTop - 10;
  if (data.desc && descAvail > 24) {
    const maxLines = Math.max(2, Math.floor(descAvail / 15));
    const block = fitBlock(
      ctx,
      data.desc,
      innerW,
      maxLines,
      (s) => `${s}px ${FONT_SANS}`,
      12,
      8,
    );
    ctx.fillStyle = C.ink2;
    ctx.font = `${block.size}px ${FONT_SANS}`;
    let dy = descTop + block.size + 2;
    for (const line of block.lines) {
      if (dy > H - FOOT_H - 6) break;
      ctx.fillText(line, pad, dy);
      dy += block.lineH;
    }
  }

  // ── 底部：站点名 + 免责 ──
  ctx.fillStyle = C.inkPanel;
  ctx.fillRect(0, H - FOOT_H, W, FOOT_H);
  ctx.fillStyle = C.inkPanelInk;
  ctx.font = `700 11px ${FONT_SERIF}`;
  ctx.fillText('互联网人物档案馆', pad, H - FOOT_H + 22);
  ctx.fillStyle = 'rgba(237,228,210,0.55)';
  ctx.font = `9px ${FONT_SANS}`;
  ctx.fillText('仅供娱乐，不构成任何专业判断', pad, H - FOOT_H + 38);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(237,228,210,0.42)';
  ctx.font = `9px ${FONT_MONO}`;
  ctx.fillText('ARCHIVE', W - pad, H - FOOT_H + 22);
  ctx.textAlign = 'left';
}

/* ─────────────── 导出 ─────────────── */

export async function loadPosterImage(url: string | undefined): Promise<CanvasImageSource | null> {
  if (!url || typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
      img.onerror = () => resolve(null);
      img.src = url;
    } catch {
      resolve(null);
    }
  });
}

export async function renderPoster(data: PosterData, depsOverride?: Partial<PosterDeps>): Promise<PosterResult> {
  const deps = defaultDeps(depsOverride);

  try {
    await deps.settleFonts();
  } catch {
    return { ok: false, reason: 'FONT_FAILED', message: '字体加载失败，海报暂时无法生成。' };
  }

  const scale = pickScale(deps.devicePixelRatio);
  const W = Math.round(POSTER_LAYOUT.width * scale);
  const H = Math.round(POSTER_LAYOUT.height * scale);

  const canvas = deps.createCanvas(W, H);
  if (!canvas) {
    return { ok: false, reason: 'CANVAS_UNSUPPORTED', message: '当前浏览器不支持生成海报。' };
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { ok: false, reason: 'CANVAS_UNSUPPORTED', message: '当前浏览器不支持生成海报。' };
  }

  ctx.save();
  ctx.scale(scale, scale);
  try {
    paintPoster(ctx, data);
  } catch (e) {
    ctx.restore();
    if (isTaintedError(e) || deps.isCanvasTainted(canvas)) {
      return { ok: false, reason: 'CANVAS_TAINTED', message: '图片含有跨域内容，无法导出。' };
    }
    return { ok: false, reason: 'EXPORT_FAILED', message: '海报绘制出错。' };
  }
  ctx.restore();

  // 导出阶段也可能因跨域污染失败（getImageData / toBlob 抛 SecurityError）
  let blob: Blob | null = null;
  try {
    blob = await deps.toBlob(canvas);
  } catch (e) {
    if (isTaintedError(e) || deps.isCanvasTainted(canvas)) {
      return { ok: false, reason: 'CANVAS_TAINTED', message: '图片含有跨域内容，无法导出。' };
    }
    blob = null;
  }
  if (!blob) {
    try {
      const dataUrl = deps.toDataURL(canvas);
      if (!dataUrl || !dataUrl.startsWith('data:image')) {
        return { ok: false, reason: 'EXPORT_FAILED', message: '海报导出失败，请重试。' };
      }
      const res = await fetch(dataUrl);
      blob = await res.blob();
    } catch (e) {
      if (isTaintedError(e) || deps.isCanvasTainted(canvas)) {
        return { ok: false, reason: 'CANVAS_TAINTED', message: '图片含有跨域内容，无法导出。' };
      }
      return { ok: false, reason: 'EXPORT_FAILED', message: '海报导出失败，请重试。' };
    }
  }

  if (!blob || blob.size === 0) {
    return { ok: false, reason: 'EXPORT_EMPTY', message: '导出的海报是空白的，请重试。' };
  }

  try {
    const url = deps.createObjectURL(blob);
    return { ok: true, url, blob, downloadable: deps.downloadable, width: W, height: H };
  } catch {
    return { ok: false, reason: 'EXPORT_FAILED', message: '海报导出失败，请重试。' };
  }
}
