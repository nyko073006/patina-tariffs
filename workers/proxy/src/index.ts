/**
 * patina-tariffs-proxy — Cloudflare Worker
 *
 * Routes:
 *   GET /api/history?isin=…&years=10
 *   GET /api/compare?isin1=…&isin2=…&capital=10000&years=10
 *                   [&costsAnnual1=0.015&costsAnnual2=0.0022]
 *                   [&costsOneTime1=0.05&costsOneTime2=0]
 *
 * Cache:
 *   symbol:{ISIN}                → 30 Tage
 *   eod:{symbol}:{fromDate}      → bis 04:00 UTC nächster Werktag
 *
 * Secrets:
 *   EODHD_API_KEY (wrangler secret put)
 */
import { resolveSymbol, fetchEodHistory, type EodhdEnv } from "./eodhd";
import { alignSeries } from "./normalize";
import { calculateHistoricalCAGR, calculateFutureValue, yearsBetween } from "./math";

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

interface HistoryQuery {
  isin: string;
  years: number;
}

interface CompareQuery {
  isin1: string;
  isin2: string;
  capital: number;
  years: number;
  costsAnnual1: number;
  costsAnnual2: number;
  costsOneTime1: number;
  costsOneTime2: number;
  minYears: number;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      ...CORS_HEADERS,
      ...(init.headers ?? {}),
    },
  });
}

function clientError(message: string, status = 400): Response {
  return json({ error: message }, { status });
}

function parseNumber(value: string | null, fallback: number, min = -Infinity, max = Infinity): number {
  if (value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new RangeError(`Ungültiger Zahlenwert: ${value}`);
  }
  return n;
}

function parseHistoryQuery(url: URL): HistoryQuery {
  const isin = (url.searchParams.get("isin") ?? "").toUpperCase();
  if (!ISIN_RE.test(isin)) throw new RangeError("ISIN ungültig (muss 12 Zeichen, ISO 6166)");
  const years = parseNumber(url.searchParams.get("years"), 10, 0.1, 30);
  return { isin, years };
}

function parseCompareQuery(url: URL): CompareQuery {
  const isin1 = (url.searchParams.get("isin1") ?? "").toUpperCase();
  const isin2 = (url.searchParams.get("isin2") ?? "").toUpperCase();
  if (!ISIN_RE.test(isin1)) throw new RangeError("isin1 ungültig");
  if (!ISIN_RE.test(isin2)) throw new RangeError("isin2 ungültig");
  if (isin1 === isin2) throw new RangeError("isin1 und isin2 müssen unterschiedlich sein");
  const capital = parseNumber(url.searchParams.get("capital"), 10000, 1, 100_000_000);
  const years = parseNumber(url.searchParams.get("years"), 10, 0.1, 50);
  const costsAnnual1 = parseNumber(url.searchParams.get("costsAnnual1"), 0, 0, 0.2);
  const costsAnnual2 = parseNumber(url.searchParams.get("costsAnnual2"), 0, 0, 0.2);
  const costsOneTime1 = parseNumber(url.searchParams.get("costsOneTime1"), 0, 0, 0.2);
  const costsOneTime2 = parseNumber(url.searchParams.get("costsOneTime2"), 0, 0, 0.2);
  const minYears = parseNumber(url.searchParams.get("minYears"), 1, 0.1, 30);
  return {
    isin1, isin2, capital, years,
    costsAnnual1, costsAnnual2, costsOneTime1, costsOneTime2,
    minYears,
  };
}

function isoDateNYearsAgo(years: number): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - Math.ceil(years));
  return d.toISOString().slice(0, 10);
}

async function handleHistory(env: EodhdEnv, url: URL): Promise<Response> {
  const { isin, years } = parseHistoryQuery(url);
  const symbol = await resolveSymbol(env, isin);
  if (!symbol) return clientError(`Kein EODHD-Symbol für ${isin}`, 404);
  const series = await fetchEodHistory(env, symbol, isoDateNYearsAgo(years));
  return json({ isin, symbol, count: series.length, series });
}

