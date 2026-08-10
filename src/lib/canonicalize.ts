import { fetchQuotePrice, searchSymbol } from "./fmp";

export interface CanonicalTicker {
  ticker: string;
  name: string;
}

export type SymbolSearchResult =
  | { status: "found"; ticker: string; name: string }
  | { status: "not_found" }
  // FMP request itself failed (network, rate limit, bad/restricted key)
  // — distinct from a genuine zero-result search, so the caller can give
  // an honest error rather than implying the ticker doesn't exist.
  | { status: "search_unavailable" };

// stock/etf/mutual_fund: resolve the user's input against FMP symbol
// search and store the canonical result — never the raw input — so
// holdings.ticker and price_cache.ticker are always already in the same
// form (see design doc's Data Model notes).
export async function canonicalizeViaSymbolSearch(
  rawInput: string
): Promise<SymbolSearchResult> {
  const query = rawInput.trim();
  if (!query) return { status: "not_found" };

  let results;
  try {
    results = await searchSymbol(query);
  } catch {
    return { status: "search_unavailable" };
  }
  if (results.length === 0) return { status: "not_found" };

  const exact = results.find((r) => r.symbol.toUpperCase() === query.toUpperCase());
  const match = exact ?? results[0];
  return { status: "found", ticker: match.symbol, name: match.name };
}

export interface CanonicalCrypto extends CanonicalTicker {
  // Whether FMP could actually quote this pair right now. false means
  // either HOME_CURRENCY isn't USD (never attempted) or the quote call
  // failed (invalid symbol or a plan without crypto access — the two
  // aren't distinguishable from here) — either way the caller should
  // require manual_value as a fallback rather than hard-reject, since
  // rejecting a symbol that's merely unquotable-right-now would be too
  // strict for a personal app.
  liveQuoteConfirmed: boolean;
}

// crypto: no generic symbol-search lookup. Uppercase the bare asset
// symbol (format-validated only) and, when it would actually be
// live-priced (HOME_CURRENCY = USD), best-effort confirm FMP can quote
// the USD pair.
export async function canonicalizeCryptoSymbol(
  rawInput: string,
  homeCurrency: string
): Promise<CanonicalCrypto | null> {
  const ticker = rawInput.trim().toUpperCase();
  if (!/^[A-Z0-9]+$/.test(ticker)) return null;

  let liveQuoteConfirmed = false;
  if (homeCurrency === "USD") {
    liveQuoteConfirmed = (await fetchQuotePrice(`${ticker}USD`)) !== null;
  }

  return { ticker, name: ticker, liveQuoteConfirmed };
}
