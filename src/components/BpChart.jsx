import { multiSeriesRealPoints, toPolyline, lastValue } from "../lib/aggregations";
import { YGridLines, XAxisLabels } from "./ChartAxes";

export default function BpChart({ sys, dia, weeks }) {
  const W = 600, H = 220, PADX = 36, PADTOP = 34, PADBOTTOM = 44;
  const chart = multiSeriesRealPoints(
    [{ key: "sys", label: "Sistólica", color: "#E06A5B", values: sys },
     { key: "dia", label: "Diastólica", color: "#F2A93B", values: dia }],
    W, H, PADX, PADTOP, PADBOTTOM
  );
  if (!chart) return null;
  return (
    <div className="card">
      <h2 className="sec">Pressão arterial — média semanal (mmHg)</h2>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 220, display: "block" }} role="img" aria-label="Gráfico de pressão arterial sistólica e diastólica, média semanal, em mmHg">
        <title>Pressão arterial — média semanal (mmHg)</title>
        <YGridLines chart={chart} w={W} padX={PADX} />
        <XAxisLabels weeks={weeks} chart={chart} h={H} />
        {chart.series.map((s) => (
          <polyline key={s.key} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" points={toPolyline(s.pts)} />
        ))}
      </svg>
      <div className="legend">
        {chart.series.map((s) => {
          const last = lastValue(s.values);
          return (
            <span key={s.key}><i className="dot" style={{ background: s.color }} />
              {s.label}{last != null ? `: ${last.toFixed(0)} mmHg` : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}