async function handleCompare(env: EodhdEnv, url: URL): Promise<Response> {
  const q = parseCompareQuery(url);

  const [symbol1, symbol2] = await Promise.all([
    resolveSymbol(env, q.isin1),
    resolveSymbol(env, q.isin2),
  ]);
  if (!symbol1) return clientError(`Kein EODHD-Symbol für ${q.isin1}`, 404);
  if (!symbol2) return clientError(`Kein EODHD-Symbol für ${q.isin2}`, 404);

  const fromDate = isoDateNYearsAgo(q.years + 1);
  const [s1, s2] = await Promise.all([
    fetchEodHistory(env, symbol1, fromDate),
    fetchEodHistory(env, symbol2, fromDate),
  ]);

  let aligned;
  try {
    aligned = alignSeries(s1, s2);
  } catch (e) {
    return clientError(`Normalisierung fehlgeschlagen: ${(e as Error).message}`, 422);
  }

  const histYears = yearsBetween(aligned.overlapStart, aligned.overlapEnd);
  if (histYears < q.minYears) {
    return clientError(
      `Überlappung ${aligned.overlapStart}–${aligned.overlapEnd} = ${histYears.toFixed(2)} Jahre < minYears=${q.minYears}`,
      422,
    );
  }

  const warnings: string[] = [];
  if (histYears < 1) {
    warnings.push(
      `Datenbasis ${histYears.toFixed(2)} Jahre — CAGR-Extrapolation auf ${q.years} Jahre statistisch nicht aussagekräftig`,
    );
  }

  const start1 = aligned.series1[0].close;
  const end1 = aligned.series1[aligned.series1.length - 1].close;
  const start2 = aligned.series2[0].close;
  const end2 = aligned.series2[aligned.series2.length - 1].close;

  const cagr1 = calculateHistoricalCAGR({ start: start1, end: end1, years: histYears });
  const cagr2 = calculateHistoricalCAGR({ start: start2, end: end2, years: histYears });

  const fv1 = calculateFutureValue({
    capital: q.capital,
    cagr: cagr1,
    years: q.years,
    annualCosts: q.costsAnnual1,
    oneTimeCosts: q.capital * q.costsOneTime1,
  });
  const fv2 = calculateFutureValue({
    capital: q.capital,
    cagr: cagr2,
    years: q.years,
    annualCosts: q.costsAnnual2,
    oneTimeCosts: q.capital * q.costsOneTime2,
  });

  return json({
    inputs: q,
    overlap: {
      from: aligned.overlapStart,
      to: aligned.overlapEnd,
      years: Math.round(histYears * 100) / 100,
      tradingDays: aligned.series1.length,
    },
    series: {
      isin1: { symbol: symbol1, start: start1, end: end1, cagr: cagr1, futureValue: fv1 },
      isin2: { symbol: symbol2, start: start2, end: end2, cagr: cagr2, futureValue: fv2 },
    },
    warnings,
  });
}

export default {
  async fetch(request: Request, env: EodhdEnv): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }
    if (request.method !== "GET") {
      return clientError("Nur GET unterstützt", 405);
    }
    if (!env.EODHD_API_KEY) {
      return clientError("Server-Konfiguration: EODHD_API_KEY fehlt", 500);
    }

    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/history") return await handleHistory(env, url);
      if (url.pathname === "/api/compare") return await handleCompare(env, url);
      if (url.pathname === "/" || url.pathname === "/api") {
        return json({
          name: "patina-tariffs-proxy",
          routes: ["/api/history?isin=…&years=10", "/api/compare?isin1=…&isin2=…&capital=10000&years=10"],
        });
      }
      return clientError("Unbekannte Route", 404);
    } catch (e) {
      const msg = (e as Error).message ?? "Unbekannter Fehler";
      const status = e instanceof RangeError ? 400 : 500;
      return clientError(msg, status);
    }
  },
};
