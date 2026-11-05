import { useCallback, useEffect, useRef, useState } from 'react';
import { renderPoster, POSTER_LAYOUT, loadPosterImage } from '../lib/poster';
import { prefersReducedMotion } from '../lib/motion';
import type { PosterData, PosterResult } from '../lib/poster';

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; result: Extract<PosterResult, { ok: true }> }
  | { status: 'failed'; message: string; reason: string };

interface Props {
  data: PosterData | null;
  /** 结果链接：海报失败时兜底展示 */
  shareUrl: string;
  /** 打开（触发）时生成 */
  open: boolean;
  onClose: () => void;
  /** 给测试用的生成钩子，无 UI 用途 */
  onReady?: (result: Extract<PosterResult, { ok: true }>) => void;
}

/**
 * 分享海报面板。
 *
 * 渲染策略：
 * - 成功 → `<img>` 展示（不是直接下载 blob URL）→ 手机端可长按保存；
 * - 另给「下载」按钮（支持 download 属性时）；
 * - 失败 → 不崩不白屏，只显示可读提示 + 结果链接兜底。
 */
export function PosterSheet({ data, shareUrl, open, onClose, onReady }: Props) {
  const [state, setState] = useState<State>({ status: 'idle' });
  const [saved, setSaved] = useState(false);
  const urlRef = useRef<string | null>(null);

  const revoke = useCallback(() => {
    if (urlRef.current) {
      try {
        URL.revokeObjectURL(urlRef.current);
      } catch {
        /* 忽略 */
      }
      urlRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open || !data) return;
    let alive = true;
    setState({ status: 'loading' });
    // 先加载配图再绘制：图片失败返回 null，绘制层按无图处理，不阻断海报生成
    loadPosterImage(data.imageUrl)
      .then((image) => renderPoster({ ...data, image }))
      .then((res) => {
        if (!alive) {
          if (res.ok) {
            try {
              URL.revokeObjectURL(res.url);
            } catch {
              /* 忽略 */
            }
          }
          return;
        }
        if (res.ok) {
          revoke();
          urlRef.current = res.url;
          setState({ status: 'ready', result: res });
          onReady?.(res);
        } else {
          setState({ status: 'failed', message: res.message, reason: res.reason });
        }
      })
      .catch(() => {
        if (alive) {
          setState({
            status: 'failed',
            message: '海报生成出错，可以用下面的结果链接分享。',
            reason: 'UNEXPECTED',
          });
        }
      });
    return () => {
      alive = false;
    };
    // data 每次渲染是新对象，用内容签名作为依赖避免重复生成
  }, [open, data?.personaId, data?.personaName, data?.percent, data?.category]);

  useEffect(() => revoke, [revoke]);

  if (!open) return null;

  const download = () => {
    if (state.status !== 'ready') return;
    if (!prefersReducedMotion()) {
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1600);
    }
    try {
      const a = document.createElement('a');
      a.href = state.result.url;
      a.download = `persona-poster-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      setState({
        status: 'failed',
        message: '下载没成功，长按海报图片可以直接保存。',
        reason: 'DOWNLOAD_FAILED',
      });
    }
  };

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="分享海报" data-testid="poster-sheet">
      <div className="sheet__backdrop" onClick={onClose} />
      <div className="sheet__panel">
        <div className="sheet__head">
          <span className="sheet__title">分享海报</span>
          <button type="button" className="btn btn--quiet" onClick={onClose} aria-label="关闭海报">
            关闭
          </button>
        </div>

        {state.status === 'loading' && (
          <div
            className="poster__skeleton"
            style={{ aspectRatio: `${POSTER_LAYOUT.width} / ${POSTER_LAYOUT.height}` }}
            aria-busy="true"
            aria-label="海报生成中"
            data-testid="poster-loading"
          />
        )}

        {state.status === 'ready' && (
          <>
            <img
              className="poster__img is-developing"
              src={state.result.url}
              alt="我的互联网人物档案分享海报，长按可保存"
              data-testid="poster-img"
            />
            <p className="poster__hint">长按图片保存到相册</p>
            <button
              type="button"
              className={`btn btn--primary${saved ? ' save-ok' : ''}`}
              onClick={download}
              disabled={!state.result.downloadable}
              data-testid="poster-download"
            >
              {saved ? '已保存到相册' : '保存图片'}
            </button>
          </>
        )}

        {state.status === 'failed' && (
          <div className="poster__fallback" data-testid="poster-fallback" data-reason={state.reason}>
            <p className="notice notice--warn">{state.message}</p>
            <p className="poster__url" data-testid="poster-share-url">
              {shareUrl}
            </p>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                try {
                  void navigator.clipboard.writeText(shareUrl);
                } catch {
                  /* 剪贴板不可用时用户可手动长按复制 */
                }
              }}
            >
              复制结果链接
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
