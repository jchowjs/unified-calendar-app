import { formatMoney, TYPE_LABELS } from "@/lib/format";
import type { AllocationSlice } from "@/lib/dashboard";

const LABELS: Record<string, string> = {
  ...TYPE_LABELS,
  cash: "Cash",
  cpf: "CPF",
};

export function AllocationBreakdown({
  allocation,
  netWorth,
  currency,
}: {
  allocation: AllocationSlice[];
  netWorth: number;
  currency: string;
}) {
  const sorted = [...allocation].sort((a, b) => b.value - a.value);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">Allocation</h2>
      <div className="mt-3 space-y-2">
        {sorted.length === 0 ? (
          <p className="text-sm text-slate-500">No holdings yet.</p>
        ) : (
          sorted.map((slice) => {
            const pct = netWorth > 0 ? (slice.value / netWorth) * 100 : 0;
            return (
              <div key={slice.label}>
                <div className="flex justify-between text-xs text-slate-600">
                  <span>{LABELS[slice.label] ?? slice.label}</span>
                  <span>
                    {formatMoney(slice.value, currency)} ({pct.toFixed(1)}%)
                  </span>
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-slate-700"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
