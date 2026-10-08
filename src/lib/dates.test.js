import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { isoOf, isoDaysAgo, toLocalDate, daysBetween, fmtBR, fmtBRFull, fmtSecs, fmtHoursMin, buildWeeks, inWeek, xAxisWeekIndexes } from "./dates";

describe.each(["America/Sao_Paulo", "Europe/Paris", "Asia/Tokyo", "Pacific/Auckland"])("datas em %s", (tz) => {
  const original = process.env.TZ;
  beforeAll(() => { process.env.TZ = tz; });
  afterAll(() => { process.env.TZ = original; });

  it("isoOf usa o dia local", () => {
    expect(isoOf(new Date(2026, 7, 5, 23, 30))).toBe("2026-08-05");
    expect(isoOf(new Date(2026, 0, 3, 0, 10))).toBe("2026-01-03");
  });

  it("toLocalDate / isoOf fazem ida e volta sem deslocar o dia", () => {
    expect(isoOf(toLocalDate("2026-03-29"))).toBe("2026-03-29");
  });

  it("daysBetween conta dias de calendário, inclusive na virada de horário de verão", () => {
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
  });

  it("isoDaysAgo(0) é hoje", () => {
    expect(isoDaysAgo(0)).toBe(isoOf(new Date()));
  });

  it("buildWeeks gera blocos de 7 dias terminando em `to`", () => {
    const w = buildWeeks("2026-07-01", "2026-07-28");
    expect(w).toHaveLength(4);
    expect(w[3]).toEqual({ start: "2026-07-22", end: "2026-07-28" });
    expect(w[0].start).toBe("2026-07-01");
    expect(w.every((x) => daysBetween(x.start, x.end) === 6)).toBe(true);
  });
});

describe("formatadores", () => {
  it("fmtBR / fmtBRFull", () => {
    expect(fmtBR("2026-08-05")).toBe("05/08");
    expect(fmtBRFull("2026-08-05")).toBe("05/08/2026");
  });
  it("fmtSecs", () => {
    expect(fmtSecs(45)).toBe("45s");
    expect(fmtSecs(125)).toBe("2:05");
  });
  it("fmtHoursMin", () => {
    expect(fmtHoursMin(1800)).toBe("30min");
    expect(fmtHoursMin(3900)).toBe("1h05");
  });
  it("inWeek é inclusivo nas duas pontas", () => {
    const w = { start: "2026-07-01", end: "2026-07-07" };
    expect(inWeek("2026-07-01", w) && inWeek("2026-07-07", w)).toBe(true);
    expect(inWeek("2026-07-08", w)).toBe(false);
  });
  it("xAxisWeekIndexes", () => {
    expect(xAxisWeekIndexes([1, 2])).toEqual([0, 1]);
    expect(xAxisWeekIndexes([1, 2, 3, 4, 5])).toEqual([0, 2, 4]);
  });
});
