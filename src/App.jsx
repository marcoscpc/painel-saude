import React, { useState, useEffect, useMemo, useCallback } from "react";
import { sendMagicLink, signOut, watchSession } from "./lib/auth";
import { supabase } from "./lib/supabaseClient";
import {
  fetchBpReadings, fetchBodyWeight, fetchBodyMeasurements, fetchWorkoutSessions, fetchWorkoutExercises,
} from "./lib/data";

const FORJA_URL = "https://forja-five.vercel.app";
const PA_URL = "https://registro-pa.vercel.app";
const PERIODS = [30, 90, 365];

/* ============================ Datas ============================ */
const todayStr = () => isoOf(new Date());
function isoOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const isoDaysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return isoOf(d); };
const fmtBR = (iso) => { const [, m, d] = iso.split("-"); return `${d}/${m}`; };
const fmtBRFull = (iso) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const fmtHora = (ts) => new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const fmtSecs = (n) => {
  const v = Math.round(n);
  if (v < 60) return `${v}s`;
  const m = Math.floor(v / 60), s = v % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const MEAS_FIELDS = [
  ["quadril", "Quadril"], ["cintura", "Cintura"], ["busto", "Busto"],
  ["abaixo_busto", "Abaixo do busto"], ["braco_esq", "Braço esq."], ["braco_dir", "Braço dir."],
];

// Divide os últimos `days` dias em blocos de 7, do mais antigo pro mais recente —
// é a granularidade usada no gráfico combinado pra deixar pressão, peso e treino comparáveis.
function buildWeeks(days) {
  const n = Math.max(2, Math.ceil(days / 7));
  const today = new Date();
  const weeks = [];
  for (let i = n - 1; i >= 0; i--) {
    const end = new Date(today); end.setDate(end.getDate() - i * 7);
    const start = new Date(end); start.setDate(start.getDate() - 6);
    weeks.push({ start: isoOf(start), end: isoOf(end) });
  }
  return weeks;
}
const inWeek = (dateStr, w) => dateStr >= w.start && dateStr <= w.end;

/* ============================ Classificação de pressão (mesma regra do registro-pa) ============================ */
const CATS = ["Normal", "Pré-hipertensão", "HAS estágio 1", "HAS estágio 2", "HAS estágio 3"];
const cSys = (s) => (s >= 180 ? 4 : s >= 160 ? 3 : s >= 140 ? 2 : s >= 120 ? 1 : 0);
const cDia = (d) => (d >= 110 ? 4 : d >= 100 ? 3 : d >= 90 ? 2 : d >= 80 ? 1 : 0);
const classify = (s, d) => CATS[Math.max(cSys(s), cDia(d))];

/* ============================ Agregação semanal ============================ */
function weeklyBpAvg(rows, weeks) {
  return weeks.map((w) => {
    const rs = rows.filter((r) => inWeek(r.ts.slice(0, 10), w));
    if (!rs.length) return { sys: null, dia: null };
    return {
      sys: rs.reduce((a, r) => a + r.sys, 0) / rs.length,
      dia: rs.reduce((a, r) => a + r.dia, 0) / rs.length,
    };
  });
}
function weeklyAvg(rows, key, weeks) {
  return weeks.map((w) => {
    const rs = rows.filter((r) => inWeek(r.date, w) && r[key] != null);
    if (!rs.length) return null;
    return rs.reduce((a, r) => a + r[key], 0) / rs.length;
  });
}
function weeklyWorkoutCount(rows, weeks) {
  return weeks.map((w) => rows.filter((r) => inWeek(r.date, w) && r.done).length);
}

// Várias séries (podem ter buracos) no mesmo eixo Y real, em vez de normalizadas —
// só faz sentido quando as séries compartilham unidade (ex.: sistólica + diastólica, ambas mmHg).
function multiSeriesRealPoints(seriesList, w, h, padX, padY) {
  const allVals = seriesList.flatMap((s) => s.values.filter((v) => v != null && !Number.isNaN(v)));
  if (!allVals.length) return null;
  let lo = Math.min(...allVals), hi = Math.max(...allVals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.12;
  lo -= pad; hi += pad;
  const n = seriesList[0].values.length - 1 || 1;
  const px = (i) => padX + (i / n) * (w - padX * 2);
  const py = (v) => h - padY - ((v - lo) / (hi - lo)) * (h - padY * 2);
  return {
    lo, hi,
    series: seriesList.map((s) => ({
      ...s,
      pts: s.values.map((v, i) => (v == null || Number.isNaN(v) ? null : { x: px(i), y: py(v) })).filter(Boolean),
    })),
  };
}
const toPolyline = (pts) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
const lastValue = (values) => { for (let i = values.length - 1; i >= 0; i--) if (values[i] != null) return values[i]; return null; };

/* ============================ Estilos ============================ */
const CSS = `
.ps *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.ps{--bg:#12151A;--bg2:#191D24;--card:#1D222A;--card2:#252B34;--line:#2E3440;
  --text:#ECEEF2;--muted:#8B93A1;--acc:#4FA3E0;--accd:#3679AE;--good:#46B98A;--bad:#E06A5B;--chip:#20262F;
  background:var(--bg);color:var(--text);min-height:100vh;display:flex;flex-direction:column;
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  max-width:640px;margin:0 auto;line-height:1.35;}
.ps header{position:sticky;top:0;z-index:10;background:var(--bg);padding:16px 16px 10px;
  display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid var(--line)}
.ps .brand{font-weight:800;letter-spacing:-.02em;font-size:18px}
.ps .brand .sub{display:block;font-size:11.5px;font-weight:500;color:var(--muted)}
.ps .main{flex:1;padding:16px 16px 40px}
.ps .muted{color:var(--muted)}
.ps .small{font-size:12px}
.ps .card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px}
.ps .card+.card{margin-top:14px}
.ps h2.sec{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:0 0 12px;font-weight:700}
.ps button{font:inherit;cursor:pointer;border:none;background:none;color:inherit}
.ps .btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border-radius:12px;padding:11px 14px;
  font-weight:700;font-size:14px;background:var(--card2);border:1px solid var(--line);color:var(--text);min-height:44px}
.ps .btn.pri{background:var(--acc);color:#08151F;border-color:var(--acc)}
.ps .btn.pri:disabled{opacity:.5}
.ps .btn.blk{width:100%}
.ps .btn.sm{padding:8px 12px;min-height:36px;font-size:13px;border-radius:10px}
.ps .chip{padding:9px 14px;border-radius:999px;background:var(--chip);border:1px solid var(--line);font-weight:700;font-size:13.5px;min-height:38px}
.ps .chip.on{background:var(--acc);color:#08151F;border-color:var(--acc)}
.ps .row{display:flex;align-items:center;gap:8px}
.ps .wrap{display:flex;flex-wrap:wrap;gap:8px}
.ps .inp{width:100%;background:var(--bg2);border:1px solid var(--line);border-radius:10px;color:var(--text);
  padding:11px 12px;font-size:15px;min-height:44px}
.ps .inp:focus{outline:none;border-color:var(--acc)}
.ps .tabbar{display:flex;gap:8px;margin-bottom:14px}
.ps .tab{flex:1;text-align:center;padding:10px 6px;border-radius:12px;background:var(--card);border:1px solid var(--line);font-weight:700;color:var(--muted)}
.ps .tab.on{color:var(--acc);border-color:var(--acc)}
.ps .legend{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px;font-size:12.5px}
.ps .legend .dot{width:9px;height:9px;border-radius:999px;display:inline-block;margin-right:5px}
.ps .empty{padding:20px 0;text-align:center;color:var(--muted);font-size:13.5px}
.ps textarea.inp{min-height:160px;resize:vertical;font-family:ui-monospace,"SF Mono",monospace;font-size:12px}
.ps a.link{color:var(--acc);text-decoration:none;font-weight:700}
.ps .splash{flex:1;display:flex;align-items:center;justify-content:center;color:var(--muted)}
`;

/* ============================ App ============================ */
export default function App() {
  const [session, setSession] = useState(undefined); // undefined = carregando sessão
  useEffect(() => watchSession(setSession), []);

  return (
    <div className="ps">
      <style>{CSS}</style>
      {session === undefined ? (
        <div className="splash">Carregando…</div>
      ) : !supabase ? (
        <MissingConfig />
      ) : !session ? (
        <Login />
      ) : (
        <Dashboard session={session} />
      )}
    </div>
  );
}

function MissingConfig() {
  return (
    <div className="main">
      <div className="card">
        <h2 className="sec">Configuração pendente</h2>
        <p className="small muted">
          Faltam as variáveis <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (arquivo <code>.env.local</code>). Veja o <code>README.md</code>.
        </p>
      </div>
    </div>
  );
}

/* ============================ Login ============================ */
function Login() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState(null); // {kind:'ok'|'err', text}
  const [sending, setSending] = useState(false);

  const send = async () => {
    const e = email.trim();
    if (!e) { setStatus({ kind: "err", text: "Digite um e-mail." }); return; }
    setSending(true); setStatus(null);
    try {
      const { error } = await sendMagicLink(e);
      setStatus(error
        ? { kind: "err", text: "Erro: " + error.message }
        : { kind: "ok", text: "Link enviado! Confira seu e-mail e abra o link neste mesmo aparelho." });
    } catch (err) {
      setStatus({ kind: "err", text: "Não foi possível enviar agora. Tente de novo." });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <header>
        <div className="brand">Painel-Saúde<span className="sub">Fase D</span></div>
      </header>
      <div className="main">
        <div className="card">
          <h2 className="sec">Entrar</h2>
          <p className="small muted" style={{ marginBottom: 12 }}>
            Use o mesmo e-mail que você já conectou no Forja ou no registro-pa — é lá que os dados são enviados.
          </p>
          <div className="row" style={{ marginBottom: 10 }}>
            <input className="inp" type="email" placeholder="seu@email.com" value={email}
              onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
          </div>
          <button className="btn pri blk" disabled={sending} onClick={send}>
            {sending ? "Enviando…" : "Enviar link mágico"}
          </button>
          {status && (
            <p className="small" style={{ marginTop: 10, color: status.kind === "err" ? "var(--bad)" : "var(--good)" }}>
              {status.text}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

/* ============================ Dashboard ============================ */
function Dashboard({ session }) {
  const [period, setPeriod] = useState(90);
  const [tab, setTab] = useState("painel");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [bp, setBp] = useState([]);
  const [bw, setBw] = useState([]);
  const [meas, setMeas] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [exercises, setExercises] = useState([]);

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    const from = isoDaysAgo(period);
    const to = todayStr();
    Promise.allSettled([
      fetchBpReadings(from + "T00:00:00.000Z", to + "T23:59:59.999Z"),
      fetchBodyWeight(from, to),
      fetchBodyMeasurements(from, to),
      fetchWorkoutSessions(from, to),
      fetchWorkoutExercises(from, to),
    ]).then(([bpR, bwR, measR, woR, exR]) => {
      if (!alive) return;
      setBp(bpR.status === "fulfilled" ? bpR.value : []);
      setBw(bwR.status === "fulfilled" ? bwR.value : []);
      setMeas(measR.status === "fulfilled" ? measR.value : []);
      setWorkouts(woR.status === "fulfilled" ? woR.value : []);
      setExercises(exR.status === "fulfilled" ? exR.value : []);
      const failed = [bpR, bwR, measR, woR, exR].find((r) => r.status === "rejected");
      setErr(failed ? failed.reason?.message || "Erro ao carregar dados" : null);
    }).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [period]);

  return (
    <>
      <header>
        <div className="brand">Painel-Saúde<span className="sub">{session.user.email}</span></div>
        <button className="btn sm" onClick={signOut}>Sair</button>
      </header>
      <div className="main">
        <div className="tabbar">
          <button className={"tab" + (tab === "painel" ? " on" : "")} onClick={() => setTab("painel")}>Painel</button>
          <button className={"tab" + (tab === "relatorios" ? " on" : "")} onClick={() => setTab("relatorios")}>Relatórios</button>
          <button className={"tab" + (tab === "atalhos" ? " on" : "")} onClick={() => setTab("atalhos")}>Atalhos</button>
        </div>

        {tab === "painel" && (
          <PainelTab period={period} setPeriod={setPeriod} loading={loading} err={err}
            bp={bp} bw={bw} workouts={workouts} />
        )}
        {tab === "relatorios" && (
          <RelatoriosTab defaultFrom={isoDaysAgo(period)} defaultTo={todayStr()}
            bp={bp} bw={bw} meas={meas} workouts={workouts} exercises={exercises} />
        )}
        {tab === "atalhos" && <AtalhosTab />}
      </div>
    </>
  );
}

/* ---------- Painel: um gráfico por métrica, todos na mesma linha do tempo ---------- */
function PainelTab({ period, setPeriod, loading, err, bp, bw, workouts }) {
  const weeks = useMemo(() => buildWeeks(period), [period]);
  const sysSeries = useMemo(() => weeklyBpAvg(bp, weeks).map((w) => w.sys), [bp, weeks]);
  const diaSeries = useMemo(() => weeklyBpAvg(bp, weeks).map((w) => w.dia), [bp, weeks]);
  const kgSeries = useMemo(() => weeklyAvg(bw, "kg", weeks), [bw, weeks]);
  const woSeries = useMemo(() => weeklyWorkoutCount(workouts, weeks), [workouts, weeks]);

  const anyBp = sysSeries.some((v) => v != null);
  const anyKg = kgSeries.some((v) => v != null);
  const anyWo = woSeries.some((v) => v);
  const anyData = anyBp || anyKg || anyWo;

  return (
    <>
      <div className="wrap" style={{ marginBottom: 14 }}>
        {PERIODS.map((d) => (
          <button key={d} className={"chip" + (d === period ? " on" : "")} onClick={() => setPeriod(d)}>
            {d === 365 ? "12 meses" : `${d} dias`}
          </button>
        ))}
      </div>
      {loading && <div className="card"><div className="empty">Carregando…</div></div>}
      {!loading && err && <div className="card"><div className="empty">Não foi possível carregar: {err}</div></div>}
      {!loading && !err && !anyData && (
        <div className="card"><div className="empty">Sem dados sincronizados neste período ainda.</div></div>
      )}
      {!loading && !err && anyBp && <BpChart sys={sysSeries} dia={diaSeries} />}
      {!loading && !err && anyKg && <WeightChart kg={kgSeries} />}
      {!loading && !err && anyWo && <WorkoutChart counts={woSeries} />}
    </>
  );
}

function BpChart({ sys, dia }) {
  const W = 600, H = 160, PADX = 10, PADY = 16;
  const chart = multiSeriesRealPoints(
    [{ key: "sys", label: "Sistólica", color: "#E06A5B", values: sys },
     { key: "dia", label: "Diastólica", color: "#F2A93B", values: dia }],
    W, H, PADX, PADY
  );
  if (!chart) return null;
  return (
    <div className="card">
      <h2 className="sec">Pressão arterial — média semanal (mmHg)</h2>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 160, display: "block" }}>
        <text x={PADX} y="10" fontSize="9" fill="var(--muted)">{chart.hi.toFixed(0)}</text>
        <text x={PADX} y={H - 2} fontSize="9" fill="var(--muted)">{chart.lo.toFixed(0)}</text>
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

function WeightChart({ kg }) {
  const W = 600, H = 140, PADX = 10, PADY = 16;
  const chart = multiSeriesRealPoints([{ key: "kg", color: "#4FA3E0", values: kg }], W, H, PADX, PADY);
  if (!chart) return null;
  const s = chart.series[0];
  const last = lastValue(kg);
  return (
    <div className="card">
      <h2 className="sec">Peso corporal — média semanal (kg)</h2>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 140, display: "block" }}>
        <text x={PADX} y="10" fontSize="9" fill="var(--muted)">{chart.hi.toFixed(1)}</text>
        <text x={PADX} y={H - 2} fontSize="9" fill="var(--muted)">{chart.lo.toFixed(1)}</text>
        <polyline fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" points={toPolyline(s.pts)} />
        {s.pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2.3" fill={s.color} />)}
      </svg>
      {last != null && <p className="small muted" style={{ marginTop: 8 }}>Último: {last.toFixed(1)}kg</p>}
    </div>
  );
}

function WorkoutChart({ counts }) {
  const W = 600, H = 90, PAD = 10;
  const max = Math.max(1, ...counts.map((v) => v || 0));
  const n = counts.length;
  const barW = (W - PAD * 2) / n;
  const last = counts.length ? counts[counts.length - 1] : 0;
  return (
    <div className="card">
      <h2 className="sec">Frequência de treino — sessões concluídas por semana</h2>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 70, display: "block" }}>
        {counts.map((c, i) => {
          const v = c || 0;
          const barH = (v / max) * (H - PAD * 2);
          return <rect key={i} x={PAD + i * barW + 1} y={H - PAD - barH} width={Math.max(1, barW - 2)} height={Math.max(1, barH)} fill="#46B98A" rx="2" />;
        })}
      </svg>
      <p className="small muted" style={{ marginTop: 8 }}>Última semana: {last}x · máximo no período: {max}x</p>
    </div>
  );
}

/* ---------- Relatórios por especialista ---------- */
function RelatoriosTab({ defaultFrom, defaultTo, bp, bw, meas, workouts, exercises }) {
  const [tipo, setTipo] = useState("fisio");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [flash, setFlash] = useState(null);

  const inRange = useCallback((dateStr) => dateStr >= from && dateStr <= to, [from, to]);

  const fisioText = useMemo(() => {
    const w = bw.filter((e) => inRange(e.date));
    const m = meas.filter((e) => inRange(e.date));
    const wo = workouts.filter((e) => inRange(e.date));
    const byDate = {};
    w.forEach((e) => { byDate[e.date] = byDate[e.date] || {}; byDate[e.date].kg = e.kg; });
    m.forEach((e) => {
      byDate[e.date] = byDate[e.date] || {};
      MEAS_FIELDS.forEach(([k]) => { if (e[k] != null) byDate[e.date][k] = e[k]; });
    });
    const dates = Object.keys(byDate).sort();
    const lines = [`Peso e medidas corporais — ${fmtBRFull(from)} a ${fmtBRFull(to)}`, ""];
    if (dates.length) {
      dates.forEach((d) => {
        const r = byDate[d];
        const parts = [];
        if (r.kg != null) parts.push(`Peso: ${r.kg}kg`);
        MEAS_FIELDS.forEach(([k, label]) => { if (r[k] != null) parts.push(`${label}: ${r[k]}cm`); });
        lines.push(`${fmtBR(d)} — ${parts.join(" · ")}`);
      });
    } else lines.push("Sem registros de peso ou medidas no período.");
    lines.push("");

    const ex = exercises.filter((e) => inRange(e.date));
    const fmtExVal = (e) => (e.top_kg != null ? `${e.exercise_name} ${e.top_kg}kg` : e.top_duration_secs != null ? `${e.exercise_name} ${fmtSecs(e.top_duration_secs)}` : e.exercise_name);
    lines.push("Exercícios do período:");
    if (ex.length) {
      const byDate = {};
      ex.forEach((e) => { (byDate[e.date] = byDate[e.date] || []).push(e); });
      Object.keys(byDate).sort().forEach((d) => {
        const items = byDate[d];
        lines.push(`${fmtBR(d)} (${items[0].ficha_name}): ${items.map(fmtExVal).join(" · ")}`);
      });
    } else lines.push("Sem detalhe de exercícios sincronizado no período.");
    lines.push("");

    const byExercise = {};
    ex.forEach((e) => { (byExercise[e.exercise_name] = byExercise[e.exercise_name] || []).push(e); });
    const progressions = Object.keys(byExercise).sort().map((name) => {
      const arr = byExercise[name].sort((a, b) => (a.date < b.date ? -1 : 1));
      const first = arr[0], last = arr[arr.length - 1];
      if (arr.length < 2) return null;
      if (first.top_kg != null && last.top_kg != null) {
        const delta = last.top_kg - first.top_kg;
        return `${name}: ${first.top_kg}kg → ${last.top_kg}kg (${delta >= 0 ? "+" : ""}${delta}kg)`;
      }
      if (first.top_duration_secs != null && last.top_duration_secs != null) {
        const delta = last.top_duration_secs - first.top_duration_secs;
        return `${name}: ${fmtSecs(first.top_duration_secs)} → ${fmtSecs(last.top_duration_secs)} (${delta >= 0 ? "+" : ""}${fmtSecs(Math.abs(delta))})`;
      }
      return null;
    }).filter(Boolean);
    if (progressions.length) {
      lines.push("Progressão de carga no período:");
      progressions.forEach((p) => lines.push(p));
    } else lines.push("Progressão de carga: ainda não há 2+ registros do mesmo exercício no período para comparar.");
    lines.push("");

    const done = wo.filter((e) => e.done);
    const dayCount = Math.max(1, Math.round((new Date(to) - new Date(from)) / 864e5) + 1);
    const perWeek = (done.length / (dayCount / 7)).toFixed(1);
    lines.push(`Treino: ${done.length} sessões concluídas no período (${perWeek}/semana em média).`);
    return lines.join("\n");
  }, [bw, meas, workouts, exercises, from, to, inRange]);

  const cardioText = useMemo(() => {
    const r = bp.filter((e) => inRange(e.ts.slice(0, 10)));
    const w = bw.filter((e) => inRange(e.date));
    const lines = [`Pressão arterial e peso — ${fmtBRFull(from)} a ${fmtBRFull(to)}`, ""];
    if (r.length) {
      r.forEach((e) => {
        const ctx = e.ctx && e.ctx.length ? ` (${e.ctx.join(", ")})` : "";
        lines.push(`${fmtBR(e.ts.slice(0, 10))} ${fmtHora(e.ts)} — ${e.sys}/${e.dia} mmHg, pulso ${e.pul} — ${classify(e.sys, e.dia)}${ctx}`);
      });
      lines.push("");
      const avgSys = r.reduce((a, e) => a + e.sys, 0) / r.length;
      const avgDia = r.reduce((a, e) => a + e.dia, 0) / r.length;
      const cat = classify(avgSys, avgDia);
      const mrpa = avgSys >= 130 || avgDia >= 80;
      lines.push(`Média do período: ${avgSys.toFixed(0)}/${avgDia.toFixed(0)} mmHg em ${r.length} medições — ${cat}.`);
      lines.push(mrpa
        ? "Acima do limiar de referência domiciliar (130/80)."
        : "Dentro do limiar de referência domiciliar (130/80).");
    } else lines.push("Sem registros de pressão no período.");
    lines.push("");
    if (w.length) {
      lines.push("Peso:");
      w.forEach((e) => lines.push(`${fmtBR(e.date)} — ${e.kg}kg`));
    } else lines.push("Peso: sem registros no período.");
    return lines.join("\n");
  }, [bp, bw, from, to, inRange]);

  const text = tipo === "fisio" ? fisioText : cardioText;

  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch { /* cancelado, cai no copiar */ }
    }
    try { await navigator.clipboard.writeText(text); setFlash("Relatório copiado"); setTimeout(() => setFlash(null), 2500); }
    catch { setFlash("Não foi possível copiar — selecione o texto manualmente"); }
  };

  return (
    <div className="card">
      <h2 className="sec">Relatório por especialista</h2>
      <div className="wrap" style={{ marginBottom: 12 }}>
        <button className={"chip" + (tipo === "fisio" ? " on" : "")} onClick={() => setTipo("fisio")}>Fisioterapeuta</button>
        <button className={"chip" + (tipo === "cardio" ? " on" : "")} onClick={() => setTipo("cardio")}>Cardiologista</button>
      </div>
      <div className="row" style={{ marginBottom: 12, gap: 10 }}>
        <input className="inp" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        <input className="inp" type="date" value={to} min={from} max={todayStr()} onChange={(e) => setTo(e.target.value)} />
      </div>
      <textarea className="inp" readOnly value={text} />
      <button className="btn pri blk" style={{ marginTop: 12 }} onClick={share}>Compartilhar</button>
      {flash && <p className="small" style={{ marginTop: 8, color: "var(--good)" }}>{flash}</p>}
    </div>
  );
}

/* ---------- Atalhos ---------- */
function AtalhosTab() {
  return (
    <div className="card">
      <h2 className="sec">Registrar em outro app</h2>
      <p className="small muted" style={{ marginBottom: 14 }}>
        O Painel-Saúde só mostra dados — para registrar um treino novo, peso ou uma medição de pressão, use o app de origem.
      </p>
      <div className="row" style={{ marginBottom: 10 }}>
        <a className="btn blk" style={{ textDecoration: "none" }} href={FORJA_URL} target="_blank" rel="noopener noreferrer">Abrir Forja</a>
      </div>
      <div className="row">
        <a className="btn blk" style={{ textDecoration: "none" }} href={PA_URL} target="_blank" rel="noopener noreferrer">Abrir registro-pa</a>
      </div>
    </div>
  );
}
