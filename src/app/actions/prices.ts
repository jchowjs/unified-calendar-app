"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { forceRefreshPrice } from "@/lib/pricing";
import { requireAuthenticated } from "@/lib/session";

export async function refreshPrices(): Promise<void> {
  await requireAuthenticated();

  const { rows } = await query<{ type: string; ticker: string }>(
    `select distinct type, ticker from holdings
     where manual_value is null and ticker is not null
       and type in ('stock', 'etf', 'crypto', 'mutual_fund', 'gold')`
  );

  await Promise.all(
    rows.map((row) =>
      forceRefreshPrice(row.type as "stock" | "etf" | "crypto" | "mutual_fund" | "gold", row.ticker)
    )
  );

  revalidatePath("/");
}
