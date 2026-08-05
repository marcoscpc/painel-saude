import React, { useState, useEffect, useMemo, useCallback } from "react";
import { sendMagicLink, signOut, watchSession, consumeAuthError } from "./lib/auth";
import { supabase } from "./lib/supabaseClient";
import {
  fetchBpReadings, fetchBodyWeight, fetchBodyMeasurements, fetchWorkoutSessions, fetchWorkoutExercises, fetchActivities,
} from "./lib/data";
import { connectStrava, getStravaStatus } from "./lib/strava";

const FORJA_URL = "https://forja-five.vercel.app";
const PA_URL = "https://registro-pa.vercel.app";

/* ============================ Datas ============================ */
const todayStr = () => isoOf(new Date());
function isoOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const isoDaysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return isoOf(d); };
const toLocalDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const daysBetween = (fromIso, toIso) => Math.round((toLocalDate(toIso) - toLocalDate(fromIso)) / 864e5);
const fmtBR = (iso) => { const [, m, d] = iso.split("-"); return `${d}/${m}`; };
const fmtBRFull = (iso) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const fmtHora = (ts) => new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const fmtSecs = (n) => {
  const v = Math.round(n);
  if (v < 60) return `${v}s`;
  const m = Math.floor(v / 60), s = v % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};
const fmtHoursMin = (secs) => {
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
};

const MEAS_FIELDS = [
  ["quadril", "Quadril"], ["cintura", "Cintura"], ["busto", "Busto"],
  ["abaixo_busto", "Abaixo do busto"], ["braco_esq", "Braço esq."], ["braco_dir", "Braço dir."],
];

