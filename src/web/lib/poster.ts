/**
 * 分享海报生成（Canvas 2D，纯前端，零依赖）。
 *
 * 设计约束：
 * - 只用现有 token（styles/global.css 的 --bg/--paper/--accent/--font…），不另起视觉体系；
 * - 全程纯文字 + 色块，不加载任何第三方人物素材 → 天然没有跨域图片来源，
 *   但仍按「可能被污染」处理（isCanvasTainted + 二次 try/catch），方便以后接授权素材；
 * - 失败一律返回 `{ ok: false, reason }`，**不抛异常**，由 UI 降级显示分享链接。
 *
 * 关键实现点：
 * 1. 分辨率按 `min(max(devicePixelRatio, 2), 3)` 放大 → 产出 ≥2x 清晰度（上限 3x 防内存爆）；
 * 2. 出图前 `await settleFonts()`（document.fonts.ready），字体未就绪时文字会以回退字体绘制；
 * 3. 优先 `toBlob`（失败/返回 null → 回退 `toDataURL`）；两条都失败给 POSTER_EXPORT_FAILED；
 * 4. 所有可由测试注入的依赖集中在 `PosterDeps`，便于单测覆盖失败分支。
 */

import type { Dims } from '../../shared/types';
import { DIM_KEYS } from '../../shared/types';
import { DIM_LABEL } from './dims';

/** 海报版式（CSS px，导出时整体乘 scale） */
export const POSTER_LAYOUT = {
  width: 375,
  height: 620,
  pad: 24,
} as const;

/** 与 global.css 的 token 保持同一份值；改 token 必须同步改这里 */
const C = {
  bg: '#0e0f12',
  bgElev: '#16181d',
  surface: '#1b1e24',
  paper: '#f4efe6',
  paperInk: '#1a1a1c',
  line: '#2a2d35',
  lineStrong: '#3a3e48',
  ink: '#f2f3f5',
  ink2: '#a8aab4',
  ink3: '#6f7280',
  accent: '#d8a13a',
  accentInk: '#241a06',
} as const;

const FONT_SANS =
  "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Source Han Sans SC', sans-serif";
const FONT_MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";

/** 失败原因枚举：UI 按它给不同提示，测试按它断言 */
export type PosterFailReason =
  | 'CANVAS_UNSUPPORTED' // 拿不到 2d context（低端机 / 被禁用）
  | 'IMAGE_LOAD_FAILED' // 图片加载失败（当前纯文字不出图；为将来授权素材预留）
  | 'CANVAS_TAINTED' // 画布被跨域内容污染，无法导出
  | 'EXPORT_FAILED' // toBlob 与 toDataURL 都失败
  | 'EXPORT_EMPTY' // 导出的 blob 为空
  | 'FONT_FAILED'; // 字体就绪等待失败（可继续出图，仅在严格模式下判失败）

export interface PosterData {
  /** 主匹配人物 id（用于生成卷宗号 NO.xxxx） */
  personaId: string;
  /** 主匹配人物名（与结果页同一字段） */
  personaName: string;
  category: string;
  tags: string[];
  /** 娱乐匹配度：等于引擎 mainPercent.value，展示串由 formatPercent 口径给出 */
  percent: number | null;
  /** 引擎 user.x × 100 的展示值（与结果页同样的取整） */
  dims: Dims;
  desc?: string;
  /** 人物配图 URL（静态路径）；缺省或加载失败时海报不画图，其余版式不变 */
  imageUrl?: string;
  /** 已预加载完成的配图；由调用方通过 loadPosterImage 取得后再传入 */
  image?: CanvasImageSource | null;
  /** 分享链接兜底文案（海报底部展示，便于截图后仍能找到链接） */
  shareUrl?: string;
}

export type PosterResult =
  | {
      ok: true;
      /** 展示用对象 URL；调用方负责 revoke */
      url: string;
      blob: Blob;
      /** 浏览器是否支持下载（不支持时只给长按保存） */
      downloadable: boolean;
      width: number;
      height: number;
    }
  | { ok: false; reason: PosterFailReason; message: string };

