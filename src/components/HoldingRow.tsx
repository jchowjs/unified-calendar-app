"use client";

import { useActionState, useState, type ReactNode } from "react";
import { deleteHolding, updateHolding, type ActionState } from "@/app/actions/holdings";
import { formatMoney, TYPE_LABELS } from "@/lib/format";
import type { HoldingWithValue } from "@/lib/dashboard";

const STATUS_LABELS: Record<string, string> = {
  manual: "manual",
  live: "live",
  stale_fallback: "stale",
  unavailable: "unavailable",
};

const SRS_ELIGIBLE = new Set(["stock", "etf", "mutual_fund", "endowus"]);
const FIXED_QUANTITY_ONE = new Set(["insurance_policy", "endowus"]);

const MANUAL_VALUE_LABELS: Record<string, string> = {
  bond: "Total value",
  insurance_policy: "Surrender value",
  endowus: "Portfolio value",
  crypto: "Price per coin",
  gold: "Price per gram",
  mutual_fund: "Price per unit",
  stock: "Price per share",
  etf: "Price per share",
};

const initialState: ActionState = {};

export function HoldingRow({ holding, currency }: { holding: HoldingWithValue; currency: string }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(updateHolding, initialState);

  // Exit edit mode once a save completes successfully (adjusting state
  // during render, per React's guidance, rather than in an effect): each
  // time the action produces a new result object, react to it once here.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (!state.error) setEditing(false);
  }

  if (!editing) {
    const gainLoss =
      holding.cost_basis !== null && holding.value !== null
        ? holding.value - Number(holding.cost_basis)
        : null;

    return (
      <tr className="border-b border-slate-100">
        <td className="py-2 pr-3">{TYPE_LABELS[holding.type] ?? holding.type}</td>
        <td className="py-2 pr-3">{holding.account === "srs" ? "SRS" : "Brokerage"}</td>
        <td className="py-2 pr-3">
          {holding.name}
          {holding.ticker ? <span className="text-slate-400"> · {holding.ticker}</span> : null}
        </td>
        <td className="py-2 pr-3">{Number(holding.quantity).toLocaleString()}</td>
        <td className="py-2 pr-3">{formatMoney(holding.value, currency)}</td>
        <td
          className={`py-2 pr-3 ${
            gainLoss === null ? "text-slate-400" : gainLoss >= 0 ? "text-emerald-600" : "text-red-600"
          }`}
        >
          {gainLoss === null ? "—" : formatMoney(gainLoss, currency)}
        </td>
        <td className="py-2 pr-3 text-xs text-slate-500">{STATUS_LABELS[holding.status]}</td>
        <td className="py-2 pr-3 whitespace-nowrap">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mr-3 text-xs text-slate-600 hover:underline"
          >
            Edit
          </button>
          <form action={deleteHolding.bind(null, holding.id)} className="inline">
            <button type="submit" className="text-xs text-red-600 hover:underline">
              Delete
            </button>
          </form>
        </td>
      </tr>
    );
  }

  const fixedQuantity = FIXED_QUANTITY_ONE.has(holding.type);
  const srsEligible = SRS_ELIGIBLE.has(holding.type);

  return (
    <tr className="border-b border-slate-100 bg-slate-50">
      <td colSpan={8} className="py-3">
        <form
          action={(fd) => {
            fd.set("id", holding.id);
            fd.set("type", holding.type);
            formAction(fd);
          }}
          className="flex flex-wrap items-end gap-2 px-1"
        >
          <Field label="Name">
            <input name="name" defaultValue={holding.name} className="input" />
          </Field>
          {!fixedQuantity && (
            <Field label="Quantity">
              <input
                name="quantity"
                type="number"
                step="any"
                defaultValue={holding.quantity}
                className="input w-28"
              />
            </Field>
          )}
          <Field label="Cost basis">
            <input
              name="costBasis"
              type="number"
              step="any"
              defaultValue={holding.cost_basis ?? ""}
              className="input w-28"
            />
          </Field>
          <Field label={MANUAL_VALUE_LABELS[holding.type] ?? "Manual value"}>
            <input
              name="manualValue"
              type="number"
              step="any"
              defaultValue={holding.manual_value ?? ""}
              className="input w-28"
            />
          </Field>
          {srsEligible && (
            <Field label="Account">
              <select name="account" defaultValue={holding.account} className="input">
                <option value="brokerage">Brokerage</option>
                <option value="srs">SRS</option>
              </select>
            </Field>
          )}
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs"
          >
            Cancel
          </button>
        </form>
        {state.error ? <p className="mt-1 px-1 text-xs text-red-600">{state.error}</p> : null}
      </td>
    </tr>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5 text-xs text-slate-600">
      {label}
      {children}
    </label>
  );
}
