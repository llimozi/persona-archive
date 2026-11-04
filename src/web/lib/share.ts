/**
 * 结果链接编解码（纯前端，无后端依赖）。
 *
 * 设计取舍：
 * - 不用随机 token + 服务端存储（MVP 不引存储），改用「答案序列」自包含：
 *   `?r=<base64url(JSON)>`，任何人打开都能复现同一份结果。
 * - 只编码 answers（题目 id → 选项 id），不编码人物结论；结论由引擎/前端重新计算得出，
 *   避免「链接里的结论」与「当前引擎」不一致。
 * - 数据量：10 题 options 极短，base64url 后约 120–160 字符，微信里不显脏。
 */

import type { Answers } from './api';

const PARAM = 'r';

/** UTF-8 安全的 base64url 编解码（微信内置浏览器对 btoa 的非 ASCII 支持不一致，先转 UTF-8） */
function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** 把答案编码成可放 URL 的字符串 */
export function encodeAnswers(answers: Answers): string {
  const qs = Object.keys(answers).sort();
  const pairs = qs.map((q) => [q, answers[q]] as [string, string]);
  return toBase64Url(JSON.stringify(pairs));
}

/** 解码；任何异常一律返回 null，由调用方降级为首页，不抛错给用户看 */
export function decodeAnswers(token: string): Answers | null {
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(token));
    if (!Array.isArray(parsed)) return null;
    const out: Answers = {};
    for (const row of parsed) {
      if (!Array.isArray(row) || row.length !== 2) return null;
      const [q, o] = row;
      if (typeof q !== 'string' || typeof o !== 'string' || !q || !o) return null;
      out[q] = o;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

/** 生成结果链接（不含 token 参数的其他 query 保留） */
export function buildShareUrl(answers: Answers): string {
  const url = new URL(location.href);
  url.searchParams.set(PARAM, encodeAnswers(answers));
  url.hash = '';
  return url.toString();
}

/** 从当前地址读取结果 token */
export function readTokenFromUrl(): string | null {
  try {
    return new URL(location.href).searchParams.get(PARAM);
  } catch {
    return null;
  }
}

/** 把 ?r= 从地址栏抹掉（重测时用），避免反复分享同一份旧结果 */
export function clearTokenInUrl(): void {
  try {
    const url = new URL(location.href);
    if (!url.searchParams.has(PARAM)) return;
    url.searchParams.delete(PARAM);
    history.replaceState(null, '', url.toString());
  } catch {
    /* 忽略 */
  }
}
