"use server";

import { revalidatePath } from "next/cache";
import { env } from "@/lib/env";
import type { HoldingType } from "@/lib/holdings-rules";
import { isFixedQuantityOne, isSrsEligible } from "@/lib/holdings-rules";
import { resolveHoldingInput, type HoldingInput } from "@/lib/holdings-validate";
import { deleteHolding as deleteHoldingRow, insertHolding, updateHolding as updateHoldingRow } from "@/lib/repo";
import { requireAuthenticated } from "@/lib/session";

export type ActionState = { error?: string };

const HOLDING_TYPES: HoldingType[] = [
  "stock",
  "etf",
  "crypto",
  "mutual_fund",
  "bond",
  "insurance_policy",
  "gold",
  "endowus",
];

function readHoldingInput(formData: FormData): HoldingInput | null {
  const type = String(formData.get("type") ?? "");
  if (!HOLDING_TYPES.includes(type as HoldingType)) return null;

  return {
    type: type as HoldingType,
    ticker: String(formData.get("ticker") ?? ""),
    name: String(formData.get("name") ?? ""),
    quantity: String(formData.get("quantity") ?? ""),
    costBasis: String(formData.get("costBasis") ?? ""),
    manualValue: String(formData.get("manualValue") ?? ""),
    account: String(formData.get("account") ?? ""),
  };
}

export async function addHolding(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAuthenticated();

  const input = readHoldingInput(formData);
  if (!input) return { error: "Invalid holding type." };

  const result = await resolveHoldingInput(input, env.homeCurrency);
  if (!result.ok) return { error: result.error };

  await insertHolding(result.data);
  revalidatePath("/");
  return {};
}

export async function updateHolding(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAuthenticated();

  const id = String(formData.get("id") ?? "");
  const type = String(formData.get("type") ?? "") as HoldingType;
  if (!id || !HOLDING_TYPES.includes(type)) return { error: "Invalid request." };

  const name = String(formData.get("name") ?? "").trim();
  const quantityRaw = String(formData.get("quantity") ?? "");
  const costBasisRaw = String(formData.get("costBasis") ?? "");
  const manualValueRaw = String(formData.get("manualValue") ?? "");
  const accountRaw = String(formData.get("account") ?? "");

  let quantity: number | undefined;
  if (!isFixedQuantityOne(type)) {
    const n = Number(quantityRaw);
    if (!Number.isFinite(n) || n <= 0) return { error: "Quantity must be a positive number." };
    quantity = n;
  }

  let costBasis: number | null = null;
  if (costBasisRaw.trim() !== "") {
    const n = Number(costBasisRaw);
    if (!Number.isFinite(n) || n < 0) return { error: "Cost basis must be a non-negative number." };
    costBasis = n;
  }

  let manualValue: number | null = null;
  if (manualValueRaw.trim() !== "") {
    const n = Number(manualValueRaw);
    if (!Number.isFinite(n) || n < 0) return { error: "Value must be a non-negative number." };
    manualValue = n;
  }

  const account = isSrsEligible(type) && accountRaw === "srs" ? "srs" : "brokerage";

  await updateHoldingRow(id, {
    name: name || undefined,
    quantity,
    costBasis,
    manualValue,
    account,
  });
  revalidatePath("/");
  return {};
}

export async function deleteHolding(id: string): Promise<void> {
  await requireAuthenticated();
  await deleteHoldingRow(id);
  revalidatePath("/");
}
