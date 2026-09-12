import { fmtBR, xAxisWeekIndexes } from "../lib/dates";

export default function WorkoutChart({ counts, weeks }) {
  const W = 600, H = 165, PADX = 26, PADTOP = 34, PADBOTTOM = 38;
  const max = Math.max(1, ...counts.map((v) => v || 0));
  const n = counts.length;
  const barAreaW = W - PADX * 2;
  const barW = barAreaW / n;
  const chartH = H - PADTOP - PADBOTTOM;
  const py = (v) => H - PADBOTTOM - (v / max) * chartH;
  const last = counts.length ? counts[counts.length - 1] : 0;
  const idxs = xAxisWeekIndexes(weeks);
  return (
    <div className="card">
      <h2 className="sec">Frequência de treino — sessões concluídas por semana</h2>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 165, display: "block" }} role="img" aria-label="Gráfico de frequência de treino, sessões concluídas por semana">
        <title>Frequência de treino — sessões concluídas por semana</title>
        <line x1={PADX} x2={W - PADX} y1={py(0)} y2={py(0)} stroke="var(--line)" />
        <text x={PADX} y={py(max) - 6} fontSize="22" fill="var(--muted)">{max}x</text>
        <text x={PADX} y={py(0) - 6} fontSize="22" fill="var(--muted)">0</text>
        {counts.map((c, i) => {
          const v = c || 0;
          const barH = py(0) - py(v);
          return <rect key={i} x={PADX + i * barW + 1} y={py(v)} width={Math.max(1, barW - 2)} height={Math.max(1, barH)} fill="#46B98A" rx="2" />;
        })}
        {idxs.map((i) => (
          <text key={i} x={PADX + i * barW + barW / 2} y={H - 10} fontSize="22" fill="var(--muted)"
            textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>
            {fmtBR(weeks[i].start)}
          </text>
        ))}
      </svg>
      <p className="small muted" style={{ marginTop: 8 }}>Última semana: {last}x · máximo no período: {max}x</p>
    </div>
  );
}
