import type { HoldingWithValue } from "@/lib/dashboard";
import { HoldingRow } from "./HoldingRow";

export function HoldingsTable({
  holdings,
  currency,
}: {
  holdings: HoldingWithValue[];
  currency: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">Holdings</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-slate-500">
              <th className="py-2 pr-3">Type</th>
              <th className="py-2 pr-3">Account</th>
              <th className="py-2 pr-3">Name / Ticker</th>
              <th className="py-2 pr-3">Quantity</th>
              <th className="py-2 pr-3">Value</th>
              <th className="py-2 pr-3">Gain / Loss</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3" />
            </tr>
          </thead>
          <tbody>
            {holdings.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-4 text-sm text-slate-500">
                  No holdings yet — add one below.
                </td>
              </tr>
            ) : (
              holdings.map((h) => <HoldingRow key={h.id} holding={h} currency={currency} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
