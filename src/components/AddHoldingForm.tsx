"use client";

import { useActionState, useState } from "react";
import { addHolding, type ActionState } from "@/app/actions/holdings";
import { TYPE_LABELS } from "@/lib/format";

const HOLDING_TYPES = [
  "stock",
  "etf",
  "crypto",
  "mutual_fund",
  "bond",
  "insurance_policy",
  "gold",
  "endowus",
] as const;

const SRS_ELIGIBLE = new Set(["stock", "etf", "mutual_fund", "endowus"]);
const FIXED_QUANTITY_ONE = new Set(["insurance_policy", "endowus"]);
const NO_TICKER = new Set(["bond", "insurance_policy", "endowus"]);
const MANUAL_VALUE_HINTS: Record<string, string> = {
  bond: "Current total value (required)",
  insurance_policy: "Current surrender value (required)",
  endowus: "Current portfolio value (required)",
  crypto: "Price per coin (required if price can't be fetched live)",
  gold: "Price per gram (required if price can't be fetched live)",
  mutual_fund: "Price per unit (required if price can't be fetched live)",
  stock: "Price per share (required if price can't be fetched live)",
  etf: "Price per share (required if price can't be fetched live)",
};

const initialState: ActionState = {};

// Types priced by ticker (via FMP or a manual fallback for the same
// symbol) — these are the ones live prices get FX-converted for.
// Bond/insurance_policy/endowus are always manually valued directly in
// the home currency, so there's nothing to convert.
const PRICED_BY_TICKER = new Set(["stock", "etf", "crypto", "mutual_fund", "gold"]);

export function AddHoldingForm({ homeCurrency }: { homeCurrency: string }) {
  const [type, setType] = useState<(typeof HOLDING_TYPES)[number]>("stock");
  const [state, formAction, pending] = useActionState(addHolding, initialState);

  const showTicker = !NO_TICKER.has(type);
  const showQuantity = !FIXED_QUANTITY_ONE.has(type);
  const showAccount = SRS_ELIGIBLE.has(type);
  const showCurrencyNote = PRICED_BY_TICKER.has(type);

  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
      {showCurrencyNote && (
        <p className="w-full text-xs text-slate-500">
          Live prices are fetched in the security&apos;s own listing currency and converted to{" "}
          <strong>{homeCurrency}</strong> automatically using the current exchange rate. If a manual
          value is needed instead (fallback), enter it directly in {homeCurrency}.
        </p>
      )}
      <label className="flex flex-col gap-0.5 text-xs text-slate-600">
        Type
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as (typeof HOLDING_TYPES)[number])}
          className="input"
        >
          {HOLDING_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>

      {showTicker && (
        <label className="flex flex-col gap-0.5 text-xs text-slate-600">
          {type === "crypto" ? "Symbol (e.g. BTC)" : "Ticker"}
          <input name="ticker" className="input" />
        </label>
      )}

      <label className="flex flex-col gap-0.5 text-xs text-slate-600">
        Name{NO_TICKER.has(type) ? " (required)" : " (optional)"}
        <input name="name" className="input" />
      </label>

      {showQuantity && (
        <label className="flex flex-col gap-0.5 text-xs text-slate-600">
          {type === "gold" ? "Quantity (grams)" : "Quantity"}
          <input name="quantity" type="number" step="any" className="input w-28" />
        </label>
      )}

      <label className="flex flex-col gap-0.5 text-xs text-slate-600">
        Cost basis (optional)
        <input name="costBasis" type="number" step="any" className="input w-28" />
      </label>

      {/* Always shown: bond/insurance_policy/endowus always need it,
          and stock/etf/crypto/mutual_fund/gold need it as a fallback
          whenever FMP can't quote the resolved ticker (see
          holdings-validate.ts). */}
      <label className="flex flex-col gap-0.5 text-xs text-slate-600">
        {MANUAL_VALUE_HINTS[type] ?? "Value"}
        <input name="manualValue" type="number" step="any" className="input w-28" />
      </label>

      {showAccount && (
        <label className="flex flex-col gap-0.5 text-xs text-slate-600">
          Account
          <select name="account" defaultValue="brokerage" className="input">
            <option value="brokerage">Brokerage</option>
            <option value="srs">SRS</option>
          </select>
        </label>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add holding"}
      </button>

      {state.error ? <p className="w-full text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
