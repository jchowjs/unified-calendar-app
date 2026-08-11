import { query } from "./db";
import { fetchQuotePrice } from "./fmp";
import {
  GOLD_TICKER,
  TROY_OUNCE_GRAMS,
  canAttemptLivePrice,
  isAlwaysManual,
  stalenessMsFor,
  type HoldingType,
} from "./holdings-rules";

type CacheableType = "stock" | "etf" | "crypto" | "mutual_fund" | "gold";

interface CachedRate {
  price: number;
  fetchedAt: Date;
}

async function getCachedPrice(type: CacheableType, ticker: string): Promise<CachedRate | null> {
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
async function getLivePrice(type: CacheableType, ticker: string): Promise<number | null> {
  if (!canAttemptLivePrice(type as HoldingType)) return null;

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

const FX_STALENESS_MS = 5 * 60 * 1000;

async function getCachedFxRate(from: string, to: string): Promise<CachedRate | null> {
  const { rows } = await query<{ rate: string; fetched_at: Date }>(
    `select rate, fetched_at from fx_rates where from_currency = $1 and to_currency = $2`,
    [from, to]
  );
  const row = rows[0];
  return row ? { price: Number(row.rate), fetchedAt: row.fetched_at } : null;
}

async function upsertCachedFxRate(from: string, to: string, rate: number) {
  await query(
    `insert into fx_rates (from_currency, to_currency, rate, fetched_at)
     values ($1, $2, $3, now())
     on conflict (from_currency, to_currency) do update set rate = excluded.rate, fetched_at = now()`,
    [from, to, rate]
  );
}

// Read-through FX rate, same pattern as getLivePrice. forceRefresh also
// exists for the manual "Refresh prices" action.
export async function getFxRate(fromCurrency: string, toCurrency: string): Promise<number | null> {
  const cached = await getCachedFxRate(fromCurrency, toCurrency);
  if (cached && Date.now() - cached.fetchedAt.getTime() < FX_STALENESS_MS) {
    return cached.price;
  }

  const rate = await fetchQuotePrice(`${fromCurrency}${toCurrency}`);
  if (rate === null) return null;

  await upsertCachedFxRate(fromCurrency, toCurrency, rate);
  return rate;
}

// Best-effort add-time check: can this currency actually be converted to
// the home currency right now? Used alongside the price-quote check to
// decide whether a manual_value fallback should be required — a holding
// whose price quote succeeds but whose currency can never be converted
// (e.g. an FMP plan without forex access) would otherwise get accepted as
// "live" and then permanently show unavailable at render time.
export async function canConvertToHomeCurrency(
  currency: string,
  homeCurrency: string
): Promise<boolean> {
  if (currency === homeCurrency) return true;
  return (await getFxRate(currency, homeCurrency)) !== null;
}

export async function forceRefreshFxRate(fromCurrency: string, toCurrency: string): Promise<number | null> {
  const rate = await fetchQuotePrice(`${fromCurrency}${toCurrency}`);
  if (rate !== null) await upsertCachedFxRate(fromCurrency, toCurrency, rate);
  return rate;
}

// Converts a value already computed in `currency` into `homeCurrency`.
// `currency === null` means "no conversion" (manual entries — see design
// doc). If a fresh FX rate can't be fetched, falls back to the last
// cached rate regardless of age (same graceful-degradation shape as
// price fallback) rather than losing a value we do have a native-currency
// number for; returns null only if no rate has ever been cached.
async function convertToHomeCurrency(
  nativeValue: number,
  currency: string | null,
  homeCurrency: string
): Promise<number | null> {
  const from = currency ?? homeCurrency;
  if (from === homeCurrency) return nativeValue;

  const rate = await getFxRate(from, homeCurrency);
  if (rate !== null) return nativeValue * rate;

  const stale = await getCachedFxRate(from, homeCurrency);
  return stale ? nativeValue * stale.price : null;
}

export interface HoldingForPricing {
  type: HoldingType;
  ticker: string | null;
  currency: string | null;
  quantity: string | number;
  manual_value: string | number | null;
}

export type PriceStatus = "manual" | "live" | "stale_fallback" | "unavailable";

export interface HoldingValue {
  value: number | null;
  status: PriceStatus;
}

function nativeValueFromPrice(holding: HoldingForPricing, price: number): number {
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
    const manualValue = Number(holding.manual_value);
    if (isAlwaysManual(holding.type)) {
      // bond/insurance_policy/endowus: manual_value already is the
      // holding's total current value (quantity isn't a per-unit price
      // multiplier for these types).
      return { value: manualValue, status: "manual" };
    }
    // stock/etf/crypto/mutual_fund/gold manual fallback: manual_value is
    // a per-unit price (per share/coin/gram), always entered directly in
    // the home currency (see design doc) — no FX conversion applies here,
    // unlike the live path below.
    return { value: Number(holding.quantity) * manualValue, status: "manual" };
  }

  const type = holding.type as CacheableType;
  const ticker = holding.type === "gold" ? GOLD_TICKER : holding.ticker;
  if (!ticker) return { value: null, status: "unavailable" };

  const price = await getLivePrice(type, ticker);
  if (price !== null) {
    const nativeValue = nativeValueFromPrice(holding, price);
    const converted = await convertToHomeCurrency(nativeValue, holding.currency, homeCurrency);
    if (converted !== null) return { value: converted, status: "live" };
    // Have a live price but no FX rate (fresh or cached) to convert it
    // with — can't safely show a number, so this is unavailable, not a
    // silently wrong currency.
    return { value: null, status: "unavailable" };
  }

  // FMP unreachable or symbol unquotable right now — fall back to the
  // last cached price if one exists, per Error Handling in the spec.
  const stale = await getCachedPrice(type, ticker);
  if (stale) {
    const nativeValue = nativeValueFromPrice(holding, stale.price);
    const converted = await convertToHomeCurrency(nativeValue, holding.currency, homeCurrency);
    if (converted !== null) return { value: converted, status: "stale_fallback" };
    return { value: null, status: "unavailable" };
  }

  return { value: null, status: "unavailable" };
}
