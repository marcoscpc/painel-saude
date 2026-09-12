import { useCallback, useMemo, useState } from "react";
import { fmtBR, fmtBRFull, fmtHora, fmtSecs, fmtHoursMin, daysBetween, todayStr } from "../lib/dates";
import { cSys, cDia, classify } from "../lib/bloodPressure";

const MEAS_FIELDS = [
  ["quadril", "Quadril"], ["cintura", "Cintura"], ["busto", "Busto"],
  ["abaixo_busto", "Abaixo do busto"], ["braco_esq", "Braço esq."], ["braco_dir", "Braço dir."],
];

/* ---------- Relatórios por especialista ---------- */
export default function RelatoriosTab({ defaultFrom, defaultTo, bp, bw, meas, workouts, exercises, activities }) {
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
      <div className="wrap" role="tablist" aria-label="Tipo de relatório" style={{ marginBottom: 12 }}>
        <button className={"chip" + (tipo === "fisio" ? " on" : "")} role="tab" aria-selected={tipo === "fisio"} onClick={() => setTipo("fisio")}>Fisioterapeuta</button>
        <button className={"chip" + (tipo === "cardio" ? " on" : "")} role="tab" aria-selected={tipo === "cardio"} onClick={() => setTipo("cardio")}>Cardiologista</button>
      </div>
      <div className="row" style={{ marginBottom: 12, gap: 10 }}>
        <input className="inp" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="Data inicial do relatório" />
        <input className="inp" type="date" value={to} min={from} max={todayStr()} onChange={(e) => setTo(e.target.value)} aria-label="Data final do relatório" />
      </div>
      <textarea className="inp" readOnly value={text} aria-label="Texto do relatório" />
      <button className="btn pri blk" style={{ marginTop: 12 }} onClick={share}>Compartilhar</button>
      {flash && <p className="small" style={{ marginTop: 8, color: "var(--good)" }}>{flash}</p>}
    </div>
  );
}
