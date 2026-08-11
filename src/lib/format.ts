export function formatMoney(value: number | null, currency: string): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export const TYPE_LABELS: Record<string, string> = {
  stock: "Stock",
  etf: "ETF",
  crypto: "Crypto",
  mutual_fund: "Mutual Fund",
  bond: "Bond",
  insurance_policy: "Insurance Policy",
  gold: "Gold",
  endowus: "Endowus",
};
