import { multiSeriesRealPoints, toPolyline, lastValue } from "../lib/aggregations";
import { YGridLines, XAxisLabels } from "./ChartAxes";

export default function WeightChart({ kg, weeks }) {
  const W = 600, H = 200, PADX = 40, PADTOP = 34, PADBOTTOM = 44;
  const chart = multiSeriesRealPoints([{ key: "kg", color: "#4FA3E0", values: kg }], W, H, PADX, PADTOP, PADBOTTOM);
  if (!chart) return null;
  const s = chart.series[0];
  const last = lastValue(kg);
  return (
    <div className="card">
      <h2 className="sec">Peso corporal — média semanal (kg)</h2>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 200, display: "block" }} role="img" aria-label="Gráfico de peso corporal, média semanal, em quilogramas">
        <title>Peso corporal — média semanal (kg)</title>
        <YGridLines chart={chart} w={W} padX={PADX} decimals={1} />
        <XAxisLabels weeks={weeks} chart={chart} h={H} />
        <polyline fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" points={toPolyline(s.pts)} />
        {s.pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2.3" fill={s.color} />)}
      </svg>
      {last != null && <p className="small muted" style={{ marginTop: 8 }}>Último: {last.toFixed(1)}kg</p>}
    </div>
  );
}