/** 可注入依赖：默认走真实浏览器 API，单测里替换成桩 */
export interface PosterDeps {
  devicePixelRatio: number;
  /** 字体就绪等待；默认 document.fonts.ready */
  settleFonts: () => Promise<void>;
  /** 创建画布；默认 document.createElement('canvas') */
  createCanvas: (w: number, h: number) => HTMLCanvasElement | null;
  /** canvas → blob；默认 canvas.toBlob（可能返回 null） */
  toBlob: (canvas: HTMLCanvasElement) => Promise<Blob | null>;
  /** 回退路径；默认 canvas.toDataURL */
  toDataURL: (canvas: HTMLCanvasElement) => string;
  /** dataURL → Blob；默认 fetch(dataURL).then(r => r.blob()) */
  dataUrlToBlob: (dataUrl: string) => Promise<Blob>;
  /** 对象 URL；默认 URL.createObjectURL */
  createObjectURL: (blob: Blob) => string;
  /** 是否支持下载属性 */
  supportsDownload: boolean;
}

function defaultDeps(): PosterDeps {
  const dpr = typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1;
  return {
    devicePixelRatio: dpr,
    settleFonts: async () => {
      const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
      if (fonts?.ready) await fonts.ready;
    },
    createCanvas: (w, h) => {
      if (typeof document === 'undefined') return null;
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
    dataUrlToBlob: async (dataUrl) => {
      const res = await fetch(dataUrl);
      return res.blob();
    },
    createObjectURL: (blob) => URL.createObjectURL(blob),
    supportsDownload: typeof document !== 'undefined' && 'download' in document.createElement('a'),
  };
}

/** 产出倍数：至少 2x，最多 3x（避免大画布在低端机 OOM） */
export function pickScale(dpr: number): number {
  if (!Number.isFinite(dpr) || dpr <= 0) return 2;
  return Math.min(Math.max(dpr, 2), 3);
}

/** 由人物 id 派生可读卷宗号：mem-coke-003 → NO.0003（取末段数字） */
export function archiveNo(personaId: string): string {
  const m = /(\d+)\s*$/.exec(personaId ?? '');
  if (!m) return 'NO.----';
  return `NO.${m[1]!.padStart(4, '0')}`;
}

/** 匹配度展示串：与引擎 formatPercent 同口径（<10% 显示 `<10%`，无小数） */
export function formatPosterPercent(percent: number | null): string {
  if (percent === null || !Number.isFinite(percent)) return '—';
  const v = Math.max(0, Math.min(100, Math.round(percent)));
  return v < 10 ? '<10%' : `${v}%`;
}

/**
 * 预加载人物配图，供同步绘制使用。
 *
 * **任何失败都返回 null，绝不抛错**：海报的主体是结果信息，缺一张图不该让整张海报生成失败。
 * 调用方把返回值塞进 `PosterData.image`，绘制层据此决定是否画图。
 */
export function loadPosterImage(url: string | undefined): Promise<CanvasImageSource | null> {
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

/** 单行截断绘制（超出加省略号），返回实际绘制宽度 */
function drawClipped(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  font: string,
): number {
  ctx.font = font;
  if (ctx.measureText(text).width <= maxW) {
    ctx.fillText(text, x, y);
    return ctx.measureText(text).width;
  }
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  const out = `${s}…`;
  ctx.fillText(out, x, y);
  return ctx.measureText(out).width;
}

/** 按宽度折行（中英混排按字符折），最多 maxLines 行，超出末行加省略号 */
function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  maxLines: number,
  font: string,
): string[] {
  ctx.font = font;
  const lines: string[] = [];
  let cur = '';
  for (const ch of text) {
    const next = cur + ch;
    if (ctx.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = ch;
      if (lines.length === maxLines) break;
    } else {
      cur = next;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (lines.length === maxLines) {
    const joined = lines.join('');
    if (joined.length < text.length) {
      let last = lines[maxLines - 1]!;
      while (last.length > 1 && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
      lines[maxLines - 1] = `${last}…`;
    }
  }
  return lines;
}

/** 套准角标：四角 L 形短线（沿用页面「档案 / 印刷」母题，不新增图形语言） */
function drawCornerMarks(ctx: CanvasRenderingContext2D, w: number, h: number, inset: number, len: number): void {
  ctx.save();
  ctx.strokeStyle = C.lineStrong;
  ctx.lineWidth = 1;
  const pts: Array<[number, number, number, number]> = [
    [inset, inset + len, inset, inset],
    [inset, inset, inset + len, inset],
    [w - inset - len, inset, w - inset, inset],
    [w - inset, inset, w - inset, inset + len],
    [inset, h - inset - len, inset, h - inset],
    [inset, h - inset, inset + len, h - inset],
    [w - inset - len, h - inset, w - inset, h - inset],
    [w - inset, h - inset, w - inset, h - inset - len],
  ];
  for (const [x1, y1, x2, y2] of pts) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 在已缩放的 ctx 上绘制海报（逻辑坐标 = CSS px）。
 * 导出成独立函数，方便「不导出 Blob 也能单测绘制」与 Playwright 取证。
 */
export function paintPoster(ctx: CanvasRenderingContext2D, data: PosterData): void {
  const { width: W, height: H, pad } = POSTER_LAYOUT;
  const innerW = W - pad * 2;

  // 底
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  drawCornerMarks(ctx, W, H, pad - 8, 14);

  // 品牌行
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = C.ink3;
  ctx.font = `600 11px ${FONT_SANS}`;
  ctx.fillText('互联网人物档案馆', pad, pad + 14);

  ctx.textAlign = 'right';
  ctx.font = `11px ${FONT_MONO}`;
  ctx.fillText(archiveNo(data.personaId), W - pad, pad + 14);

  // 米白主卡（复用结果页 .result__hero 的纸张质感）
  const cardY = pad + 40;
  const cardH = 300;
  ctx.fillStyle = C.paper;
  roundRect(ctx, pad, cardY, innerW, cardH, 16);
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(26,26,28,0.55)';
  ctx.font = `600 11px ${FONT_SANS}`;
  ctx.fillText('匹配结果', pad + 20, cardY + 30);

  // 人物配图（可选）：画在图位左侧的方形槽位；无图时不占用文字宽度，版式与原先一致
  const AVATAR = 84;
  const hasImage = Boolean(data.image);
  const textX = hasImage ? pad + 20 + AVATAR + 16 : pad + 20;
  const textW = hasImage ? innerW - 40 - AVATAR - 16 : innerW - 40;
  if (hasImage && data.image) {
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, pad + 20, cardY + 48, AVATAR, AVATAR, 14);
    ctx.clip();
    try {
      ctx.drawImage(data.image, pad + 20, cardY + 48, AVATAR, AVATAR);
    } catch {
      /* 单张图绘制失败不影响整张海报 */
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(26,26,28,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    roundRect(ctx, pad + 20, cardY + 48, AVATAR, AVATAR, 14);
    ctx.stroke();
  }

  // 人物名（大字，允许缩小一次而不是截断）
  ctx.fillStyle = C.paperInk;
  const name = data.personaName || '未能匹配';
  let nameSize = 34;
  const nameFont = (s: number) => `800 ${s}px ${FONT_SANS}`;
  ctx.font = nameFont(nameSize);
  while (nameSize > 22 && ctx.measureText(name).width > textW) {
    nameSize -= 2;
    ctx.font = nameFont(nameSize);
  }
  drawClipped(ctx, name, textX, cardY + 78, textW, nameFont(nameSize));

  // 分类
  ctx.fillStyle = 'rgba(26,26,28,0.55)';
  ctx.font = `13px ${FONT_SANS}`;
  drawClipped(
    ctx,
    (data.category || '—').toUpperCase(),
    textX,
    cardY + 102,
    textW,
    `13px ${FONT_SANS}`,
  );

  // 匹配度：等宽大数字 + 「娱乐」限定词
  const pct = formatPosterPercent(data.percent);
  ctx.fillStyle = C.paperInk;
  ctx.font = `500 40px ${FONT_MONO}`;
  ctx.fillText(pct, pad + 20, cardY + 152);
  const pctW = ctx.measureText(pct).width;
  ctx.fillStyle = 'rgba(26,26,28,0.6)';
  ctx.font = `12px ${FONT_SANS}`;
  ctx.fillText('娱乐匹配度', pad + 20, cardY + 172);
  ctx.fillStyle = '#1b37ff';
  ctx.font = `11px ${FONT_SANS}`;
  ctx.fillText('非心理测量', pad + 20 + pctW + 8, cardY + 152);

  // 标签（最多 2 个，与人物卡规范一致）
  let tx = pad + 20;
  const tags = (data.tags ?? []).slice(0, 2);
  for (const t of tags) {
    ctx.font = `12px ${FONT_SANS}`;
    const tw = Math.min(ctx.measureText(t).width + 16, innerW - 40);
    ctx.fillStyle = 'rgba(26,26,28,0.08)';
    roundRect(ctx, tx, cardY + 190, tw, 24, 12);
    ctx.fill();
    ctx.fillStyle = 'rgba(26,26,28,0.75)';
    drawClipped(ctx, t, tx + 8, cardY + 206, tw - 16, `12px ${FONT_SANS}`);
    tx += tw + 8;
    if (tx > pad + innerW - 60) break;
  }

  // 简介
  if (data.desc) {
    ctx.fillStyle = 'rgba(26,26,28,0.72)';
    const lines = wrapLines(ctx, data.desc, innerW - 40, 3, `13px ${FONT_SANS}`);
    lines.forEach((ln, i) => ctx.fillText(ln, pad + 20, cardY + 240 + i * 20));
  }

  // 六维条
  const dimY = cardY + cardH + 28;
  ctx.fillStyle = C.ink;
  ctx.font = `700 13px ${FONT_SANS}`;
  ctx.fillText('六维坐标', pad, dimY);
  ctx.fillStyle = C.ink3;
  ctx.font = `11px ${FONT_MONO}`;
  ctx.textAlign = 'right';
  ctx.fillText('0–100', W - pad, dimY);
  ctx.textAlign = 'left';

  const rowGap = 22;
  const labelW = 52;
  const valueW = 30;
  const trackX = pad + labelW + 10;
  const trackW = innerW - labelW - valueW - 20;
  DIM_KEYS.forEach((k, i) => {
    const y = dimY + 22 + i * rowGap;
    const v = Math.max(0, Math.min(100, Math.round(data.dims[k] ?? 0)));
    ctx.fillStyle = C.ink2;
    ctx.font = `12px ${FONT_SANS}`;
    ctx.fillText(DIM_LABEL[k] ?? k, pad, y + 4);

    ctx.fillStyle = C.line;
    roundRect(ctx, trackX, y - 2, trackW, 5, 3);
    ctx.fill();

    if (v > 0) {
      ctx.fillStyle = C.accent;
      roundRect(ctx, trackX, y - 2, Math.max(3, (trackW * v) / 100), 5, 3);
      ctx.fill();
    }

    ctx.fillStyle = C.ink3;
    ctx.font = `11px ${FONT_MONO}`;
    ctx.textAlign = 'right';
    ctx.fillText(String(v), W - pad, y + 4);
    ctx.textAlign = 'left';
  });

  // 底栏：免责声明 + 分享链接
  const footY = H - pad - 26;
  ctx.fillStyle = C.ink3;
  ctx.font = `11px ${FONT_SANS}`;
  ctx.fillText('仅供娱乐，不构成任何专业意见或判断。人物为纯文字占位卡。', pad, footY);
  if (data.shareUrl) {
    ctx.fillStyle = C.accent;
    ctx.font = `10px ${FONT_MONO}`;
    drawClipped(ctx, data.shareUrl, pad, footY + 16, innerW, `10px ${FONT_MONO}`);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** 画布是否已被跨域内容污染（不能直接读像素，只能试读一次） */
export function isCanvasTainted(ctx: CanvasRenderingContext2D): boolean {
  try {
    const w = Math.min(1, ctx.canvas.width);
    const h = Math.min(1, ctx.canvas.height);
    if (w > 0 && h > 0) ctx.getImageData(0, 0, w, h);
    return false;
  } catch {
    return true;
  }
}

const FAIL_TEXT: Record<PosterFailReason, string> = {
  CANVAS_UNSUPPORTED: '当前设备不支持生成图片，下面有结果链接可以分享。',
  IMAGE_LOAD_FAILED: '素材加载失败，海报没生成出来。可以用下面的结果链接分享。',
  CANVAS_TAINTED: '图片受跨域限制无法导出，可以用下面的结果链接分享。',
  EXPORT_FAILED: '图片保存失败，可以用下面的结果链接分享。',
  EXPORT_EMPTY: '图片内容为空，可以用下面的结果链接分享。',
  FONT_FAILED: '字体加载异常，为了不让你拿到错版海报已停止生成，可用下面的结果链接分享。',
};

function fail(reason: PosterFailReason): PosterResult {
  return { ok: false, reason, message: FAIL_TEXT[reason] };
}

/**
 * 生成海报。**永不抛异常**，失败返回 `{ ok:false, reason, message }`。
 * 调用方必须处理失败分支（降级到分享链接），不能白屏。
 */
export async function renderPoster(data: PosterData, depsOverride?: Partial<PosterDeps>): Promise<PosterResult> {
  const deps: PosterDeps = { ...defaultDeps(), ...depsOverride };

  // ① 字体就绪：未就绪就绘制会以回退字体出图，宁可失败也不给错版
  try {
    await deps.settleFonts();
  } catch {
    return fail('FONT_FAILED');
  }

  // ② 画布与 2d context
  const scale = pickScale(deps.devicePixelRatio);
  const W = Math.round(POSTER_LAYOUT.width * scale);
  const H = Math.round(POSTER_LAYOUT.height * scale);
  let canvas: HTMLCanvasElement | null;
  try {
    canvas = deps.createCanvas(W, H);
  } catch {
    return fail('CANVAS_UNSUPPORTED');
  }
  if (!canvas) return fail('CANVAS_UNSUPPORTED');

  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null;
  }
  if (!ctx) return fail('CANVAS_UNSUPPORTED');

  // ③ 绘制
  try {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    paintPoster(ctx, data);
  } catch {
    return fail('CANVAS_UNSUPPORTED');
  }

  // ④ 污染校验（当前纯文字不会触发；接授权图片素材后会）
  if (isCanvasTainted(ctx)) return fail('CANVAS_TAINTED');

  // ⑤ 导出：toBlob 优先，null / 抛错 都回退 toDataURL
  let blob: Blob | null = null;
  try {
    blob = await deps.toBlob(canvas);
  } catch {
    blob = null;
  }

  if (!blob) {
    try {
      const dataUrl = deps.toDataURL(canvas);
      if (!dataUrl || !dataUrl.startsWith('data:')) return fail('EXPORT_FAILED');
      blob = await deps.dataUrlToBlob(dataUrl);
    } catch {
      return fail('EXPORT_FAILED');
    }
  }

  if (!blob || blob.size === 0) return fail('EXPORT_EMPTY');

  let url: string;
  try {
    url = deps.createObjectURL(blob);
  } catch {
    return fail('EXPORT_FAILED');
  }

  return { ok: true, url, blob, downloadable: deps.supportsDownload, width: W, height: H };
}
