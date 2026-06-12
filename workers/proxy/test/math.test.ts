import { describe, expect, it } from "vitest";
import {
  calculateHistoricalCAGR,
  calculateFutureValue,
  yearsBetween,
} from "../src/math";

const EPSILON = 1e-9;

describe("calculateHistoricalCAGR", () => {
  it("Verdopplung in 10 Jahren → ~7,1773 % p. a.", () => {
    // 2^(1/10) - 1 = 0.07177346253629313
    const cagr = calculateHistoricalCAGR({ start: 1, end: 2, years: 10 });
    expect(cagr).toBeCloseTo(0.07177346253629313, 12);
  });

  it("8.000 → 12.000 in 5 Jahren → ~8,4472 % p. a.", () => {
    // (12000/8000)^(1/5) - 1 = 1.5^0.2 - 1 = 0.08447177119769027
    const cagr = calculateHistoricalCAGR({ start: 8000, end: 12000, years: 5 });
    expect(cagr).toBeCloseTo(0.08447177119769027, 12);
  });

  it("Gleichbleibender Wert → CAGR = 0", () => {
    const cagr = calculateHistoricalCAGR({ start: 100, end: 100, years: 7 });
    expect(Math.abs(cagr)).toBeLessThan(EPSILON);
  });

  it("Verlust → negative CAGR", () => {
    // (50/100)^(1/2) - 1 = 0.5^0.5 - 1 = -0.29289321881345254
    const cagr = calculateHistoricalCAGR({ start: 100, end: 50, years: 2 });
    expect(cagr).toBeCloseTo(-0.29289321881345254, 12);
  });

  it("Start ≤ 0 wirft", () => {
    expect(() => calculateHistoricalCAGR({ start: 0, end: 100, years: 1 })).toThrow(RangeError);
    expect(() => calculateHistoricalCAGR({ start: -1, end: 100, years: 1 })).toThrow(RangeError);
  });

  it("Years ≤ 0 wirft", () => {
    expect(() => calculateHistoricalCAGR({ start: 100, end: 200, years: 0 })).toThrow(RangeError);
    expect(() => calculateHistoricalCAGR({ start: 100, end: 200, years: -1 })).toThrow(RangeError);
  });

  it("End ≤ 0 wirft (Totalverlust nicht abbildbar)", () => {
    expect(() => calculateHistoricalCAGR({ start: 100, end: 0, years: 1 })).toThrow(RangeError);
  });

  it("NaN/Infinity wirft", () => {
    expect(() => calculateHistoricalCAGR({ start: NaN, end: 100, years: 1 })).toThrow(RangeError);
    expect(() => calculateHistoricalCAGR({ start: 100, end: Infinity, years: 1 })).toThrow(RangeError);
  });
});

describe("calculateFutureValue", () => {
  it("10.000 € × 7 % p. a. × 10 Jahre = 19.671,51 €", () => {
    // 10000 * 1.07^10 = 19671.513572895053
    const fv = calculateFutureValue({ capital: 10000, cagr: 0.07, years: 10 });
    expect(fv).toBeCloseTo(19671.513572895053, 6);
  });

  it("Mit 5 % Ausgabeaufschlag (oneTime 500 €) → 18.687,94 €", () => {
    // (10000 - 500) * 1.07^10 = 9500 * 1.9671513572895053 = 18687.937894250303
    const fv = calculateFutureValue({
      capital: 10000,
      cagr: 0.07,
      years: 10,
      oneTimeCosts: 500,
    });
    expect(fv).toBeCloseTo(18687.937894250303, 6);
  });

  it("Mit 0,5 % p. a. TER (annual costs) → ~18.771,37 €", () => {
    // 10000 * (1 + 0.07 - 0.005)^10 = 10000 * 1.065^10 = 18771.37465269359 (Math.pow)
    const fv = calculateFutureValue({
      capital: 10000,
      cagr: 0.07,
      years: 10,
      annualCosts: 0.005,
    });
    expect(fv).toBeCloseTo(18771.37465269359, 6);
  });

  it("Mit 5 % oneTime + 1,5 % annual = aktiver Fonds Realität", () => {
    // (10000 - 500) * (1.055)^10 = 9500 * 1.708144 = 16227.37235435913 (Math.pow)
    const fv = calculateFutureValue({
      capital: 10000,
      cagr: 0.07,
      years: 10,
      annualCosts: 0.015,
      oneTimeCosts: 500,
    });
    expect(fv).toBeCloseTo(16227.37235435913, 6);
  });

  it("Years = 0 → unverändertes Kapital (abzgl. Einmalkosten)", () => {
    const fv = calculateFutureValue({ capital: 10000, cagr: 0.07, years: 0, oneTimeCosts: 500 });
    expect(fv).toBeCloseTo(9500, 9);
  });

  it("Negative CAGR (Verlust) wird sauber gerechnet", () => {
    // 10000 * 0.95^5 = 10000 * 0.7737809375 = 7737.809375
    const fv = calculateFutureValue({ capital: 10000, cagr: -0.05, years: 5 });
    expect(fv).toBeCloseTo(7737.809374999998, 6);
  });

  it("oneTimeCosts > capital wirft", () => {
    expect(() =>
      calculateFutureValue({ capital: 1000, cagr: 0.05, years: 1, oneTimeCosts: 1500 }),
    ).toThrow(RangeError);
  });

  it("Negative Inputs werfen", () => {
    expect(() => calculateFutureValue({ capital: -1, cagr: 0.05, years: 1 })).toThrow(RangeError);
    expect(() => calculateFutureValue({ capital: 100, cagr: 0.05, years: -1 })).toThrow(RangeError);
    expect(() => calculateFutureValue({ capital: 100, cagr: 0.05, years: 1, oneTimeCosts: -1 })).toThrow(
      RangeError,
    );
  });
});

describe("yearsBetween", () => {
  it("Exakt 1 Jahr", () => {
    expect(yearsBetween("2020-01-01", "2021-01-01")).toBeCloseTo(1.0, 2);
  });

  it("10 Jahre", () => {
    expect(yearsBetween("2015-04-01", "2025-04-01")).toBeCloseTo(10.0, 2);
  });

  it("Schaltjahr-tolerant (365,25)", () => {
    const y = yearsBetween("2020-02-29", "2024-02-29");
    expect(y).toBeCloseTo(4.0, 2);
  });

  it("Ungültige Datumsangabe wirft", () => {
    expect(() => yearsBetween("nicht-ein-datum", "2020-01-01")).toThrow(RangeError);
  });
});
