"use client";

import { useActionState } from "react";
import { updateCpfBalances, type ActionState } from "@/app/actions/cpf";
import type { CpfBalances } from "@/lib/repo";

const initialState: ActionState = {};

export function CpfSection({ cpf, currency }: { cpf: CpfBalances; currency: string }) {
  const [state, formAction, pending] = useActionState(updateCpfBalances, initialState);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">CPF ({currency})</h2>
      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5 text-xs text-slate-600">
          Ordinary Account (OA)
          <input name="oaAmount" type="number" step="any" defaultValue={cpf.oa_amount} className="input w-32" />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-slate-600">
          Special Account (SA)
          <input name="saAmount" type="number" step="any" defaultValue={cpf.sa_amount} className="input w-32" />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state.error ? <p className="w-full text-xs text-red-600">{state.error}</p> : null}
      </form>
    </div>
  );
}
