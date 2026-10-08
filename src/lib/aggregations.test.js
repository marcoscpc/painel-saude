import { describe, it, expect } from "vitest";
import { weeklyBpAvg, weeklyAvg, weeklyWorkoutCount, weeklyActivityCount, multiSeriesRealPoints, toPolyline, lastValue } from "./aggregations";

const weeks = [
  { start: "2026-07-01", end: "2026-07-07" },
  { start: "2026-07-08", end: "2026-07-14" },
];

describe("agregação semanal", () => {
  it("weeklyBpAvg faz a média por semana e devolve null onde não há leitura", () => {
    const rows = [
      { ts: "2026-07-02T08:00:00Z", sys: 120, dia: 80 },
      { ts: "2026-07-03T08:00:00Z", sys: 130, dia: 90 },
    ];
    expect(weeklyBpAvg(rows, weeks)).toEqual([{ sys: 125, dia: 85 }, { sys: null, dia: null }]);
  });

  it("weeklyAvg ignora valores nulos", () => {
    const rows = [{ date: "2026-07-09", kg: 80 }, { date: "2026-07-10", kg: null }, { date: "2026-07-11", kg: 82 }];
    expect(weeklyAvg(rows, "kg", weeks)).toEqual([null, 81]);
  });

  it("weeklyWorkoutCount só conta treinos concluídos", () => {
    const rows = [{ date: "2026-07-02", done: true }, { date: "2026-07-03", done: false }];
    expect(weeklyWorkoutCount(rows, weeks)).toEqual([1, 0]);
  });

  it("weeklyActivityCount usa a data da atividade", () => {
    expect(weeklyActivityCount([{ start_date: "2026-07-09T06:00:00Z" }], weeks)).toEqual([0, 1]);
  });
});

describe("pontos de gráfico", () => {
  it("multiSeriesRealPoints devolve null sem dados", () => {
    expect(multiSeriesRealPoints([{ values: [null, null] }], 100, 50, 5, 5, 5)).toBeNull();
  });

  it("valor único não gera divisão por zero", () => {
    const r = multiSeriesRealPoints([{ values: [100, 100] }], 100, 50, 5, 5, 5);
    expect(Number.isFinite(r.series[0].pts[0].y)).toBe(true);
  });

  it("pula pontos nulos mas mantém a posição X dos demais", () => {
    const r = multiSeriesRealPoints([{ values: [1, null, 3] }], 100, 50, 0, 0, 0);
    expect(r.series[0].pts.map((p) => p.x)).toEqual([0, 100]);
  });

  it("toPolyline e lastValue", () => {
    expect(toPolyline([{ x: 1, y: 2 }, { x: 3.14159, y: 4 }])).toBe("1.0,2.0 3.1,4.0");
    expect(lastValue([1, null, 3, null])).toBe(3);
    expect(lastValue([null])).toBeNull();
  });
});
