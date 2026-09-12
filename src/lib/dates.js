/* ============================ Datas ============================ */
export const todayStr = () => isoOf(new Date());
export function isoOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const isoDaysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return isoOf(d); };
export const toLocalDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
export const daysBetween = (fromIso, toIso) => Math.round((toLocalDate(toIso) - toLocalDate(fromIso)) / 864e5);
export const fmtBR = (iso) => { const [, m, d] = iso.split("-"); return `${d}/${m}`; };
export const fmtBRFull = (iso) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
export const fmtHora = (ts) => new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
export const fmtSecs = (n) => {
  const v = Math.round(n);
  if (v < 60) return `${v}s`;
  const m = Math.floor(v / 60), s = v % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};
export const fmtHoursMin = (secs) => {
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
};

// Divide o período (from/to) em blocos de 7 dias, do mais antigo pro mais recente, ancorados
// em `to` — é a granularidade usada nos gráficos pra deixar pressão, peso e treino comparáveis.
export function buildWeeks(fromISO, toISO) {
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
export const inWeek = (dateStr, w) => dateStr >= w.start && dateStr <= w.end;

// Índices de semana a rotular no eixo X: início, meio e fim do período (ou só início/fim se curto).
export function xAxisWeekIndexes(weeks) {
  return weeks.length > 2 ? [0, Math.floor((weeks.length - 1) / 2), weeks.length - 1] : [0, weeks.length - 1];
}
