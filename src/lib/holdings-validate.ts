import { canonicalizeCryptoSymbol, canonicalizeViaSymbolSearch } from "./canonicalize";
import { fetchQuotePrice } from "./fmp";
import { canConvertToHomeCurrency } from "./pricing";
import {
  GOLD_TICKER,
  isFixedQuantityOne,
  isSrsEligible,
  type HoldingAccount,
  type HoldingType,
} from "./holdings-rules";

export interface HoldingInput {
  type: HoldingType;
  ticker?: string;
  name?: string;
  quantity?: string;
  costBasis?: string;
  manualValue?: string;
  account?: string;
}

export interface ResolvedHolding {
  type: HoldingType;
  account: HoldingAccount;
  ticker: string | null;
  currency: string | null;
  name: string;
  quantity: number;
  costBasis: number | null;
  manualValue: number | null;
}

export type ValidationResult =
  | { ok: true; data: ResolvedHolding }
  | { ok: false; error: string };

function parsePositiveNumber(raw: string | undefined, field: string): number | { error: string } {
  if (raw === undefined || raw.trim() === "") return { error: `${field} is required.` };
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return { error: `${field} must be a positive number.` };
  return n;
}

function parseOptionalNonNegativeNumber(raw: string | undefined): number | null | { error: string } {
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return { error: "Must be a non-negative number." };
  return n;
}

export async function resolveHoldingInput(
  input: HoldingInput,
  homeCurrency: string
): Promise<ValidationResult> {
  const account: HoldingAccount =
    isSrsEligible(input.type) && input.account === "srs" ? "srs" : "brokerage";

  const costBasis = parseOptionalNonNegativeNumber(input.costBasis);
  if (typeof costBasis === "object" && costBasis !== null) {
    return { ok: false, error: `Cost basis: ${costBasis.error}` };
  }

  const manualValueInput = parseOptionalNonNegativeNumber(input.manualValue);
  if (typeof manualValueInput === "object" && manualValueInput !== null) {
    return { ok: false, error: `Value: ${manualValueInput.error}` };
  }

  switch (input.type) {
    case "bond":
    case "insurance_policy":
    case "endowus": {
      if (manualValueInput === null) {
        return { ok: false, error: "Value is required for this holding type." };
      }
      const quantity = isFixedQuantityOne(input.type) ? 1 : parsePositiveNumber(input.quantity, "Quantity");
      if (typeof quantity === "object") return { ok: false, error: quantity.error };
      return {
        ok: true,
        data: {
          type: input.type,
          account,
          ticker: null,
          // Manual entries are always keyed in directly, in the home
          // currency — never converted (see design doc).
          currency: homeCurrency,
          name: (input.name ?? "").trim() || defaultName(input.type),
          quantity,
          costBasis,
          manualValue: manualValueInput,
        },
      };
    }

    case "stock":
    case "etf":
    case "mutual_fund": {
      const quantity = parsePositiveNumber(input.quantity, "Quantity");
      if (typeof quantity === "object") return { ok: false, error: quantity.error };

      const resolved = await canonicalizeViaSymbolSearch(input.ticker ?? "", homeCurrency);
      if (resolved.status === "not_found") {
        return { ok: false, error: "Ticker not found." };
      }
      if (resolved.status === "search_unavailable") {
        return {
          ok: false,
          error: "Couldn't verify this ticker right now (lookup failed) — try again shortly.",
        };
      }

      const manualValue = manualValueInput;
      if (manualValue === null) {
        // Best-effort: if FMP can't quote it right now (unlisted symbol,
        // an exchange/asset class outside the current plan's coverage,
        // etc.) OR the quote succeeds but the currency can't be converted
        // to the home currency (e.g. an FMP plan without forex access),
        // require a manual fallback rather than accepting a holding that
        // would sit permanently "unavailable" at render time. Applies
        // uniformly to stock/etf/mutual_fund — there's no way to know in
        // advance which tickers/currencies a given FMP plan covers.
        const price = await fetchQuotePrice(resolved.ticker);
        const fxOk = price !== null && (await canConvertToHomeCurrency(resolved.currency, homeCurrency));
        if (!fxOk) {
          return {
            ok: false,
            error:
              price === null
                ? "Couldn't fetch a live price for this ticker right now — enter its current value manually to continue."
                : `Got a live price, but couldn't fetch the ${resolved.currency}→${homeCurrency} exchange rate right now — enter its current value manually to continue.`,
          };
        }
      }

      return {
        ok: true,
        data: {
          type: input.type,
          account,
          ticker: resolved.ticker,
          currency: resolved.currency,
          name: (input.name ?? "").trim() || resolved.name,
          quantity,
          costBasis,
          manualValue,
        },
      };
    }

    case "crypto": {
      const quantity = parsePositiveNumber(input.quantity, "Quantity");
      if (typeof quantity === "object") return { ok: false, error: quantity.error };

      const resolved = await canonicalizeCryptoSymbol(input.ticker ?? "");
      if (!resolved) {
        return { ok: false, error: "Enter a valid crypto symbol (letters/numbers only)." };
      }

      const manualValue = manualValueInput;
      if (manualValue === null) {
        const fxOk =
          resolved.liveQuoteConfirmed && (await canConvertToHomeCurrency(resolved.currency, homeCurrency));
        if (!fxOk) {
          return {
            ok: false,
            error: !resolved.liveQuoteConfirmed
              ? "Couldn't fetch a live price for this symbol — enter its current value manually to continue."
              : `Got a live price, but couldn't fetch the USD→${homeCurrency} exchange rate right now — enter its current value manually to continue.`,
          };
        }
      }

      return {
        ok: true,
        data: {
          type: "crypto",
          account: "brokerage",
          ticker: resolved.ticker,
          currency: resolved.currency,
          name: (input.name ?? "").trim() || resolved.name,
          quantity,
          costBasis,
          manualValue,
        },
      };
    }

    case "gold": {
      const quantity = parsePositiveNumber(input.quantity, "Quantity (grams)");
      if (typeof quantity === "object") return { ok: false, error: quantity.error };

      const manualValue = manualValueInput;
      if (manualValue === null) {
        const liveQuoteConfirmed = (await fetchQuotePrice(GOLD_TICKER)) !== null;
        const fxOk = liveQuoteConfirmed && (await canConvertToHomeCurrency("USD", homeCurrency));
        if (!fxOk) {
          return {
            ok: false,
            error: !liveQuoteConfirmed
              ? "Couldn't fetch a live gold price — enter its current value manually to continue."
              : `Got a live gold price, but couldn't fetch the USD→${homeCurrency} exchange rate right now — enter its current value manually to continue.`,
          };
        }
      }

      return {
        ok: true,
        data: {
          type: "gold",
          account: "brokerage",
          ticker: GOLD_TICKER,
          currency: "USD",
          name: (input.name ?? "").trim() || "Gold",
          quantity,
          costBasis,
          manualValue,
        },
      };
    }
  }

  return { ok: false, error: "Unknown holding type." };
}

function defaultName(type: HoldingType): string {
  switch (type) {
    case "insurance_policy":
      return "Insurance policy";
    case "endowus":
      return "Endowus portfolio";
    case "bond":
      return "Bond";
    default:
      return type;
  }
}
