"use client";

import { useActionState, useState } from "react";
import { addCash, deleteCash, updateCash, type ActionState } from "@/app/actions/cash";
import { formatMoney } from "@/lib/format";
import type { CashRow } from "@/lib/repo";

const initialState: ActionState = {};

function CashItem({ cash, currency }: { cash: CashRow; currency: string }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(updateCash, initialState);

  // Adjusting state during render (see React docs) rather than in an
  // effect: exit edit mode once a save completes successfully.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (!state.error) setEditing(false);
  }

  if (!editing) {
    return (
      <li className="flex items-center justify-between py-1.5 text-sm">
        <span>{cash.label}</span>
        <span className="flex items-center gap-3">
          <span>{formatMoney(Number(cash.amount), currency)}</span>
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-slate-600 hover:underline">
            Edit
          </button>
          <form action={deleteCash.bind(null, cash.id)}>
            <button type="submit" className="text-xs text-red-600 hover:underline">
              Delete
            </button>
          </form>
        </span>
      </li>
    );
  }

  return (
    <li className="py-1.5">
      <form
        action={(fd) => {
          fd.set("id", cash.id);
          formAction(fd);
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input name="label" defaultValue={cash.label} className="input" />
        <input name="amount" type="number" step="any" defaultValue={cash.amount} className="input w-28" />
        <button type="submit" disabled={pending} className="rounded-md bg-slate-900 px-2 py-1 text-xs text-white">
          Save
        </button>
        <button type="button" onClick={() => setEditing(false)} className="rounded-md border border-slate-300 px-2 py-1 text-xs">
          Cancel
        </button>
      </form>
      {state.error ? <p className="mt-1 text-xs text-red-600">{state.error}</p> : null}
    </li>
  );
}

export function CashSection({ cash, currency }: { cash: CashRow[]; currency: string }) {
  const [addState, addAction, addPending] = useActionState(addCash, initialState);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">Cash</h2>
      <ul className="mt-2 divide-y divide-slate-100">
        {cash.length === 0 ? (
          <li className="py-1.5 text-sm text-slate-500">No cash entries yet.</li>
        ) : (
          cash.map((c) => <CashItem key={c.id} cash={c} currency={currency} />)
        )}
      </ul>
      <form action={addAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
        <label className="flex flex-col gap-0.5 text-xs text-slate-600">
          Label
          <input name="label" className="input" placeholder="e.g. DBS Savings" />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-slate-600">
          Amount
          <input name="amount" type="number" step="any" className="input w-28" />
        </label>
        <button
          type="submit"
          disabled={addPending}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {addPending ? "Adding…" : "Add cash"}
        </button>
        {addState.error ? <p className="w-full text-xs text-red-600">{addState.error}</p> : null}
      </form>
    </div>
  );
}
