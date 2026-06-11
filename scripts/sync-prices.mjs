#!/usr/bin/env node
/**
 * EODHD-Sync für Fonds-/ETF-Marktdaten.
 *
 * Liest jeden data/funds/<ISIN>.json ein, ergänzt:
 *   latestPrice, latestPriceDate, latestPriceCurrency
 *   nav, navDate
 *   performance.{m1,m3,m6,ytd,y1,y3,y5,y10}
 *   sectorAllocation, countryAllocation, topHoldings
 *   yield.{dividendYield,yield12m}
 *   ter, fundSize (überschreibt — User-Wunsch: "alles syncen")
 *   _eodhdSymbol (gecachter Symbol-Lookup)
 *
 * Stammdaten (assetClass, currency, provider, name, …) bleiben unangetastet.
 * Override-Layer (data/overrides/funds/<ISIN>.json) wird nicht berührt.
 *
 * API-Key via Env: EODHD_API_KEY. Ohne Key → no-op mit Exit 0 (CI bricht nicht).
 *
 * Symbol-Discovery: ISIN → /search → erster ETF/FUND-Treffer.
 *   Bevorzugt XETRA/LSE/F (EU-Exchanges), sonst erster Treffer.
 *   Ergebnis wird in _eodhdSymbol gecached, damit nicht jeder Sync sucht.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url)) + "/..";
const FUNDS_DIR = join(ROOT, "data/funds");
const API_BASE = "https://eodhd.com/api";
const API_KEY = process.env.EODHD_API_KEY;
const RATE_LIMIT_MS = Number(process.env.EODHD_RATE_LIMIT_MS ?? 250);
const EXCHANGE_PREFERENCE = ["XETRA", "F", "LSE", "MI", "PA", "AS", "BR", "MC", "SW", "US"];

if (!API_KEY) {
  console.warn("⚠ EODHD_API_KEY nicht gesetzt — Sync übersprungen.");
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} on ${url.replace(API_KEY, "***")}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function discoverSymbol(isin) {
  const url = `${API_BASE}/search/${isin}?api_token=${API_KEY}&fmt=json`;
  const results = await fetchJson(url);
  if (!Array.isArray(results) || results.length === 0) return null;
  const tradable = results.filter((r) => {
    const t = (r.Type || "").toUpperCase();
    return t === "ETF" || t === "FUND" || t === "MUTUAL FUND" || t === "MUTUALFUND";
  });
  const pool = tradable.length > 0 ? tradable : results;
  for (const ex of EXCHANGE_PREFERENCE) {
    const hit = pool.find((r) => (r.Exchange || "").toUpperCase() === ex);
    if (hit) return `${hit.Code}.${hit.Exchange}`;
  }
  const first = pool[0];
  return `${first.Code}.${first.Exchange}`;
}

async function fetchRealtime(symbol) {
  const url = `${API_BASE}/real-time/${symbol}?api_token=${API_KEY}&fmt=json`;
  return fetchJson(url);
}

async function fetchEodHistory(symbol, fromDate) {
  const url = `${API_BASE}/eod/${symbol}?api_token=${API_KEY}&fmt=json&from=${fromDate}`;
  return fetchJson(url);
}

async function fetchFundamentals(symbol) {
  const url = `${API_BASE}/fundamentals/${symbol}?api_token=${API_KEY}`;
  return fetchJson(url);
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function findCloseAtOrBefore(history, targetDate) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].date <= targetDate) return history[i];
  }
  return null;
}

function pctChange(from, to) {
  if (!from || !to || from <= 0) return null;
  return Math.round(((to - from) / from) * 10000) / 100;
}

function computePerformance(history) {
  if (!Array.isArray(history) || history.length === 0) return null;
  const sorted = history
    .filter((row) => typeof row.adjusted_close === "number" && row.adjusted_close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return null;
  const latest = sorted[sorted.length - 1];
  const latestClose = latest.adjusted_close;
  const today = new Date(latest.date);
  const out = {};
  const offsets = {
    m1: { months: 1 },
    m3: { months: 3 },
    m6: { months: 6 },
    y1: { years: 1 },
    y3: { years: 3 },
    y5: { years: 5 },
    y10: { years: 10 },
  };
  for (const [key, off] of Object.entries(offsets)) {
    const past = new Date(today);
    if (off.months) past.setMonth(past.getMonth() - off.months);
    if (off.years) past.setFullYear(past.getFullYear() - off.years);
    const target = isoDate(past);
    const row = findCloseAtOrBefore(sorted, target);
    const pct = row ? pctChange(row.adjusted_close, latestClose) : null;
    if (pct !== null) out[key] = pct;
  }
  const yearStart = `${today.getUTCFullYear()}-01-01`;
  const ytdRow = findCloseAtOrBefore(sorted, yearStart);
  const ytdPct = ytdRow ? pctChange(ytdRow.adjusted_close, latestClose) : null;
  if (ytdPct !== null) out.ytd = ytdPct;
  return Object.keys(out).length > 0 ? out : null;
}

function extractAllocation(obj) {
  if (!obj || typeof obj !== "object") return null;
  const arr = Object.entries(obj)
    .map(([name, v]) => ({
      name,
      weight: typeof v === "number" ? v : Number(v?.Equity_pct ?? v?.equity_pct ?? v?.["Equity_%"] ?? NaN),
    }))
    .filter((x) => Number.isFinite(x.weight) && x.weight > 0)
    .map((x) => ({ name: x.name, weight: Math.round(x.weight * 100) / 100 }))
    .sort((a, b) => b.weight - a.weight);
  return arr.length > 0 ? arr : null;
}

function extractHoldings(holdings) {
  if (!holdings || typeof holdings !== "object") return null;
  const arr = Object.values(holdings)
    .map((h) => {
      const name = h.Name || h.name;
      const weight = Number(h["Assets_%"] ?? h.assets_pct ?? h.weight ?? NaN);
      if (!name || !Number.isFinite(weight) || weight <= 0) return null;
      const entry = { name: String(name), weight: Math.round(weight * 100) / 100 };
      if (h.ISIN && /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(h.ISIN)) entry.isin = h.ISIN;
      const ticker = h.Code || h.Ticker;
      if (ticker) entry.ticker = String(ticker);
      return entry;
    })
    .filter(Boolean)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 20);
  return arr.length > 0 ? arr : null;
}

function pickFromFundamentals(f) {
  const out = {};
  if (!f || typeof f !== "object") return out;
  const general = f.General || {};
  const etfData = f.ETF_Data || f.MutualFund_Data || {};
  const techIndicators = f.Technicals || {};
  const tradeable = etfData.NetAssets || etfData.TotalAssets;
  if (Number.isFinite(Number(tradeable)) && Number(tradeable) > 0) {
    out.fundSize = Number(tradeable);
  }
  const ter = etfData.NetExpenseRatio ?? etfData.TotalExpenseRatio;
  if (Number.isFinite(Number(ter)) && Number(ter) > 0) {
    out.ter = Math.round(Number(ter) * 100) / 100;
  }
  const nav = etfData.NAV ?? etfData.Nav ?? techIndicators.NAV;
  if (Number.isFinite(Number(nav)) && Number(nav) > 0) {
    out.nav = Math.round(Number(nav) * 10000) / 10000;
    const navDate = etfData.NAV_Date || etfData.Asof_Date || general.UpdatedAt;
    if (typeof navDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(navDate)) {
      out.navDate = navDate.slice(0, 10);
    }
  }
  const yld = etfData.Yield ?? etfData.Yield_12M;
  if (Number.isFinite(Number(yld))) {
    out.yield = { yield12m: Math.round(Number(yld) * 100) / 100 };
  }
  const sector = extractAllocation(etfData.Sector_Weights || etfData.SectorWeights);
  if (sector) out.sectorAllocation = sector;
  const country = extractAllocation(etfData.Country_Weights || etfData.CountryWeights);
  if (country) out.countryAllocation = country;
  const holdings = extractHoldings(etfData.Top_10_Holdings || etfData.Holdings);
  if (holdings) out.topHoldings = holdings;
  return out;
}

function loadFund(isin) {
  const path = join(FUNDS_DIR, `${isin}.json`);
  return { path, data: JSON.parse(readFileSync(path, "utf8")) };
}

function stableStringify(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort(), 2) + "\n";
}

async function syncOne(isin) {
  const { path, data } = loadFund(isin);
  let symbol = data._eodhdSymbol;
  if (!symbol) {
    symbol = await discoverSymbol(isin);
    if (!symbol) {
      console.warn(`  ⚠ ${isin} — kein EODHD-Treffer, übersprungen`);
      return { isin, status: "no-symbol" };
    }
    await sleep(RATE_LIMIT_MS);
  }

  const fromDate = isoDate(new Date(Date.now() - 11 * 365 * 24 * 3600 * 1000));
  const [realtime, history, fundamentals] = await Promise.all([
    fetchRealtime(symbol).catch((e) => { console.warn(`  ⚠ ${isin} realtime: ${e.message}`); return null; }),
    fetchEodHistory(symbol, fromDate).catch((e) => { console.warn(`  ⚠ ${isin} eod: ${e.message}`); return null; }),
    fetchFundamentals(symbol).catch((e) => { console.warn(`  ⚠ ${isin} fundamentals: ${e.message}`); return null; }),
  ]);

  const patch = { _eodhdSymbol: symbol };

  if (realtime && Number.isFinite(Number(realtime.close))) {
    patch.latestPrice = Math.round(Number(realtime.close) * 10000) / 10000;
    if (realtime.timestamp) {
      patch.latestPriceDate = new Date(Number(realtime.timestamp) * 1000).toISOString().slice(0, 10);
    }
  }

  const perf = computePerformance(history);
  if (perf) patch.performance = perf;

  Object.assign(patch, pickFromFundamentals(fundamentals));

  const next = { ...data, ...patch };
  const before = stableStringify(data);
  const after = stableStringify(next);
  if (before === after) {
    await sleep(RATE_LIMIT_MS);
    return { isin, status: "unchanged", symbol };
  }
  writeFileSync(path, after);
  await sleep(RATE_LIMIT_MS);
  return { isin, status: "updated", symbol };
}

async function main() {
  const files = readdirSync(FUNDS_DIR).filter((f) => f.endsWith(".json"));
  const isins = files.map((f) => f.replace(/\.json$/, ""));
  console.log(`EODHD-Sync für ${isins.length} Fonds startet …`);
  const stats = { total: isins.length, updated: 0, unchanged: 0, "no-symbol": 0, failed: 0 };
  for (const isin of isins) {
    try {
      const r = await syncOne(isin);
      stats[r.status] = (stats[r.status] ?? 0) + 1;
      console.log(`  ${r.status === "updated" ? "✓" : "·"} ${isin}${r.symbol ? ` → ${r.symbol}` : ""} (${r.status})`);
    } catch (e) {
      stats.failed++;
      console.error(`  ✗ ${isin}: ${e.message}`);
    }
  }
  console.log(`✓ Done — ${stats.updated} updated, ${stats.unchanged} unchanged, ${stats["no-symbol"]} no-symbol, ${stats.failed} failed`);
  if (stats.failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
