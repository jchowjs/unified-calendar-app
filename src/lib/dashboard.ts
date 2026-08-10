import { computeMarketValue, type PriceStatus } from "./pricing";
import { getCpfBalances, listCashEntries, listHoldings, type CashRow, type CpfBalances, type HoldingRow } from "./repo";

export interface HoldingWithValue extends HoldingRow {
  value: number | null;
  status: PriceStatus;
}

export interface AllocationSlice {
  label: string;
  value: number;
}

export interface DashboardData {
  holdings: HoldingWithValue[];
  cash: CashRow[];
  cpf: CpfBalances;
  totals: {
    netWorth: number;
    invested: number;
    cash: number;
    cpf: number;
    srs: number;
    gainLoss: number;
  };
  allocation: AllocationSlice[];
}

export async function loadDashboardData(homeCurrency: string): Promise<DashboardData> {
  const [holdingRows, cash, cpf] = await Promise.all([
    listHoldings(),
    listCashEntries(),
    getCpfBalances(),
  ]);

  const holdings: HoldingWithValue[] = await Promise.all(
    holdingRows.map(async (h) => {
      const { value, status } = await computeMarketValue(
        { type: h.type, ticker: h.ticker, quantity: h.quantity, manual_value: h.manual_value },
        homeCurrency
      );
      return { ...h, value, status };
    })
  );

  const invested = holdings.reduce((sum, h) => sum + (h.value ?? 0), 0);
  const cashTotal = cash.reduce((sum, c) => sum + Number(c.amount), 0);
  const cpfTotal = Number(cpf.oa_amount) + Number(cpf.sa_amount);
  const srsTotal = holdings
    .filter((h) => h.account === "srs")
    .reduce((sum, h) => sum + (h.value ?? 0), 0);
  const gainLoss = holdings.reduce((sum, h) => {
    if (h.cost_basis === null || h.value === null) return sum;
    return sum + (h.value - Number(h.cost_basis));
  }, 0);

  const allocationByType = new Map<string, number>();
  for (const h of holdings) {
    allocationByType.set(h.type, (allocationByType.get(h.type) ?? 0) + (h.value ?? 0));
  }
  const allocation: AllocationSlice[] = [
    ...Array.from(allocationByType.entries()).map(([label, value]) => ({ label, value })),
    { label: "cash", value: cashTotal },
    { label: "cpf", value: cpfTotal },
  ].filter((slice) => slice.value > 0);

  return {
    holdings,
    cash,
    cpf,
    totals: {
      netWorth: invested + cashTotal + cpfTotal,
      invested,
      cash: cashTotal,
      cpf: cpfTotal,
      srs: srsTotal,
      gainLoss,
    },
    allocation,
  };
}