// Divide o período (from/to) em blocos de 7 dias, do mais antigo pro mais recente, ancorados
// em `to` — é a granularidade usada nos gráficos pra deixar pressão, peso e treino comparáveis.
function buildWeeks(fromISO, toISO) {
  const to = new Date(toISO + "T00:00:00");
  const from = new Date(fromISO + "T00:00:00");
  const totalDays = Math.max(1, Math.round((to - from) / 864e5) + 1);
  const n = Math.max(2, Math.ceil(totalDays / 7));
  const weeks = [];
  for (let i = n - 1; i >= 0; i--) {
    const end = new Date(to); end.setDate(end.getDate() - i * 7);
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
function weeklyActivityCount(rows, weeks) {
  return weeks.map((w) => rows.filter((r) => inWeek(r.start_date.slice(0, 10), w)).length);
}

// Várias séries (podem ter buracos) no mesmo eixo Y real, em vez de normalizadas —
// só faz sentido quando as séries compartilham unidade (ex.: sistólica + diastólica, ambas mmHg).
function multiSeriesRealPoints(seriesList, w, h, padX, padTop, padBottom) {
  const allVals = seriesList.flatMap((s) => s.values.filter((v) => v != null && !Number.isNaN(v)));
  if (!allVals.length) return null;
  let lo = Math.min(...allVals), hi = Math.max(...allVals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.12;
  lo -= pad; hi += pad;
  const n = seriesList[0].values.length - 1 || 1;
  const px = (i) => padX + (i / n) * (w - padX * 2);
  const py = (v) => h - padBottom - ((v - lo) / (hi - lo)) * (h - padTop - padBottom);
  return {
    lo, hi, mid: (lo + hi) / 2, px, py,
    series: seriesList.map((s) => ({
      ...s,
      pts: s.values.map((v, i) => (v == null || Number.isNaN(v) ? null : { x: px(i), y: py(v) })).filter(Boolean),
    })),
  };
}

// Índices de semana a rotular no eixo X: início, meio e fim do período (ou só início/fim se curto).
function xAxisWeekIndexes(weeks) {
  return weeks.length > 2 ? [0, Math.floor((weeks.length - 1) / 2), weeks.length - 1] : [0, weeks.length - 1];
}
function YGridLines({ chart, w, padX, decimals = 0, unit = "" }) {
  return [chart.hi, chart.mid, chart.lo].map((v, i) => (
    <g key={i}>
      <line x1={padX} x2={w - padX} y1={chart.py(v)} y2={chart.py(v)} stroke="var(--line)" strokeDasharray="2 3" />
      <text x={padX} y={chart.py(v) - 3} fontSize="9" fill="var(--muted)">{v.toFixed(decimals)}{unit}</text>
    </g>
  ));
}
function XAxisLabels({ weeks, chart, h }) {
  const idxs = xAxisWeekIndexes(weeks);
  return idxs.map((i) => (
    <text key={i} x={chart.px(i)} y={h - 4} fontSize="9" fill="var(--muted)"
      textAnchor={i === 0 ? "start" : i === weeks.length - 1 ? "end" : "middle"}>
      {fmtBR(weeks[i].start)}
    </text>
  ));
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
  const [authError, setAuthError] = useState(null);
  // Captura ?strava=... na primeira renderização, antes do watchSession limpar
  // a query string da URL (ele faz isso assim que resolve a sessão).
  const [stravaFlash] = useState(() => new URLSearchParams(window.location.search).get("strava"));
  useEffect(() => watchSession(setSession), []);
  useEffect(() => { setAuthError(consumeAuthError()); }, []);

  return (
    <div className="ps">
      <style>{CSS}</style>
      {session === undefined ? (
        <div className="splash">Carregando…</div>
      ) : !supabase ? (
        <MissingConfig />
      ) : !session ? (
        <Login authError={authError} />
      ) : (
        <Dashboard session={session} stravaFlash={stravaFlash} />
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
function Login({ authError }) {
  const [email, setEmail] = useState("");
  const [keep, setKeep] = useState(true);
  const [status, setStatus] = useState(
    authError ? { kind: "err", text: "Link inválido ou expirado: " + authError } : null
  );
  const [sending, setSending] = useState(false);

  const send = async () => {
    const e = email.trim();
    if (!e) { setStatus({ kind: "err", text: "Digite um e-mail." }); return; }
    setSending(true); setStatus(null);
    try {
      const { error } = await sendMagicLink(e, keep);
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
          <label className="row small" style={{ gap: 8, marginBottom: 14, cursor: "pointer" }}>
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
            Manter-me conectado por 15 dias
          </label>
          <button className="btn pri blk" disabled={sending} onClick={send}>
            {sending ? "Enviando…" : "Enviar link mágico"}
          </button>
          {!keep && (
            <p className="small muted" style={{ marginTop: 8 }}>
              Sem marcar essa opção, o app vai pedir login de novo em cerca de 1 dia.
            </p>
          )}
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
function Dashboard({ session, stravaFlash }) {
  const [from, setFrom] = useState(isoDaysAgo(90));
  const [to, setTo] = useState(todayStr());
  const [tab, setTab] = useState(stravaFlash ? "atalhos" : "painel");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [bp, setBp] = useState([]);
  const [bw, setBw] = useState([]);
  const [meas, setMeas] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [activities, setActivities] = useState([]);

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    Promise.allSettled([
      fetchBpReadings(from + "T00:00:00.000Z", to + "T23:59:59.999Z"),
      fetchBodyWeight(from, to),
      fetchBodyMeasurements(from, to),
      fetchWorkoutSessions(from, to),
      fetchWorkoutExercises(from, to),
      fetchActivities(from + "T00:00:00.000Z", to + "T23:59:59.999Z"),
    ]).then(([bpR, bwR, measR, woR, exR, actR]) => {
      if (!alive) return;
      setBp(bpR.status === "fulfilled" ? bpR.value : []);
      setBw(bwR.status === "fulfilled" ? bwR.value : []);
      setMeas(measR.status === "fulfilled" ? measR.value : []);
      setWorkouts(woR.status === "fulfilled" ? woR.value : []);
      setExercises(exR.status === "fulfilled" ? exR.value : []);
      setActivities(actR.status === "fulfilled" ? actR.value : []);
      const failed = [bpR, bwR, measR, woR, exR, actR].find((r) => r.status === "rejected");
      setErr(failed ? failed.reason?.message || "Erro ao carregar dados" : null);
    }).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [from, to]);

  return (
    <>
      <header>
        <div className="brand">Painel-Saúde<span className="sub">Conectado como {session.user.email}</span></div>
        <button className="btn sm" onClick={signOut}>Sair</button>
      </header>
      <div className="main">
        <div className="tabbar">
          <button className={"tab" + (tab === "painel" ? " on" : "")} onClick={() => setTab("painel")}>Painel</button>
          <button className={"tab" + (tab === "relatorios" ? " on" : "")} onClick={() => setTab("relatorios")}>Relatórios</button>
          <button className={"tab" + (tab === "atalhos" ? " on" : "")} onClick={() => setTab("atalhos")}>Atalhos</button>
        </div>

        {tab === "painel" && (
          <PainelTab from={from} to={to} setFrom={setFrom} setTo={setTo} loading={loading} err={err}
            bp={bp} bw={bw} workouts={workouts} activities={activities} />
        )}
        {tab === "relatorios" && (
          <RelatoriosTab defaultFrom={from} defaultTo={to}
            bp={bp} bw={bw} meas={meas} workouts={workouts} exercises={exercises} activities={activities} />
        )}
        {tab === "atalhos" && <AtalhosTab stravaFlash={stravaFlash} />}
      </div>
    </>
  );
}

/* ---------- Painel: um gráfico por métrica, todos na mesma linha do tempo ---------- */
function PainelTab({ from, to, setFrom, setTo, loading, err, bp, bw, workouts, activities }) {
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
        <input className="inp" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        <input className="inp" type="date" value={to} min={from} max={todayStr()} onChange={(e) => setTo(e.target.value)} />
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

function BpChart({ sys, dia, weeks }) {
  const W = 600, H = 190, PADX = 30, PADTOP = 14, PADBOTTOM = 30;
  const chart = multiSeriesRealPoints(
    [{ key: "sys", label: "Sistólica", color: "#E06A5B", values: sys },
     { key: "dia", label: "Diastólica", color: "#F2A93B", values: dia }],
    W, H, PADX, PADTOP, PADBOTTOM
  );
  if (!chart) return null;
  return (
    <div className="card">
      <h2 className="sec">Pressão arterial — média semanal (mmHg)</h2>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 190, display: "block" }}>
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

function WeightChart({ kg, weeks }) {
  const W = 600, H = 170, PADX = 34, PADTOP = 14, PADBOTTOM = 30;
  const chart = multiSeriesRealPoints([{ key: "kg", color: "#4FA3E0", values: kg }], W, H, PADX, PADTOP, PADBOTTOM);
  if (!chart) return null;
  const s = chart.series[0];
  const last = lastValue(kg);
  return (
    <div className="card">
      <h2 className="sec">Peso corporal — média semanal (kg)</h2>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 170, display: "block" }}>
        <YGridLines chart={chart} w={W} padX={PADX} decimals={1} />
        <XAxisLabels weeks={weeks} chart={chart} h={H} />
        <polyline fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" points={toPolyline(s.pts)} />
        {s.pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2.3" fill={s.color} />)}
      </svg>
      {last != null && <p className="small muted" style={{ marginTop: 8 }}>Último: {last.toFixed(1)}kg</p>}
    </div>
  );
}

function WorkoutChart({ counts, weeks }) {
  const W = 600, H = 120, PADX = 24, PADTOP = 6, PADBOTTOM = 24;
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
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 120, display: "block" }}>
        <line x1={PADX} x2={W - PADX} y1={py(0)} y2={py(0)} stroke="var(--line)" />
        <text x={PADX} y={py(max) - 3} fontSize="9" fill="var(--muted)">{max}x</text>
        <text x={PADX} y={py(0) - 3} fontSize="9" fill="var(--muted)">0</text>
        {counts.map((c, i) => {
          const v = c || 0;
          const barH = py(0) - py(v);
          return <rect key={i} x={PADX + i * barW + 1} y={py(v)} width={Math.max(1, barW - 2)} height={Math.max(1, barH)} fill="#46B98A" rx="2" />;
        })}
        {idxs.map((i) => (
          <text key={i} x={PADX + i * barW + barW / 2} y={H - 4} fontSize="9" fill="var(--muted)"
            textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>
            {fmtBR(weeks[i].start)}
          </text>
        ))}
      </svg>
      <p className="small muted" style={{ marginTop: 8 }}>Última semana: {last}x · máximo no período: {max}x</p>
    </div>
  );
}

function CardioChart({ counts, weeks, activities }) {
  const W = 600, H = 120, PADX = 24, PADTOP = 6, PADBOTTOM = 24;
  const max = Math.max(1, ...counts.map((v) => v || 0));
  const n = counts.length;
  const barAreaW = W - PADX * 2;
  const barW = barAreaW / n;
  const chartH = H - PADTOP - PADBOTTOM;
  const py = (v) => H - PADBOTTOM - (v / max) * chartH;
  const last = counts.length ? counts[counts.length - 1] : 0;
  const idxs = xAxisWeekIndexes(weeks);

  const totalKm = activities.reduce((a, r) => a + (r.distance_m || 0), 0) / 1000;
  const totalSecs = activities.reduce((a, r) => a + (r.moving_time_s || 0), 0);
  const hrRows = activities.filter((r) => r.average_heartrate != null);
  const avgHr = hrRows.length ? hrRows.reduce((a, r) => a + r.average_heartrate, 0) / hrRows.length : null;

  return (
    <div className="card">
      <h2 className="sec">Cardio (Strava) — atividades por semana</h2>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 120, display: "block" }}>
        <line x1={PADX} x2={W - PADX} y1={py(0)} y2={py(0)} stroke="var(--line)" />
        <text x={PADX} y={py(max) - 3} fontSize="9" fill="var(--muted)">{max}x</text>
        <text x={PADX} y={py(0) - 3} fontSize="9" fill="var(--muted)">0</text>
        {counts.map((c, i) => {
          const v = c || 0;
          const barH = py(0) - py(v);
          return <rect key={i} x={PADX + i * barW + 1} y={py(v)} width={Math.max(1, barW - 2)} height={Math.max(1, barH)} fill="#FC5200" rx="2" />;
        })}
        {idxs.map((i) => (
          <text key={i} x={PADX + i * barW + barW / 2} y={H - 4} fontSize="9" fill="var(--muted)"
            textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>
            {fmtBR(weeks[i].start)}
          </text>
        ))}
      </svg>
      <p className="small muted" style={{ marginTop: 8 }}>
        Última semana: {last}x · {totalKm.toFixed(1)}km no período · {fmtHoursMin(totalSecs)}
        {avgHr != null ? ` · FC média ${avgHr.toFixed(0)}bpm` : ""}
      </p>
    </div>
  );
}

/* ---------- Relatórios por especialista ---------- */
function RelatoriosTab({ defaultFrom, defaultTo, bp, bw, meas, workouts, exercises, activities }) {
  const [tipo, setTipo] = useState("fisio");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [flash, setFlash] = useState(null);

  const inRange = useCallback((dateStr) => dateStr >= from && dateStr <= to, [from, to]);

  const fisioText = useMemo(() => {
    const w = bw.filter((e) => inRange(e.date));
    const m = meas.filter((e) => inRange(e.date));
    const wo = workouts.filter((e) => inRange(e.date));
    const ex = exercises.filter((e) => inRange(e.date));
    const done = wo.filter((e) => e.done);
    const dayCount = Math.max(1, Math.round((new Date(to) - new Date(from)) / 864e5) + 1);
    const perWeek = (done.length / (dayCount / 7)).toFixed(1);

    const byExercise = {};
    ex.forEach((e) => { (byExercise[e.exercise_name] = byExercise[e.exercise_name] || []).push(e); });
    Object.keys(byExercise).forEach((name) => byExercise[name].sort((a, b) => (a.date < b.date ? -1 : 1)));

    const progressions = Object.keys(byExercise).sort().map((name) => {
      const arr = byExercise[name];
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
      if (first.top_reps != null && last.top_reps != null) {
        const delta = last.top_reps - first.top_reps;
        return `${name}: ${first.top_reps} reps → ${last.top_reps} reps (${delta >= 0 ? "+" : ""}${delta})`;
      }
      return null;
    }).filter(Boolean);

    // Mesma regra do "Fique de olho" do Forja: platô = mesma carga (ou repetições, pra
    // exercícios sem peso) nas últimas 3-5 sessões; parado = sem registro há 14+ dias
    // (contado até o fim do período do relatório). key() só compara quando há um valor
    // real (peso, duração ou repetições) — evita falso platô em registros antigos sem
    // nenhum dos três (sincronizados antes do tipo "repetições sem peso" existir).
    const attentionPoints = [];
    Object.keys(byExercise).sort().forEach((name) => {
      const desc = byExercise[name].slice().reverse();
      const key = (e) => (e.top_kg != null ? e.top_kg : e.top_duration_secs != null ? e.top_duration_secs : e.top_reps);
      const lastN = desc.slice(0, 5);
      const k0 = key(lastN[0]);
      if (k0 != null && lastN.length >= 3 && lastN.every((x) => key(x) === k0)) {
        const val = lastN[0].top_kg != null ? `${lastN[0].top_kg}kg` : lastN[0].top_duration_secs != null ? fmtSecs(lastN[0].top_duration_secs) : `${lastN[0].top_reps} reps`;
        attentionPoints.push(`${name}: mesma carga (${val}) nas últimas ${lastN.length} sessões.`);
      }
      const gap = daysBetween(desc[0].date, to);
      if (gap >= 14) attentionPoints.push(`${name}: sem registro há ${gap} dias (última em ${fmtBR(desc[0].date)}).`);
    });

    const withNotes = ex.filter((e) => e.notes).slice().sort((a, b) => (a.date < b.date ? -1 : 1));

    const lines = [`Relatório de fisioterapia — ${fmtBRFull(from)} a ${fmtBRFull(to)}`, ""];

    lines.push("RESUMO");
    lines.push(w.length
      ? `Peso: ${w[0].kg}kg (${fmtBR(w[0].date)}) → ${w[w.length - 1].kg}kg (${fmtBR(w[w.length - 1].date)})`
      : "Peso: sem registros no período.");
    lines.push(`Treino: ${done.length} sessões concluídas (${perWeek}/semana em média).`);
    lines.push("");

    lines.push("PONTOS DE ATENÇÃO");
    if (attentionPoints.length) attentionPoints.forEach((p) => lines.push(p));
    else lines.push("Nada chamando atenção nesse período.");
    lines.push("");

    lines.push("PROGRESSÃO DE CARGA");
    if (progressions.length) progressions.forEach((p) => lines.push(p));
    else lines.push("Ainda não há 2+ registros do mesmo exercício no período pra comparar.");
    lines.push("");

    lines.push("OBSERVAÇÕES REGISTRADAS");
    if (withNotes.length) withNotes.forEach((e) => lines.push(`${fmtBR(e.date)} — ${e.exercise_name}: ${e.notes}`));
    else lines.push("Nenhuma observação anotada nas séries do período.");
    lines.push("");

    lines.push("PESO E MEDIDAS POR DATA");
    const byDate = {};
    w.forEach((e) => { byDate[e.date] = byDate[e.date] || {}; byDate[e.date].kg = e.kg; });
    m.forEach((e) => {
      byDate[e.date] = byDate[e.date] || {};
      MEAS_FIELDS.forEach(([k]) => { if (e[k] != null) byDate[e.date][k] = e[k]; });
    });
    const dates = Object.keys(byDate).sort();
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

    lines.push("EXERCÍCIOS POR SESSÃO");
    const fmtExVal = (e) => (e.top_kg != null ? `${e.exercise_name} ${e.top_kg}kg` : e.top_duration_secs != null ? `${e.exercise_name} ${fmtSecs(e.top_duration_secs)}` : e.top_reps != null ? `${e.exercise_name} ${e.top_reps} reps` : e.exercise_name);
    if (ex.length) {
      const byDateEx = {};
      ex.forEach((e) => { (byDateEx[e.date] = byDateEx[e.date] || []).push(e); });
      Object.keys(byDateEx).sort().forEach((d) => {
        const items = byDateEx[d];
        lines.push(`${fmtBR(d)} (${items[0].ficha_name}): ${items.map(fmtExVal).join(" · ")}`);
      });
    } else lines.push("Sem detalhe de exercícios sincronizado no período.");

    return lines.join("\n");
  }, [bw, meas, workouts, exercises, from, to, inRange]);

  const cardioText = useMemo(() => {
    const r = bp.filter((e) => inRange(e.ts.slice(0, 10)));
    const w = bw.filter((e) => inRange(e.date));
    // Separação manhã/noite segue a mesma lógica MRPA já usada no registro-pa (hora < 12 = manhã).
    const manha = r.filter((e) => new Date(e.ts).getHours() < 12);
    const noite = r.filter((e) => new Date(e.ts).getHours() >= 12);
    const lvl = (e) => Math.max(cSys(e.sys), cDia(e.dia));
    const avgOf = (arr, key) => arr.reduce((a, e) => a + e[key], 0) / arr.length;
    const fmtPeriodAvg = (arr) => (arr.length ? `${avgOf(arr, "sys").toFixed(0)}/${avgOf(arr, "dia").toFixed(0)} mmHg (${arr.length})` : "sem medições");
    const fmtReading = (e) => {
      const ctx = e.ctx && e.ctx.length ? ` (${e.ctx.join(", ")})` : "";
      return `${fmtBR(e.ts.slice(0, 10))} ${fmtHora(e.ts)} — ${e.sys}/${e.dia} mmHg, pulso ${e.pul} — ${classify(e.sys, e.dia)}${ctx}`;
    };

    const lines = [`Relatório de cardiologia — ${fmtBRFull(from)} a ${fmtBRFull(to)}`, ""];

    lines.push("RESUMO");
    if (r.length) {
      lines.push(`Média geral: ${fmtPeriodAvg(r)} — ${classify(avgOf(r, "sys"), avgOf(r, "dia"))}.`);
      lines.push(avgOf(r, "sys") >= 130 || avgOf(r, "dia") >= 80
        ? "Acima do limiar de referência domiciliar (130/80)."
        : "Dentro do limiar de referência domiciliar (130/80).");
      lines.push(`Manhã: ${fmtPeriodAvg(manha)} · Noite: ${fmtPeriodAvg(noite)}`);
      const severe = r.filter((e) => lvl(e) >= 3);
      if (severe.length) {
        const worst = severe.slice().sort((a, b) => lvl(b) - lvl(a) || (b.sys + b.dia) - (a.sys + a.dia))[0];
        lines.push(`Atenção: ${severe.length} medição(ões) em HAS estágio 2 ou 3 no período — mais grave em ${fmtBR(worst.ts.slice(0, 10))} ${fmtHora(worst.ts)} (${worst.sys}/${worst.dia} mmHg).`);
      }
    } else lines.push("Sem registros de pressão no período.");
    lines.push("");

    lines.push("MEDIÇÕES — MANHÃ");
    if (manha.length) manha.forEach((e) => lines.push(fmtReading(e)));
    else lines.push("Sem medições pela manhã no período.");
    lines.push("");

    lines.push("MEDIÇÕES — NOITE");
    if (noite.length) noite.forEach((e) => lines.push(fmtReading(e)));
    else lines.push("Sem medições à noite no período.");
    lines.push("");

    lines.push("PESO");
    if (w.length) w.forEach((e) => lines.push(`${fmtBR(e.date)} — ${e.kg}kg`));
    else lines.push("Sem registros de peso no período.");
    lines.push("");

    lines.push("CARDIO (STRAVA)");
    const act = activities.filter((e) => inRange(e.start_date.slice(0, 10)));
    if (act.length) {
      const totalKm = act.reduce((a, e) => a + (e.distance_m || 0), 0) / 1000;
      const totalSecs = act.reduce((a, e) => a + (e.moving_time_s || 0), 0);
      const hrRows = act.filter((e) => e.average_heartrate != null);
      const avgHr = hrRows.length ? hrRows.reduce((a, e) => a + e.average_heartrate, 0) / hrRows.length : null;
      const maxHrRows = act.filter((e) => e.max_heartrate != null);
      const maxHr = maxHrRows.length ? Math.max(...maxHrRows.map((e) => e.max_heartrate)) : null;
      lines.push(`${act.length} atividade(s) — ${totalKm.toFixed(1)}km · ${fmtHoursMin(totalSecs)}`
        + (avgHr != null ? ` · FC média ${avgHr.toFixed(0)}bpm` : "")
        + (maxHr != null ? ` · FC máxima ${maxHr.toFixed(0)}bpm` : ""));
      act.forEach((e) => {
        const km = ((e.distance_m || 0) / 1000).toFixed(2);
        const hr = e.average_heartrate != null
          ? ` — FC média ${Math.round(e.average_heartrate)}bpm${e.max_heartrate != null ? ` (máx ${Math.round(e.max_heartrate)})` : ""}`
          : "";
        lines.push(`${fmtBR(e.start_date.slice(0, 10))} — ${e.type === "Run" ? "Corrida" : "Caminhada"}, ${km}km, ${fmtHoursMin(e.moving_time_s || 0)}${hr}`);
      });
    } else lines.push("Sem atividades de cardio (Strava) no período.");

    return lines.join("\n");
  }, [bp, bw, activities, from, to, inRange]);

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
function AtalhosTab({ stravaFlash }) {
  return (
    <>
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
      <StravaCard stravaFlash={stravaFlash} />
    </>
  );
}

const STRAVA_FLASH_MSG = {
  connected: { kind: "ok", text: "Conectado ao Strava com sucesso!" },
  denied: { kind: "err", text: "Conexão cancelada — a autorização não foi concluída no Strava." },
  error: { kind: "err", text: "Não foi possível concluir a conexão com o Strava. Tente de novo." },
};

function StravaCard({ stravaFlash }) {
  const [status, setStatus] = useState(undefined); // undefined = carregando
  const [connecting, setConnecting] = useState(false);
  const [err, setErr] = useState(null);
  const flash = stravaFlash && STRAVA_FLASH_MSG[stravaFlash];

  useEffect(() => {
    let alive = true;
    getStravaStatus().then((s) => alive && setStatus(s)).catch(() => alive && setStatus({ connected: false }));
    return () => { alive = false; };
  }, [stravaFlash]);

  const connect = async () => {
    setErr(null); setConnecting(true);
    try {
      const url = await connectStrava();
      window.location.href = url;
    } catch (e) {
      setErr(e.message || "Não foi possível iniciar a conexão com o Strava.");
      setConnecting(false);
    }
  };

  return (
    <div className="card">
      <h2 className="sec">Cardio (Strava)</h2>
      {flash && (
        <p className="small" style={{ marginBottom: 12, color: flash.kind === "err" ? "var(--bad)" : "var(--good)" }}>
          {flash.text}
        </p>
      )}
      {status === undefined && <p className="small muted">Verificando conexão…</p>}
      {status?.connected && (
        <p className="small muted">
          Conectado desde {fmtBRFull(status.connectedAt.slice(0, 10))} — as corridas e caminhadas do Strava passam a
          entrar automaticamente no painel (sincronização diária).
        </p>
      )}
      {status && !status.connected && (
        <>
          <p className="small muted" style={{ marginBottom: 12 }}>
            Conecte sua conta do Strava para trazer corridas e caminhadas pro painel, junto com o treino de musculação.
          </p>
          <button className="btn pri blk" disabled={connecting} onClick={connect}>
            {connecting ? "Abrindo o Strava…" : "Conectar com Strava"}
          </button>
          {err && <p className="small" style={{ marginTop: 8, color: "var(--bad)" }}>{err}</p>}
        </>
      )}
    </div>
  );
}
