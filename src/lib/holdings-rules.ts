export type HoldingType =
  | "stock"
  | "etf"
  | "crypto"
  | "mutual_fund"
  | "bond"
  | "insurance_policy"
  | "gold"
  | "endowus";

export type HoldingAccount = "brokerage" | "srs";

// Types that ever attempt live FMP pricing (subject to further conditions
// below); everything else is always manual_value.
export const LIVE_PRICE_TYPES: HoldingType[] = [
  "stock",
  "etf",
  "crypto",
  "mutual_fund",
  "gold",
];

export const ALWAYS_MANUAL_TYPES: HoldingType[] = [
  "bond",
  "insurance_policy",
  "endowus",
];

// quantity is fixed at 1 server-side for these — they represent a single
// whole holding (a policy, a portfolio), not a per-unit position.
export const FIXED_QUANTITY_ONE_TYPES: HoldingType[] = [
  "insurance_policy",
  "endowus",
];

// Types SRS funds can actually be invested in; everything else is forced
// to account='brokerage'.
export const SRS_ELIGIBLE_TYPES: HoldingType[] = [
  "stock",
  "etf",
  "mutual_fund",
  "endowus",
];

// Types requiring FMP symbol-search canonicalization at add-time (as
// opposed to crypto's bare-symbol validation or gold's fixed ticker).
export const SYMBOL_SEARCH_TYPES: HoldingType[] = ["stock", "etf", "mutual_fund"];

export const GOLD_TICKER = "XAUUSD";
export const TROY_OUNCE_GRAMS = 31.1034768;

// 5 minutes for stock/etf/crypto/gold, 24 hours for mutual funds (NAV
// only updates once per trading day).
export function stalenessMsFor(type: HoldingType): number {
  return type === "mutual_fund" ? 24 * 60 * 60 * 1000 : 5 * 60 * 1000;
}

export function isFixedQuantityOne(type: HoldingType): boolean {
  return FIXED_QUANTITY_ONE_TYPES.includes(type);
}

export function isSrsEligible(type: HoldingType): boolean {
  return SRS_ELIGIBLE_TYPES.includes(type);
}

export function isAlwaysManual(type: HoldingType): boolean {
  return ALWAYS_MANUAL_TYPES.includes(type);
}

// Whether this holding type can even attempt a live price under the
// current home currency (crypto/gold require HOME_CURRENCY=USD; stock/
// etf/mutual_fund always attempt). Does not account for a specific FMP
// plan lacking access to a type — that's handled at fetch time by
// falling back to manual_value on failure (see lib/pricing.ts).
export function canAttemptLivePrice(type: HoldingType, homeCurrency: string): boolean {
  if (isAlwaysManual(type)) return false;
  if (type === "crypto" || type === "gold") return homeCurrency === "USD";
  return true;
}
