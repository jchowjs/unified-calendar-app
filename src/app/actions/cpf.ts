"use server";

import { revalidatePath } from "next/cache";
import { updateCpfBalances as updateCpfBalancesRow } from "@/lib/repo";
import { requireAuthenticated } from "@/lib/session";

export type ActionState = { error?: string };

export async function updateCpfBalances(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAuthenticated();

  const oa = Number(formData.get("oaAmount") ?? "");
  const sa = Number(formData.get("saAmount") ?? "");
  if (!Number.isFinite(oa) || oa < 0 || !Number.isFinite(sa) || sa < 0) {
    return { error: "OA and SA balances must be non-negative numbers." };
  }

  await updateCpfBalancesRow(oa, sa);
  revalidatePath("/");
  return {};
}
