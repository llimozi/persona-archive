import { describe, it, expect, vi } from 'vitest';
import {
  renderPoster,
  pickScale,
  formatPosterPercent,
  archiveNo,
  POSTER_LAYOUT,
} from '../../src/web/lib/poster';
import type { PosterData, PosterDeps } from '../../src/web/lib/poster';

/**
 * 海报生成单测（node 环境，无真实 Canvas）。
 *
 * 策略：`renderPoster` 的所有副作用从 `PosterDeps` 注入，这里用桩替换，
 * 因此每条失败分支都能在 node 下确定性复现——不依赖浏览器、不依赖真实字体。
 * 真浏览器下的出图取证在 tests/e2e/poster.e2e.ts。
 */

const DATA: PosterData = {
  personaId: 'mem-nailong-001',
  personaName: '奶龙',
  category: '网络梗',
  tags: ['抽象', '名场面'],
  percent: 74,
  dims: { EE: 61, ST: 55, AC: 72, HX: 48, RB: 80, SR: 66 },
  desc: '一段足够长的简介文本，用来验证折行与截断逻辑不会抛错。',
  shareUrl: 'https://example.test/?r=abc',
};

/** 最小 2d context 桩：记录被调用的绘制方法 */
function fakeCtx(): CanvasRenderingContext2D {
  const noop = () => undefined;
  return {
    canvas: { width: 750, height: 1240 },
    setTransform: vi.fn(),
    scale: vi.fn(),
    arc: noop,
    clip: noop,
    drawImage: noop,
    strokeRect: noop,
    globalAlpha: 1,
    fillRect: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    arcTo: noop,
    closePath: noop,
    stroke: noop,
    fill: noop,
    save: noop,
    restore: noop,
    fillText: vi.fn(),
    measureText: (t: string) => ({ width: t.length * 10 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    textAlign: 'left',
    textBaseline: 'alphabetic',
  } as unknown as CanvasRenderingContext2D;
}

function fakeCanvas(ctx: CanvasRenderingContext2D | null = fakeCtx()): HTMLCanvasElement {
  return {
    width: 0,
    height: 0,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
}

function baseDeps(over: Partial<PosterDeps> = {}): Partial<PosterDeps> {
  const blob = new Blob([new Uint8Array(1024)], { type: 'image/png' });
  return {
    devicePixelRatio: 2,
    settleFonts: async () => undefined,
    createCanvas: () => fakeCanvas(),
    toBlob: async () => blob,
    toDataURL: () => 'data:image/png;base64,AAAA',
    createObjectURL: () => 'blob:fake-url',
    revokeObjectURL: () => undefined,
    isCanvasTainted: () => false,
    downloadable: true,
    ...over,
  };
}

describe('pickScale（DPR 适配）', () => {
  it('至少 2x：DPR=1 时仍产出 2x', () => {
    expect(pickScale(1)).toBe(2);
  });
  it('跟随 DPR：DPR=2.75 → 2.75', () => {
    expect(pickScale(2.75)).toBe(2.75);
  });
  it('封顶 3x，防大画布 OOM', () => {
    expect(pickScale(4)).toBe(3);
  });
  it('非法 DPR 回退 2x', () => {
    expect(pickScale(Number.NaN)).toBe(2);
    expect(pickScale(0)).toBe(2);
    expect(pickScale(-3)).toBe(2);
  });
});

describe('archiveNo（卷宗号）', () => {
  it('取 id 末段数字补零', () => {
    expect(archiveNo('mem-coke-003')).toBe('ARCH·0003');
    expect(archiveNo('an-diga-002')).toBe('ARCH·0002');
    expect(archiveNo('mem-gulumao-021')).toBe('ARCH·0021');
  });
  it('无数字时给占位，不显示别人的名字', () => {
    expect(archiveNo('x')).toBe('ARCH····');
    expect(archiveNo('')).toBe('ARCH····');
  });
});

describe('formatPosterPercent（与引擎 formatPercent 同口径）', () => {
  it('正常值取整加 %', () => {
    expect(formatPosterPercent(74)).toBe('74%');
    expect(formatPosterPercent(86.6)).toBe('87%');
  });
  it('<10 显示 <10%', () => {
    expect(formatPosterPercent(9)).toBe('<10%');
  });
  it('越界夹到 0–100', () => {
    expect(formatPosterPercent(140)).toBe('100%');
    expect(formatPosterPercent(-5)).toBe('<10%');
  });
  it('null 显示占位符，不显示假数字', () => {
    expect(formatPosterPercent(null)).toBe('—');
  });
});

describe('renderPoster · 正常路径', () => {
  it('返回 ok + blob URL + 尺寸，且实际发生绘制', async () => {
    const ctx = fakeCtx();
    const res = await renderPoster(DATA, baseDeps({ createCanvas: () => fakeCanvas(ctx) }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.url).toBe('blob:fake-url');
    expect(res.width).toBe(POSTER_LAYOUT.width * 2);
    expect(res.height).toBe(POSTER_LAYOUT.height * 2);
    expect(res.blob.size).toBeGreaterThan(0);
    expect(ctx.fillText).toHaveBeenCalled();
    // 画了人物名
    const texts = (ctx.fillText as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]));
    expect(texts).toContain('奶龙');
  });

  it('DPR=1 时仍按 2x 出图', async () => {
    const res = await renderPoster(DATA, baseDeps({ devicePixelRatio: 1 }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.width).toBe(POSTER_LAYOUT.width * 2);
  });
});

describe('renderPoster · 异常路径', () => {
  it('字体就绪失败 → FONT_FAILED，不出错图', async () => {
    const res = await renderPoster(
      DATA,
      baseDeps({
        settleFonts: async () => {
          throw new Error('fonts not ready');
        },
      }),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('FONT_FAILED');
    expect(res.message.length).toBeGreaterThan(0);
  });

  it('toBlob 返回 null → 回退 toDataURL 成功', async () => {
    const toDataURL = vi.fn(() => 'data:image/png;base64,AAAA');
    const res = await renderPoster(
      DATA,
      baseDeps({ toBlob: async () => null, toDataURL }),
    );
    expect(res.ok).toBe(true);
    // 回退路径确实被走到：toDataURL 被调用一次
    expect(toDataURL).toHaveBeenCalledTimes(1);
  });

  it('toBlob 抛异常 → 回退 toDataURL 成功', async () => {
    const res = await renderPoster(
      DATA,
      baseDeps({
        toBlob: async () => {
          throw new Error('blob explode');
        },
      }),
    );
    expect(res.ok).toBe(true);
  });

  it('toBlob=null 且 toDataURL 抛错 → EXPORT_FAILED', async () => {
    const res = await renderPoster(
      DATA,
      baseDeps({
        toBlob: async () => null,
        toDataURL: () => {
          throw new Error('security error');
        },
      }),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('EXPORT_FAILED');
  });

  it('toBlob=null 且 toDataURL 返回空串 → EXPORT_FAILED', async () => {
    const res = await renderPoster(DATA, baseDeps({ toBlob: async () => null, toDataURL: () => '' }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('EXPORT_FAILED');
  });

  it('导出零字节 blob → EXPORT_EMPTY', async () => {
    const res = await renderPoster(DATA, baseDeps({ toBlob: async () => new Blob([]) }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('EXPORT_EMPTY');
  });

  it('拿不到 2d context → CANVAS_UNSUPPORTED', async () => {
    const res = await renderPoster(DATA, baseDeps({ createCanvas: () => fakeCanvas(null) }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('CANVAS_UNSUPPORTED');
  });

  it('创建画布返回 null → CANVAS_UNSUPPORTED', async () => {
    const res = await renderPoster(DATA, baseDeps({ createCanvas: () => null }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('CANVAS_UNSUPPORTED');
  });

  it('画布被跨域污染（toBlob 抛 SecurityError）→ CANVAS_TAINTED', async () => {
    const res = await renderPoster(
      DATA,
      baseDeps({
        toBlob: async () => {
          throw new Error('SecurityError: Tainted canvases may not be exported.');
        },
      }),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('CANVAS_TAINTED');
  });

  it('注入的 isCanvasTainted 判定为污染 → CANVAS_TAINTED', async () => {
    const res = await renderPoster(
      DATA,
      baseDeps({
        toBlob: async () => {
          throw new Error('boom');
        },
        isCanvasTainted: () => true,
      }),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('CANVAS_TAINTED');
  });

  it('createObjectURL 抛错 → EXPORT_FAILED，不把异常抛给 UI', async () => {
    const res = await renderPoster(
      DATA,
      baseDeps({
        createObjectURL: () => {
          throw new Error('no blob support');
        },
      }),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('EXPORT_FAILED');
  });

  it('所有失败分支都带可读中文提示（不允许空 message）', async () => {
    const cases: Array<Partial<PosterDeps>> = [
      { settleFonts: async () => { throw new Error('x'); } },
      { createCanvas: () => null },
      { toBlob: async () => null, toDataURL: () => '' },
      { toBlob: async () => new Blob([]) },
    ];
    for (const over of cases) {
      const res = await renderPoster(DATA, baseDeps(over));
      expect(res.ok).toBe(false);
      if (res.ok) continue;
      expect(res.message.trim().length).toBeGreaterThan(0);
      expect(res.message).not.toMatch(/undefined|null/);
    }
  });
});

describe('画布污染兜底', () => {
  it('绘制抛 tainted 错误 → CANVAS_TAINTED', async () => {
    const ctx = fakeCtx();
    (ctx as unknown as { fillText: () => never }).fillText = () => {
      throw new Error('The canvas has been tainted by cross-origin data');
    };
    const res = await renderPoster(DATA, baseDeps({ createCanvas: () => fakeCanvas(ctx) }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('CANVAS_TAINTED');
  });

  it('绘制抛其他错误 → EXPORT_FAILED，不把异常抛给 UI', async () => {
    const ctx = fakeCtx();
    (ctx as unknown as { fillText: () => never }).fillText = () => {
      throw new Error('boom');
    };
    const res = await renderPoster(DATA, baseDeps({ createCanvas: () => fakeCanvas(ctx) }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('EXPORT_FAILED');
  });
});

describe('renderPoster · 边界数据', () => {
  it('没有匹配结果（name 空、percent=null）也能出图，不抛错', async () => {
    const res = await renderPoster(
      { ...DATA, personaName: '', percent: null, tags: [] },
      baseDeps(),
    );
    expect(res.ok).toBe(true);
  });

  it('超长姓名与超多标签不溢出（截断后仍出图）', async () => {
    const res = await renderPoster(
      {
        ...DATA,
        personaName: '一个非常非常长的人物名字用于验证截断逻辑不会溢出画布',
        tags: ['标签一', '标签二', '标签三', '标签四', '标签五'],
      },
      baseDeps(),
    );
    expect(res.ok).toBe(true);
  });
});
