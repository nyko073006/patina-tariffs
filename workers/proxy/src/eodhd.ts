/**
 * EODHD-API-Wrapper mit Symbol-Discovery und EOD-Historie.
 * Liest API_KEY und EODHD_BASE aus dem Worker-Env.
 */
import { getCached, setCached, secondsUntilNextEodRefresh, type CacheEnv } from "./cache";
import type { PriceRow } from "./normalize";

const SYMBOL_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 Tage — Symbole ändern sich praktisch nie
const EXCHANGE_PREFERENCE = ["XETRA", "F", "LSE", "MI", "PA", "AS", "BR", "MC", "SW", "US"];

export interface EodhdEnv extends CacheEnv {
  EODHD_BASE: string;
  EODHD_API_KEY: string;
}

interface EodhdSearchResult {
  Code: string;
  Exchange: string;
  Name?: string;
  Type?: string;
  ISIN?: string;
}

interface EodhdEodRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjusted_close: number;
  volume: number;
}

export async function resolveSymbol(env: EodhdEnv, isin: string): Promise<string | null> {
  const cacheKey = `symbol:${isin}`;
  const cached = await getCached<string>(env, cacheKey);
  if (cached) return cached;

  const url = `${env.EODHD_BASE}/search/${encodeURIComponent(isin)}?api_token=${env.EODHD_API_KEY}&fmt=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`EODHD search ${res.status} for ${isin}`);
  const results = (await res.json()) as EodhdSearchResult[];
  if (!Array.isArray(results) || results.length === 0) return null;

  const tradable = results.filter((r) => {
    const t = (r.Type ?? "").toUpperCase();
    return t === "ETF" || t === "FUND" || t === "MUTUAL FUND" || t === "MUTUALFUND";
  });
  const pool = tradable.length > 0 ? tradable : results;

  let pick: EodhdSearchResult | undefined;
  for (const ex of EXCHANGE_PREFERENCE) {
    pick = pool.find((r) => (r.Exchange ?? "").toUpperCase() === ex);
    if (pick) break;
  }
  pick ??= pool[0];
  if (!pick) return null;

  const symbol = `${pick.Code}.${pick.Exchange}`;
  await setCached(env, cacheKey, symbol, SYMBOL_TTL_SECONDS);
  return symbol;
}

export async function fetchEodHistory(
  env: EodhdEnv,
  symbol: string,
  fromDate: string,
): Promise<PriceRow[]> {
  const cacheKey = `eod:${symbol}:${fromDate}`;
  const cached = await getCached<PriceRow[]>(env, cacheKey);
  if (cached) return cached;

  const url = `${env.EODHD_BASE}/eod/${encodeURIComponent(symbol)}?api_token=${env.EODHD_API_KEY}&fmt=json&from=${fromDate}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`EODHD eod ${res.status} for ${symbol}`);
  const raw = (await res.json()) as EodhdEodRow[];
  if (!Array.isArray(raw)) throw new Error(`EODHD eod returned non-array for ${symbol}`);

  const series: PriceRow[] = raw
    .filter((r) => typeof r.adjusted_close === "number" && r.adjusted_close > 0 && typeof r.date === "string")
    .map((r) => ({ date: r.date, close: r.adjusted_close }));

  if (series.length === 0) {
    throw new Error(`EODHD eod: leere Reihe für ${symbol}`);
  }

  await setCached(env, cacheKey, series, secondsUntilNextEodRefresh());
  return series;
}
