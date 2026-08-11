import { formatMoney } from "@/lib/format";
import type { DashboardData } from "@/lib/dashboard";

export function SummaryCards({
  totals,
  currency,
}: {
  totals: DashboardData["totals"];
  currency: string;
}) {
  const cards: { label: string; value: number }[] = [
    { label: "Net worth", value: totals.netWorth },
    { label: "Invested", value: totals.invested },
    { label: "Cash", value: totals.cash },
    { label: "CPF (OA + SA)", value: totals.cpf },
    { label: "SRS", value: totals.srs },
    { label: "Gain / loss", value: totals.gainLoss },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">{card.label}</div>
          <div
            className={`mt-1 text-lg font-semibold ${
              card.label === "Gain / loss"
                ? card.value >= 0
                  ? "text-emerald-600"
                  : "text-red-600"
                : "text-slate-900"
            }`}
          >
            {formatMoney(card.value, currency)}
          </div>
        </div>
      ))}
    </div>
  );
}
