import { describe, expect, it } from "vitest";
import { alignSeries } from "../src/normalize";

describe("alignSeries", () => {
  it("Beide Reihen identisch → unverändert", () => {
    const series = [
      { date: "2024-01-02", close: 100 },
      { date: "2024-01-03", close: 101 },
      { date: "2024-01-04", close: 102 },
    ];
    const r = alignSeries(series, series);
    expect(r.overlapStart).toBe("2024-01-02");
    expect(r.overlapEnd).toBe("2024-01-04");
    expect(r.series1).toHaveLength(3);
    expect(r.series2).toHaveLength(3);
  });

  it("Unterschiedliche Inception → Schnittmenge ab späterem Start", () => {
    const aktiverFonds = [
      { date: "2010-01-04", close: 50 },
      { date: "2015-04-01", close: 90 },
      { date: "2020-06-15", close: 130 },
      { date: "2025-01-02", close: 170 },
    ];
    const benchmarkEtf = [
      { date: "2015-04-01", close: 100 },
      { date: "2020-06-15", close: 160 },
      { date: "2025-01-02", close: 210 },
    ];
    const r = alignSeries(aktiverFonds, benchmarkEtf);
    expect(r.overlapStart).toBe("2015-04-01");
    expect(r.overlapEnd).toBe("2025-01-02");
    expect(r.series1).toHaveLength(3);
    expect(r.series2).toHaveLength(3);
    expect(r.series1[0].close).toBe(90);
    expect(r.series2[0].close).toBe(100);
  });

  it("Keine Überlappung wirft", () => {
    const a = [{ date: "2010-01-04", close: 50 }];
    const b = [{ date: "2020-01-04", close: 100 }];
    expect(() => alignSeries(a, b)).toThrow(RangeError);
  });

  it("Nur synchrone Handelstage werden behalten (Wochenenden/Feiertage)", () => {
    const a = [
      { date: "2024-01-02", close: 100 },
      { date: "2024-01-03", close: 101 },
      { date: "2024-01-04", close: 102 },
    ];
    const b = [
      { date: "2024-01-02", close: 200 },
      { date: "2024-01-04", close: 202 },
    ];
    const r = alignSeries(a, b);
    expect(r.series1.map((row) => row.date)).toEqual(["2024-01-02", "2024-01-04"]);
    expect(r.series2.map((row) => row.date)).toEqual(["2024-01-02", "2024-01-04"]);
  });

  it("Leere Reihe wirft", () => {
    expect(() => alignSeries([], [{ date: "2024-01-02", close: 100 }])).toThrow(RangeError);
    expect(() => alignSeries([{ date: "2024-01-02", close: 100 }], [])).toThrow(RangeError);
  });

  it("Unsortierte Inputs werden intern sortiert", () => {
    const a = [
      { date: "2024-01-04", close: 102 },
      { date: "2024-01-02", close: 100 },
      { date: "2024-01-03", close: 101 },
    ];
    const b = [
      { date: "2024-01-03", close: 201 },
      { date: "2024-01-02", close: 200 },
      { date: "2024-01-04", close: 202 },
    ];
    const r = alignSeries(a, b);
    expect(r.series1.map((row) => row.date)).toEqual(["2024-01-02", "2024-01-03", "2024-01-04"]);
    expect(r.series2.map((row) => row.date)).toEqual(["2024-01-02", "2024-01-03", "2024-01-04"]);
  });
});
