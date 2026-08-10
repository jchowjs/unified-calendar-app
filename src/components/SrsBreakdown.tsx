import { formatMoney } from "@/lib/format";

export function SrsBreakdown({
  invested,
  srs,
  currency,
}: {
  invested: number;
  srs: number;
  currency: string;
}) {
  const brokerage = invested - srs;
  const items = [
    { label: "Brokerage", value: brokerage },
    { label: "SRS", value: srs },
  ].filter((i) => i.value > 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">Brokerage vs. SRS</h2>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">No invested holdings yet.</p>
        ) : (
          items.map((item) => {
            const pct = invested > 0 ? (item.value / invested) * 100 : 0;
            return (
              <div key={item.label}>
                <div className="flex justify-between text-xs text-slate-600">
                  <span>{item.label}</span>
                  <span>
                    {formatMoney(item.value, currency)} ({pct.toFixed(1)}%)
                  </span>
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-indigo-600"
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
