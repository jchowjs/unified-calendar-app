"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { env } from "@/lib/env";
import { forceRefreshFxRate, forceRefreshPrice } from "@/lib/pricing";
import { requireAuthenticated } from "@/lib/session";

export async function refreshPrices(): Promise<void> {
  await requireAuthenticated();

  const { rows } = await query<{ type: string; ticker: string; currency: string | null }>(
    `select distinct type, ticker, currency from holdings
     where manual_value is null and ticker is not null
       and type in ('stock', 'etf', 'crypto', 'mutual_fund', 'gold')`
  );

  const homeCurrency = env.homeCurrency;
  const currencies = new Set(
    rows.map((r) => r.currency).filter((c): c is string => c !== null && c !== homeCurrency)
  );

  await Promise.all([
    ...rows.map((row) =>
      forceRefreshPrice(row.type as "stock" | "etf" | "crypto" | "mutual_fund" | "gold", row.ticker)
    ),
    ...Array.from(currencies).map((currency) => forceRefreshFxRate(currency, homeCurrency)),
  ]);

  revalidatePath("/");
}
