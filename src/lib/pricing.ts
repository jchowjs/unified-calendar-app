import { query } from "./db";
import { fetchQuotePrice } from "./fmp";
import {
  GOLD_TICKER,
  TROY_OUNCE_GRAMS,
  canAttemptLivePrice,
  stalenessMsFor,
  type HoldingType,
} from "./holdings-rules";

type CacheableType = "stock" | "etf" | "crypto" | "mutual_fund" | "gold";

interface CachedPrice {
  price: number;
  fetchedAt: Date;
}

async function getCachedPrice(type: CacheableType, ticker: string): Promise<CachedPrice | null> {
  const { rows } = await query<{ price: string; fetched_at: Date }>(
    `select price, fetched_at from price_cache where type = $1 and ticker = $2`,
    [type, ticker]
  );
  const row = rows[0];
  return row ? { price: Number(row.price), fetchedAt: row.fetched_at } : null;
}

async function upsertCachedPrice(type: CacheableType, ticker: string, price: number) {
  await query(
    `insert into price_cache (type, ticker, price, fetched_at)
     values ($1, $2, $3, now())
     on conflict (type, ticker) do update set price = excluded.price, fetched_at = now()`,
    [type, ticker, price]
  );
}

function fmpQuerySymbol(type: CacheableType, ticker: string): string {
  // Crypto's USD pair suffix is a fetch-time-only detail — the bare
  // symbol is what's stored in holdings.ticker and price_cache. Gold's
  // ticker is already the fixed FMP symbol (XAUUSD), used as-is.
  return type === "crypto" ? `${ticker}USD` : ticker;
}

// Read-through: serves a fresh cache hit, otherwise fetches from FMP and
// updates the cache. Returns null (never throws) when FMP has no price
// for this symbol right now — callers fall back to the last cached price
// or "unavailable" (see computeMarketValue).
async function getLivePrice(
  type: CacheableType,
  ticker: string,
  homeCurrency: string
): Promise<number | null> {
  if (!canAttemptLivePrice(type as HoldingType, homeCurrency)) return null;

  const cached = await getCachedPrice(type, ticker);
  if (cached && Date.now() - cached.fetchedAt.getTime() < stalenessMsFor(type as HoldingType)) {
    return cached.price;
  }

  const price = await fetchQuotePrice(fmpQuerySymbol(type, ticker));
  if (price === null) return null;

  await upsertCachedPrice(type, ticker, price);
  return price;
}

// Bypasses the staleness check — used by the manual "Refresh prices"
// action to force a re-fetch regardless of cache age.
export async function forceRefreshPrice(
  type: CacheableType,
  ticker: string
): Promise<number | null> {
  const price = await fetchQuotePrice(fmpQuerySymbol(type, ticker));
  if (price !== null) await upsertCachedPrice(type, ticker, price);
  return price;
}

export interface HoldingForPricing {
  type: HoldingType;
  ticker: string | null;
  quantity: string | number;
  manual_value: string | number | null;
}

export type PriceStatus = "manual" | "live" | "stale_fallback" | "unavailable";

export interface HoldingValue {
  value: number | null;
  status: PriceStatus;
}

function valueFromPrice(holding: HoldingForPricing, price: number): number {
  const quantity = Number(holding.quantity);
  if (holding.type === "gold") {
    return (quantity / TROY_OUNCE_GRAMS) * price;
  }
  return quantity * price;
}

// Implements Data Flow steps 2-4: classification is fixed at add-time by
// whether manual_value is set, not re-derived here.
export async function computeMarketValue(
  holding: HoldingForPricing,
  homeCurrency: string
): Promise<HoldingValue> {
  if (holding.manual_value !== null && holding.manual_value !== undefined) {
    return { value: Number(holding.manual_value), status: "manual" };
  }

  const type = holding.type as CacheableType;
  const ticker = holding.type === "gold" ? GOLD_TICKER : holding.ticker;
  if (!ticker) return { value: null, status: "unavailable" };

  const price = await getLivePrice(type, ticker, homeCurrency);
  if (price !== null) {
    return { value: valueFromPrice(holding, price), status: "live" };
  }

  // FMP unreachable or symbol unquotable right now — fall back to the
  // last cached price if one exists, per Error Handling in the spec.
  const stale = await getCachedPrice(type, ticker);
  if (stale) {
    return { value: valueFromPrice(holding, stale.price), status: "stale_fallback" };
  }

  return { value: null, status: "unavailable" };
}
