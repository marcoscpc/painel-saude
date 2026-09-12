import { fmtBR, xAxisWeekIndexes } from "../lib/dates";

export function YGridLines({ chart, w, padX, decimals = 0, unit = "" }) {
  return [chart.hi, chart.mid, chart.lo].map((v, i) => (
    <g key={i}>
      <line x1={padX} x2={w - padX} y1={chart.py(v)} y2={chart.py(v)} stroke="var(--line)" strokeDasharray="2 3" />
      <text x={padX} y={chart.py(v) - 6} fontSize="22" fill="var(--muted)">{v.toFixed(decimals)}{unit}</text>
    </g>
  ));
}

export function XAxisLabels({ weeks, chart, h }) {
  const idxs = xAxisWeekIndexes(weeks);
  return idxs.map((i) => (
    <text key={i} x={chart.px(i)} y={h - 10} fontSize="22" fill="var(--muted)"
      textAnchor={i === 0 ? "start" : i === weeks.length - 1 ? "end" : "middle"}>
      {fmtBR(weeks[i].start)}
    </text>
  ));
}
