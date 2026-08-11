import { logout } from "@/app/actions/session";
import { refreshPrices } from "@/app/actions/prices";
import { loadDashboardData } from "@/lib/dashboard";
import { env } from "@/lib/env";
import { AddHoldingForm } from "@/components/AddHoldingForm";
import { AllocationBreakdown } from "@/components/AllocationBreakdown";
import { CashSection } from "@/components/CashSection";
import { CpfSection } from "@/components/CpfSection";
import { HoldingsTable } from "@/components/HoldingsTable";
import { SrsBreakdown } from "@/components/SrsBreakdown";
import { SummaryCards } from "@/components/SummaryCards";

// This page reads live DB/price state on every request and must never be
// statically prerendered — a build-time snapshot would otherwise get
// served as permanently stale HTML.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const currency = env.homeCurrency;
  const data = await loadDashboardData(currency);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Portfolio Dashboard</h1>
        <div className="flex items-center gap-3">
          <form action={refreshPrices}>
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100"
            >
              Refresh prices
            </button>
          </form>
          <form action={logout}>
            <button type="submit" className="text-xs text-slate-500 hover:underline">
              Log out
            </button>
          </form>
        </div>
      </div>

      <SummaryCards totals={data.totals} currency={currency} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AllocationBreakdown allocation={data.allocation} netWorth={data.totals.netWorth} currency={currency} />
        <SrsBreakdown invested={data.totals.invested} srs={data.totals.srs} currency={currency} />
      </div>

      <div>
        <HoldingsTable holdings={data.holdings} currency={currency} />
        <div className="mt-[-1px] rounded-b-lg border border-t-0 border-slate-200 bg-white p-4">
          <AddHoldingForm homeCurrency={currency} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CashSection cash={data.cash} currency={currency} />
        <CpfSection cpf={data.cpf} currency={currency} />
      </div>
    </main>
  );
}
