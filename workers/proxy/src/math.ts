/**
 * CAGR (Compound Annual Growth Rate) und Endwert-Prognose.
 *
 * Pure Funktionen ohne I/O — unit-getestet.
 */

export interface CagrInput {
  start: number;
  end: number;
  years: number;
}

/**
 * CAGR = (end/start)^(1/years) − 1
 *
 * Wirft, wenn start ≤ 0, years ≤ 0 oder end ≤ 0 (logarithmisch unzulässig).
 * Liefert die Rate als Dezimalzahl, z. B. 0.0723 für 7,23 % p. a.
 */
export function calculateHistoricalCAGR({ start, end, years }: CagrInput): number {
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(years)) {
    throw new RangeError("CAGR-Inputs müssen endliche Zahlen sein");
  }
  if (start <= 0) throw new RangeError("CAGR: Startwert muss > 0 sein");
  if (end <= 0) throw new RangeError("CAGR: Endwert muss > 0 sein");
  if (years <= 0) throw new RangeError("CAGR: Zeitraum muss > 0 Jahre sein");
  return Math.pow(end / start, 1 / years) - 1;
}

export interface FutureValueInput {
  capital: number;
  cagr: number;
  years: number;
  /**
   * Kostendrag p. a. als Dezimalzahl (z. B. 0.05 = 5 % Ausgabeaufschlag annualisiert,
   * oder 0.015 = 1,5 % TER). Wird von der CAGR abgezogen.
   * Default: 0.
   */
  annualCosts?: number;
  /**
   * Einmalkosten beim Kauf in absoluter Höhe (z. B. 5 % Ausgabeaufschlag auf 10.000 €
   * = 500). Wird vom investierten Kapital abgezogen, bevor die Verzinsung greift.
   * Default: 0.
   */
  oneTimeCosts?: number;
}

/**
 * Endkapital = (capital − oneTimeCosts) × (1 + cagr − annualCosts)^years
 *
 * Wirft bei unzulässigen Inputs (negativ, NaN, Infinity).
 */
export function calculateFutureValue({
  capital,
  cagr,
  years,
  annualCosts = 0,
  oneTimeCosts = 0,
}: FutureValueInput): number {
  for (const [k, v] of Object.entries({ capital, cagr, years, annualCosts, oneTimeCosts })) {
    if (!Number.isFinite(v)) throw new RangeError(`FutureValue: ${k} muss endlich sein`);
  }
  if (capital < 0) throw new RangeError("FutureValue: capital darf nicht negativ sein");
  if (years < 0) throw new RangeError("FutureValue: years darf nicht negativ sein");
  if (oneTimeCosts < 0) throw new RangeError("FutureValue: oneTimeCosts darf nicht negativ sein");
  if (oneTimeCosts > capital) throw new RangeError("FutureValue: oneTimeCosts > capital");

  const investedCapital = capital - oneTimeCosts;
  const effectiveRate = cagr - annualCosts;
  return investedCapital * Math.pow(1 + effectiveRate, years);
}

/**
 * Anzahl Jahre zwischen zwei ISO-Datumsangaben (YYYY-MM-DD).
 * Berechnet als (endTimestamp − startTimestamp) / Millisekunden-pro-Jahr (365.25 Tage).
 */
export function yearsBetween(startDate: string, endDate: string): number {
  const start = Date.parse(startDate);
  const end = Date.parse(endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new RangeError(`Ungültige Datumsangabe: start=${startDate}, end=${endDate}`);
  }
  const ms = end - start;
  return ms / (1000 * 60 * 60 * 24 * 365.25);
}
