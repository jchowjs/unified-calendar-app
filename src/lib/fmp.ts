import { env } from "./env";

// FMP's "stable" API (https://financialmodelingprep.com/developer/docs)
// exposes a unified /quote endpoint across stocks, ETFs, crypto pairs,
// mutual funds, and commodities — one symbol format, one response shape.
// Endpoint paths/response fields should be spot-checked against the
// user's actual FMP plan once a real API key is wired in; a plan that
// lacks access to a given asset class will surface as a fetch failure
// here, which callers (see lib/pricing.ts) treat the same as "price
// unavailable" and fall back to manual_value.
const FMP_BASE = "https://financialmodelingprep.com/stable";

export class FmpError extends Error {}

interface FmpQuote {
  symbol: string;
  price: number;
}

interface FmpSearchResult {
  symbol: string;
  name: string;
  currency?: string;
  exchangeFullName?: string;
}

async function fmpFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${FMP_BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("apikey", env.fmpApiKey);

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new FmpError(`FMP request to ${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// Returns null (rather than throwing) when the symbol isn't quotable —
// covers both "symbol doesn't exist" and "plan doesn't cover this asset
// class", which callers treat identically.
export async function fetchQuotePrice(symbol: string): Promise<number | null> {
  try {
    const results = await fmpFetch<FmpQuote[]>("quote", { symbol });
    const price = results[0]?.price;
    return typeof price === "number" ? price : null;
  } catch {
    return null;
  }
}

export async function searchSymbol(query: string): Promise<FmpSearchResult[]> {
  return fmpFetch<FmpSearchResult[]>("search-symbol", { query });
}
