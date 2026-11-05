/**
 * 结果海报：**9:16 竖版引流卡**，不是结果页缩小版。
 *
 * 版式（一个焦点，其余让路）：
 *   1. 顶部墨条：站点名 + 馆藏编号（暗金细线收边）
 *   2. 巨大头像（视觉重心）+ 已鉴定印章
 *   3. 超大匹配度数字
 *   4. 大名字 + 副标题
 *   5. 最多 3 个标签
 *   6. 紧凑六维雷达图 + 一句简介
 *   7. 底部引流区：钩子文案 + 站点名 + 链接
 *
 * 纯 canvas 绘制、零依赖；导出 ≥2x 由 pickScale 保证。
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
  gold: '#9a7b3f',
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


/* ─────────────── 辅助 ─────────────── */

const DIM_LIST: Array<[keyof Dims, string]> = [
  ['EE', '情绪'],
  ['ST', '表达'],
  ['AC', '行动'],
  ['HX', '复杂'],
  ['RB', '反叛'],
  ['SR', '社交'],
];

/** 紧凑雷达图：六边形网格 + 朱红填充多边形 */
function drawRadar(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, dims: Dims): void {
  const n = DIM_LIST.length;
  const angleOf = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;

  ctx.strokeStyle = C.edge;
  ctx.lineWidth = 1;
  for (const ratio of [1 / 3, 2 / 3, 1]) {
    ctx.beginPath();
    for (let i = 0; i < n; i += 1) {
      const a = angleOf(i);
      const x = cx + Math.cos(a) * radius * ratio;
      const y = cy + Math.sin(a) * radius * ratio;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  for (let i = 0; i < n; i += 1) {
    const a = angleOf(i);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    ctx.stroke();
  }

  ctx.beginPath();
  for (let i = 0; i < n; i += 1) {
    const v = Math.max(0, Math.min(100, dims[DIM_LIST[i][0]])) / 100;
    const a = angleOf(i);
    const x = cx + Math.cos(a) * radius * v;
    const y = cy + Math.sin(a) * radius * v;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(178,58,46,0.20)';
  ctx.fill();
  ctx.strokeStyle = C.seal;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = C.seal;
  for (let i = 0; i < n; i += 1) {
    const v = Math.max(0, Math.min(100, dims[DIM_LIST[i][0]])) / 100;
    const a = angleOf(i);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * radius * v, cy + Math.sin(a) * radius * v, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.font = `10px ${FONT_SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < n; i += 1) {
    const a = angleOf(i);
    ctx.fillStyle = C.ink3;
    ctx.fillText(DIM_LIST[i][1], cx + Math.cos(a) * (radius + 13), cy + Math.sin(a) * (radius + 11));
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/* ─────────────── 主绘制 ─────────────── */

export function paintPoster(ctx: CanvasRenderingContext2D, data: PosterData): void {
  const { width: W, height: H, pad } = POSTER_LAYOUT;
  const innerW = W - pad * 2;
  const name = splitName(data.personaName);
  const cat = categoryLabel(data.category);

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // 底：档案纸 + 纤维
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
  ctx.globalAlpha = 0.03;
  for (let x = 0; x < W; x += 4) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.restore();

  const vig = ctx.createRadialGradient(W / 2, H * 0.44, W * 0.32, W / 2, H * 0.44, W);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(90,72,44,0.12)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // 顶部墨条
  const HEAD_H = 38;
  ctx.fillStyle = C.inkPanel;
  ctx.fillRect(0, 0, W, HEAD_H);
  ctx.fillStyle = C.seal;
  ctx.fillRect(pad, 10, 18, 18);
  ctx.fillStyle = C.inkPanelInk;
  ctx.font = `700 11px ${FONT_SANS}`;
  ctx.textAlign = 'center';
  ctx.fillText('档', pad + 9, 23);
  ctx.textAlign = 'left';
  ctx.font = `700 13px ${FONT_SERIF}`;
  ctx.fillText('互联网人物档案馆', pad + 26, 24);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(237,228,210,0.62)';
  ctx.font = `10.5px ${FONT_MONO}`;
  ctx.fillText(archiveNo(data.personaId), W - pad, 24);
  ctx.textAlign = 'left';
  ctx.fillStyle = C.gold;
  ctx.fillRect(0, HEAD_H, W, 1.5);

  // 分类
  let y = HEAD_H + 16;
  ctx.fillStyle = C.seal;
  ctx.font = `700 10.5px ${FONT_SANS}`;
  ctx.fillText(cat, pad, y + 9);
  const catW = ctx.measureText(cat).width;
  ctx.strokeStyle = 'rgba(178,58,46,0.32)';
  ctx.lineWidth = 1;
  ctx.strokeRect(pad - 4, y - 2, catW + 8, 16);

  // 巨大头像
  const AV = 150;
  const ax = (W - AV) / 2;
  const ay = y + 20;

  ctx.fillStyle = C.paper2;
  roundRect(ctx, ax - 5, ay + 5, AV + 10, AV + 10, 3);
  ctx.fill();

  ctx.fillStyle = C.paper;
  roundRect(ctx, ax - 4, ay - 4, AV + 8, AV + 8, 3);
  ctx.fill();
  ctx.strokeStyle = C.edge;
  ctx.strokeRect(ax - 3.5, ay - 3.5, AV + 7, AV + 7);

  if (data.image) {
    ctx.save();
    roundRect(ctx, ax, ay, AV, AV, 1);
    ctx.clip();
    try {
      ctx.drawImage(data.image, ax, ay, AV, AV);
    } catch {
      /* 单图失败不影响整张海报 */
    }
    ctx.restore();
  } else {
    ctx.fillStyle = C.paper3;
    ctx.fillRect(ax, ay, AV, AV);
    ctx.fillStyle = C.seal;
    ctx.font = `800 76px ${FONT_SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.main.slice(0, 1), ax + AV / 2, ay + AV / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // 印章压角
  const stampR = 26;
  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.translate(ax + AV - 6, ay + AV - 6);
  ctx.rotate(-0.16);
  ctx.strokeStyle = C.seal;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, stampR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = C.seal;
  ctx.font = `800 13px ${FONT_SERIF}`;
  ctx.textAlign = 'center';
  ctx.fillText('已鉴定', 0, -1);
  ctx.font = `800 11px ${FONT_SERIF}`;
  ctx.fillText('存档', 0, 15);
  ctx.restore();
  ctx.textAlign = 'left';

  y = ay + AV + 16;

  // 超大匹配度
  const pct = formatPosterPercent(data.percent);
  ctx.textAlign = 'center';
  ctx.fillStyle = C.seal;
  ctx.font = `700 54px ${FONT_MONO}`;
  ctx.fillText(pct, W / 2, y + 46);
  ctx.fillStyle = C.ink2;
  ctx.font = `600 10.5px ${FONT_SANS}`;
  ctx.fillText('娱乐匹配度 · 非心理测量', W / 2, y + 62);
  ctx.textAlign = 'left';

  y += 74;

  // 大名字
  let nameSize = 30;
  let nameLines: string[] = [];
  for (;;) {
    ctx.font = `800 ${nameSize}px ${FONT_SERIF}`;
    nameLines = wrapLines(ctx, name.main, innerW - 8);
    if (nameLines.length <= 2 || nameSize <= 16) break;
    nameSize -= 1;
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = C.ink;
  ctx.font = `800 ${nameSize}px ${FONT_SERIF}`;
  let ny = y + nameSize;
  for (const line of nameLines) {
    ctx.fillText(line, W / 2, ny);
    ny += Math.round(nameSize * 1.26);
  }

  if (name.sub) {
    ctx.fillStyle = C.ink3;
    ctx.font = `10.5px ${FONT_SANS}`;
    const subLines = wrapLines(ctx, tidySubtitle(name.sub), innerW - 24).slice(0, 1);
    ctx.fillText(subLines[0] ?? '', W / 2, ny + 2);
    ny += 14;
  }
  ctx.textAlign = 'left';

  y = ny + 8;

  // 标签（最多 3 个）
  if (data.tags?.length) {
    ctx.font = `10.5px ${FONT_SANS}`;
    const picked = data.tags.slice(0, 3);
    const widths = picked.map((t) => ctx.measureText(t).width + 18);
    const totalW = widths.reduce((a, b) => a + b, 0) + (picked.length - 1) * 6;
    let tx = (W - totalW) / 2;
    for (let i = 0; i < picked.length; i += 1) {
      const w = widths[i];
      ctx.fillStyle = C.paper2;
      roundRect(ctx, tx, y, w, 19, 9.5);
      ctx.fill();
      ctx.strokeStyle = C.edge;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = C.ink2;
      ctx.fillText(picked[i], tx + 9, y + 13);
      tx += w + 6;
    }
    y += 19 + 14;
  }

  // 雷达图 + 一句简介
  const radarR = 44;
  const radarCx = pad + radarR + 18;
  const radarCy = y + radarR + 2;
  drawRadar(ctx, radarCx, radarCy, radarR, data.dims);

  const textX = radarCx + radarR + 24;
  const textW = W - pad - textX;
  if (data.desc && textW > 60) {
    ctx.fillStyle = C.ink2;
    ctx.font = `11px ${FONT_SANS}`;
    const lines = wrapLines(ctx, data.desc, textW);
    const maxLines = 4;
    let ty = radarCy - radarR + 14;
    for (const line of lines.slice(0, maxLines)) {
      ctx.fillText(line, textX, ty);
      ty += 15;
    }
    if (lines.length > maxLines) {
      ctx.fillStyle = C.ink3;
      ctx.fillText('……', textX, ty);
    }
  }

  // 底部引流区
  const FOOT_H = 96;
  const footTop = H - FOOT_H;
  ctx.fillStyle = C.inkPanel;
  ctx.fillRect(0, footTop, W, FOOT_H);
  ctx.fillStyle = C.gold;
  ctx.fillRect(0, footTop, W, 1.5);

  ctx.fillStyle = C.inkPanelInk;
  ctx.font = `800 17px ${FONT_SERIF}`;
  ctx.fillText('你像哪一号人物？', pad, footTop + 30);
  ctx.fillStyle = 'rgba(237,228,210,0.72)';
  ctx.font = `11px ${FONT_SANS}`;
  ctx.fillText('来档案馆测测，25 题出你的专属档案', pad, footTop + 50);

  ctx.fillStyle = C.inkPanelInk;
  ctx.font = `700 11px ${FONT_SANS}`;
  ctx.fillText('互联网人物档案馆', pad, footTop + 76);

  // 引流区只放站点主地址（不带 token），保证可读、不被截断
  let link = '';
  try {
    if (data.shareUrl) {
      const u = new URL(data.shareUrl);
      link = `${u.host}${u.pathname}`.replace(/\/$/, '');
    }
  } catch {
    link = (data.shareUrl ?? '').replace(/^https?:\/\//, '').split('?')[0] ?? '';
  }
  const shown = link.length > 26 ? `${link.slice(0, 26)}…` : link;
  if (shown) {
    ctx.textAlign = 'right';
    ctx.fillStyle = C.gold;
    ctx.font = `10px ${FONT_MONO}`;
    ctx.fillText(shown, W - pad, footTop + 76);
    ctx.textAlign = 'left';
  }
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
