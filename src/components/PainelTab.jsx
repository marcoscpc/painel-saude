import { useMemo } from "react";
import { buildWeeks, todayStr } from "../lib/dates";
import { weeklyBpAvg, weeklyAvg, weeklyWorkoutCount, weeklyActivityCount } from "../lib/aggregations";
import BpChart from "./BpChart";
import WeightChart from "./WeightChart";
import WorkoutChart from "./WorkoutChart";
import CardioChart from "./CardioChart";

/* ---------- Painel: um gráfico por métrica, todos na mesma linha do tempo ---------- */
export default function PainelTab({ from, to, setFrom, setTo, loading, err, bp, bw, workouts, activities }) {
  const weeks = useMemo(() => buildWeeks(from, to), [from, to]);
  const sysSeries = useMemo(() => weeklyBpAvg(bp, weeks).map((w) => w.sys), [bp, weeks]);
  const diaSeries = useMemo(() => weeklyBpAvg(bp, weeks).map((w) => w.dia), [bp, weeks]);
  const kgSeries = useMemo(() => weeklyAvg(bw, "kg", weeks), [bw, weeks]);
  const woSeries = useMemo(() => weeklyWorkoutCount(workouts, weeks), [workouts, weeks]);
  const cardioSeries = useMemo(() => weeklyActivityCount(activities, weeks), [activities, weeks]);

  const anyBp = sysSeries.some((v) => v != null);
  const anyKg = kgSeries.some((v) => v != null);
  const anyWo = woSeries.some((v) => v);
  const anyCardio = cardioSeries.some((v) => v);
  const anyData = anyBp || anyKg || anyWo || anyCardio;

  return (
    <>
      <div className="row" style={{ marginBottom: 14, gap: 10 }}>
        <input className="inp" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="Data inicial" />
        <input className="inp" type="date" value={to} min={from} max={todayStr()} onChange={(e) => setTo(e.target.value)} aria-label="Data final" />
      </div>
      {loading && <div className="card"><div className="empty">Carregando…</div></div>}
      {!loading && err && <div className="card"><div className="empty">Não foi possível carregar: {err}</div></div>}
      {!loading && !err && !anyData && (
        <div className="card"><div className="empty">Sem dados sincronizados neste período ainda.</div></div>
      )}
      {!loading && !err && anyBp && <BpChart sys={sysSeries} dia={diaSeries} weeks={weeks} />}
      {!loading && !err && anyKg && <WeightChart kg={kgSeries} weeks={weeks} />}
      {!loading && !err && anyWo && <WorkoutChart counts={woSeries} weeks={weeks} />}
      {!loading && !err && anyCardio && <CardioChart counts={cardioSeries} weeks={weeks} activities={activities} />}
    </>
  );
}
