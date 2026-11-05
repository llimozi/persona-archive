/**
 * 九维雷达图。
 *
 * 数据**只吃 DimScore[]**，与下方分数卡片读的是同一份结果，
 * 因此「雷达图上的分数」与「卡片上的分数」在结构上不可能不一致——
 * 这是用户要求的第 7 条验收（页面分数和雷达图分数必须一致）的实现方式，
 * 不是靠两处各算一遍再对齐。
 *
 * 九个轴的标签较长（如「社牛装逼指数」6 字），手机宽度放不下常规雷达图，
 * 所以标签按「轴的角度」分左右两栏外挂，而不是贴着顶点摆。
 */
import { NINE_DIMS, type DimScore } from '../../shared/nine-dims';

interface Props {
  dims: readonly DimScore[];
}

const SIZE = 300;
const CX = SIZE / 2;
const CY = SIZE / 2;
// 给外挂标签留出空间：9 边形半径略小
const R = 96;

/** 角度：从正上方开始顺时针，第 i 个轴 */
function angleOf(i: number, n: number): number {
  return -Math.PI / 2 + (i * 2 * Math.PI) / n;
}

function point(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

export function NineRadar({ dims }: Props) {
  const n = dims.length;
  if (!n) return null;

  const rings = [0.25, 0.5, 0.75, 1];
  const ringPaths = rings.map((k) => {
    const pts = Array.from({ length: n }, (_, i) => point(CX, CY, R * k, angleOf(i, n)));
    return `${pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} Z`;
  });

  // 真实数据：分数越高，顶点离圆心越远
  const dataPts = dims.map((d, i) => point(CX, CY, (Math.max(0, Math.min(100, d.score)) / 100) * R, angleOf(i, n)));
  const dataPath = `${dataPts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} Z`;

  return (
    <div className="nine-radar" data-testid="nine-radar">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="nine-radar__svg"
        role="img"
        aria-label={`九维雷达图：${dims.map((d) => `${d.dimensionName} ${d.score}`).join('，')}`}
      >
        {/* 网格环 */}
        {ringPaths.map((d, i) => (
          <path key={i} d={d} className="nine-radar__ring" />
        ))}
        {/* 轴线 */}
        {dims.map((d, i) => {
          const [x, y] = point(CX, CY, R, angleOf(i, n));
          return <line key={d.dimensionId} x1={CX} y1={CY} x2={x} y2={y} className="nine-radar__axis" />;
        })}
        {/* 数据多边形 */}
        <path d={dataPath} className="nine-radar__area" />
        {/* 顶点 */}
        {dataPts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3" className="nine-radar__dot" />
        ))}
        {/* 轴序编号 01–09，短而不会溢出 */}
        {dims.map((d, i) => {
          const [x, y] = point(CX, CY, R + 16, angleOf(i, n));
          return (
            <text key={d.dimensionId} x={x} y={y} className="nine-radar__no" textAnchor="middle" dominantBaseline="central">
              {String(d.order).padStart(2, '0')}
            </text>
          );
        })}
      </svg>

      {/* 外挂图例：右侧文字统一左对齐，避免九边形标签相互压住 */}
      <ul className="nine-radar__legend">
        {dims.map((d) => {
          const def = NINE_DIMS.find((x) => x.key === d.dimensionId);
          return (
            <li key={d.dimensionId} className={d.measured ? '' : 'is-insufficient'}>
              <span className="nine-radar__legend-no mono">{String(d.order).padStart(2, '0')}</span>
              <span className="nine-radar__legend-name">{def?.name ?? d.dimensionName}</span>
              <span className="nine-radar__legend-score mono">{d.measured ? d.score : '—'}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
