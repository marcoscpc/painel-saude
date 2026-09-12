/* ============================ Classificação de pressão (mesma regra do registro-pa) ============================ */
export const CATS = ["Normal", "Pré-hipertensão", "HAS estágio 1", "HAS estágio 2", "HAS estágio 3"];
export const cSys = (s) => (s >= 180 ? 4 : s >= 160 ? 3 : s >= 140 ? 2 : s >= 120 ? 1 : 0);
export const cDia = (d) => (d >= 110 ? 4 : d >= 100 ? 3 : d >= 90 ? 2 : d >= 80 ? 1 : 0);
export const classify = (s, d) => CATS[Math.max(cSys(s), cDia(d))];
