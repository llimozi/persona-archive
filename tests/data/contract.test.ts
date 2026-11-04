/**
 * 数据契约校验：data/*.json 必须满足 src/shared/types.ts 的 Persona / Question 契约。
 * 责任人：风控审查（QA）。判据来源：docs/DEV-CONTROL.md §3「热点研究」行。
 *
 * 注意：本文件只校验结构，不校验内容真实性（真实性由内容数据自证来源）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DIM_KEYS = ['EE', 'ST', 'AC', 'HX', 'RB', 'SR'] as const;
const root = resolve(__dirname, '../..');

function readJson<T>(rel: string): T {
  const raw = readFileSync(resolve(root, rel), 'utf8');
  return JSON.parse(raw) as T;
}

type Persona = {
  id: string;
  name: string;
  category: string;
  tags: string[];
  dims: Record<string, number>;
  desc: string;
  placeholder?: boolean;
};

type Question = {
  id: string;
  title: string;
  options: Array<{ id: string; label: string; effects: Record<string, number> }>;
};

/** 兼容直接数组 / {personas:[]} / {items:[]} 三种落盘格式 */
function unwrap<T>(v: unknown, key: string): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of [key, 'items', 'data']) {
      if (Array.isArray(o[k])) return o[k] as T[];
    }
  }
  return [];
}

describe('data/personas.json 契约', () => {
  const file = readJson<unknown>('data/personas.json');
  const personas = unwrap<Persona>(file, 'personas');

  it('文件可解析且非空', () => {
    expect(Array.isArray(file) || typeof file === 'object').toBe(true);
    expect(personas.length).toBeGreaterThan(0);
  });

  it('每人物字段齐全', () => {
    for (const p of personas) {
      expect(p.id, `id 缺失: ${JSON.stringify(p).slice(0, 80)}`).toBeTruthy();
      expect(p.name, `${p.id}.name`).toBeTruthy();
      expect(typeof p.category, `${p.id}.category`).toBe('string');
      expect(Array.isArray(p.tags), `${p.id}.tags 应为数组`).toBe(true);
      expect(typeof p.desc, `${p.id}.desc`).toBe('string');
      expect(p.desc.length, `${p.id}.desc 为空`).toBeGreaterThan(0);
    }
  });

  it('dims 含齐六维且为 0–100 有限数', () => {
    for (const p of personas) {
      expect(p.dims, `${p.id}.dims 缺失`).toBeTypeOf('object');
      for (const k of DIM_KEYS) {
        const v = p.dims?.[k];
        expect(Number.isFinite(v), `${p.id}.dims.${k} 非有限数: ${v}`).toBe(true);
        expect(v, `${p.id}.dims.${k} 超出 0–100: ${v}`).toBeGreaterThanOrEqual(0);
        expect(v, `${p.id}.dims.${k} 超出 0–100: ${v}`).toBeLessThanOrEqual(100);
      }
      const extra = Object.keys(p.dims ?? {}).filter((k) => !DIM_KEYS.includes(k as never));
      expect(extra, `${p.id}.dims 含未定义维度: ${extra.join(',')}`).toEqual([]);
    }
  });

  /**
   * 量纲守卫（对齐内容数据 validate-data.mjs 与后端 checkDims 的 6 类注入用例）。
   * 为什么单独一条：混填小数 `{EE:0.78, ST:62, ...}` 每个值都在 [0,100] 内、也不是"六维全 ≤1"，
   * 上面的范围断言**全部放行**——它能抓"越界"，抓不到"量纲用错"。
   */
  it('dims 必须是 0–100 的整数（抓混填小数，非仅越界）', () => {
    for (const p of personas) {
      for (const k of DIM_KEYS) {
        const v = p.dims?.[k];
        if (v === undefined) continue;
        expect(
          Number.isInteger(v),
          `${p.id}.dims.${k}=${v} 不是整数（疑似 0–1 制混填或量纲错位）`,
        ).toBe(true);
      }
    }
  });

  it('不得整卡按 0–1 制填写（六维全部 ≤1 即判错档）', () => {
    for (const p of personas) {
      const vals = DIM_KEYS.map((k) => p.dims?.[k]).filter((v): v is number => typeof v === 'number');
      if (vals.length !== DIM_KEYS.length) continue;
      const allLeOne = vals.every((v) => v <= 1);
      // 单个维度小是合法值（1 分），整卡全 ≤1 才是量纲错档
      expect(allLeOne, `${p.id} 六维全部 ≤1（${vals.join('/')}），疑似按 0–1 制填写`).toBe(false);
    }
  });

  it('id 唯一', () => {
    const ids = personas.map((p) => p.id);
    expect(ids.length - new Set(ids).size, `重复 id: ${ids.filter((x, i) => ids.indexOf(x) !== i)}`).toBe(0);
  });

  it('素材红线：不得引入第三方图片（placeholder 不得为 false 且带图 url）', () => {
    for (const p of personas) {
      const anyP = p as unknown as Record<string, unknown>;
      const hasImageUrl = ['image', 'img', 'avatar', 'photo', 'portrait'].some(
        (k) => typeof anyP[k] === 'string' && /^https?:\/\//.test(anyP[k] as string),
      );
      if (hasImageUrl) {
        expect(p.placeholder, `${p.id} 含远程图片但未标 placeholder`).toBe(true);
      }
    }
  });
});

describe('data/questions.json 契约', () => {
  const file = readJson<unknown>('data/questions.json');
  const questions = unwrap<Question>(file, 'questions');

  it('文件可解析且非空', () => {
    expect(questions.length).toBeGreaterThan(0);
  });

  it('每题字段齐全，选项 ≥2', () => {
    for (const q of questions) {
      expect(q.id, `题目缺 id: ${JSON.stringify(q).slice(0, 80)}`).toBeTruthy();
      expect(q.title, `${q.id}.title`).toBeTruthy();
      expect(Array.isArray(q.options), `${q.id}.options 应为数组`).toBe(true);
      expect(q.options.length, `${q.id} 选项不足 2 个`).toBeGreaterThanOrEqual(2);
    }
  });

  it('选项 effects 只含六维且为有限数', () => {
    for (const q of questions) {
      for (const o of q.options) {
        expect(o.id, `${q.id} 选项缺 id`).toBeTruthy();
        expect(o.label, `${q.id}.${o.id}.label`).toBeTruthy();
        expect(o.effects, `${q.id}.${o.id}.effects 缺失`).toBeTypeOf('object');
        const keys = Object.keys(o.effects ?? {});
        expect(keys.length, `${q.id}.${o.id}.effects 为空`).toBeGreaterThan(0);
        for (const k of keys) {
          expect(DIM_KEYS.includes(k as never), `${q.id}.${o.id}.effects 含未定义维度 ${k}`).toBe(true);
          expect(Number.isFinite(o.effects[k]), `${q.id}.${o.id}.effects.${k} 非有限数`).toBe(true);
        }
      }
    }
  });

  it('题目 id 唯一，选项 id 在题内唯一', () => {
    const ids = questions.map((q) => q.id);
    expect(ids.length - new Set(ids).size).toBe(0);
    for (const q of questions) {
      const oids = q.options.map((o) => o.id);
      expect(oids.length - new Set(oids).size, `${q.id} 选项 id 重复`).toBe(0);
    }
  });
});
