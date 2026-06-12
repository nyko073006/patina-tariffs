/**
 * Cloudflare-KV-Cache mit JSON-Serialisierung und TTL-Defaults.
 */

export interface CacheEnv {
  CACHE: KVNamespace;
}

export async function getCached<T>(env: CacheEnv, key: string): Promise<T | null> {
  const raw = await env.CACHE.get(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setCached<T>(
  env: CacheEnv,
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  await env.CACHE.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
}

/**
 * Sekunden bis 04:00 UTC am nächsten Werktag. EODHD veröffentlicht EOD-Kurse
 * im Lauf des Folgetags morgens — Cache-Refresh kurz davor ist sinnvoll.
 */
export function secondsUntilNextEodRefresh(now: Date = new Date()): number {
  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(4, 0, 0, 0);
  const day = next.getUTCDay();
  if (day === 6) next.setUTCDate(next.getUTCDate() + 2);
  else if (day === 0) next.setUTCDate(next.getUTCDate() + 1);
  return Math.max(60, Math.floor((next.getTime() - now.getTime()) / 1000));
}
