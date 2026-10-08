import { describe, it, expect } from "vitest";
import { classify } from "./bloodPressure";

describe("classify (mesma regra do registro-pa)", () => {
  it.each([
    [110, 70, "Normal"],
    [120, 70, "Pré-hipertensão"],
    [110, 80, "Pré-hipertensão"],
    [140, 70, "HAS estágio 1"],
    [120, 90, "HAS estágio 1"],
    [160, 85, "HAS estágio 2"],
    [130, 100, "HAS estágio 2"],
    [180, 70, "HAS estágio 3"],
    [130, 110, "HAS estágio 3"],
  ])("%i/%i => %s", (s, d, expected) => {
    expect(classify(s, d)).toBe(expected);
  });

  it("vale a pior categoria entre sistólica e diastólica", () => {
    expect(classify(185, 60)).toBe("HAS estágio 3");
  });
});
