"use server";

import { revalidatePath } from "next/cache";
import { deleteCash as deleteCashRow, insertCash, updateCash as updateCashRow } from "@/lib/repo";
import { requireAuthenticated } from "@/lib/session";

export type ActionState = { error?: string };

function parseAmount(raw: string): number | { error: string } {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return { error: "Amount must be a non-negative number." };
  return n;
}

export async function addCash(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  await requireAuthenticated();

  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { error: "Label is required." };

  const amount = parseAmount(String(formData.get("amount") ?? ""));
  if (typeof amount === "object") return { error: amount.error };

  await insertCash(label, amount);
  revalidatePath("/");
  return {};
}

export async function updateCash(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  await requireAuthenticated();

  const id = String(formData.get("id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  if (!id || !label) return { error: "Label is required." };

  const amount = parseAmount(String(formData.get("amount") ?? ""));
  if (typeof amount === "object") return { error: amount.error };

  await updateCashRow(id, label, amount);
  revalidatePath("/");
  return {};
}

export async function deleteCash(id: string): Promise<void> {
  await requireAuthenticated();
  await deleteCashRow(id);
  revalidatePath("/");
}
