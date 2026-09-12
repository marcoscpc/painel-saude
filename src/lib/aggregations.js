import { inWeek } from "./dates";

/* ============================ Agregação semanal ============================ */
export function weeklyBpAvg(rows, weeks) {
  return weeks.map((w) => {
    const rs = rows.filter((r) => inWeek(r.ts.slice(0, 10), w));
    if (!rs.length) return { sys: null, dia: null };
    return {
      sys: rs.reduce((a, r) => a + r.sys, 0) / rs.length,
      dia: rs.reduce((a, r) => a + r.dia, 0) / rs.length,
    };
  });
}
export function weeklyAvg(rows, key, weeks) {
  return weeks.map((w) => {
    const rs = rows.filter((r) => inWeek(r.date, w) && r[key] != null);
    if (!rs.length) return null;
    return rs.reduce((a, r) => a + r[key], 0) / rs.length;
  });
}
export function weeklyWorkoutCount(rows, weeks) {
  return weeks.map((w) => rows.filter((r) => inWeek(r.date, w) && r.done).length);
}
export function weeklyActivityCount(rows, weeks) {
  return weeks.map((w) => rows.filter((r) => inWeek(r.start_date.slice(0, 10), w)).length);
}

// Várias séries (podem ter buracos) no mesmo eixo Y real, em vez de normalizadas —
// só faz sentido quando as séries compartilham unidade (ex.: sistólica + diastólica, ambas mmHg).
export function multiSeriesRealPoints(seriesList, w, h, padX, padTop, padBottom) {
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

export const toPolyline = (pts) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
export const lastValue = (values) => { for (let i = values.length - 1; i >= 0; i--) if (values[i] != null) return values[i]; return null; };
