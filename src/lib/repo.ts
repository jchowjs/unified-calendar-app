import { query } from "./db";
import type { HoldingAccount, HoldingType } from "./holdings-rules";
import type { ResolvedHolding } from "./holdings-validate";

export interface HoldingRow {
  id: string;
  type: HoldingType;
  account: HoldingAccount;
  ticker: string | null;
  name: string;
  quantity: string;
  cost_basis: string | null;
  manual_value: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function listHoldings(): Promise<HoldingRow[]> {
  const { rows } = await query<HoldingRow>(
    `select id, type, account, ticker, name, quantity, cost_basis, manual_value, created_at, updated_at
     from holdings order by created_at asc`
  );
  return rows;
}

export async function insertHolding(data: ResolvedHolding): Promise<void> {
  await query(
    `insert into holdings (type, account, ticker, name, quantity, cost_basis, manual_value)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [data.type, data.account, data.ticker, data.name, data.quantity, data.costBasis, data.manualValue]
  );
}

export interface HoldingEdit {
  name?: string;
  quantity?: number;
  costBasis?: number | null;
  manualValue?: number | null;
  account?: HoldingAccount;
}

export async function updateHolding(id: string, edit: HoldingEdit): Promise<void> {
  await query(
    `update holdings set
       name = coalesce($2, name),
       quantity = coalesce($3, quantity),
       cost_basis = $4,
       manual_value = $5,
       account = coalesce($6, account),
       updated_at = now()
     where id = $1`,
    [id, edit.name, edit.quantity, edit.costBasis, edit.manualValue, edit.account]
  );
}

export async function deleteHolding(id: string): Promise<void> {
  await query(`delete from holdings where id = $1`, [id]);
}

export interface CashRow {
  id: string;
  label: string;
  amount: string;
  created_at: Date;
  updated_at: Date;
}

export async function listCashEntries(): Promise<CashRow[]> {
  const { rows } = await query<CashRow>(
    `select id, label, amount, created_at, updated_at from cash_entries order by created_at asc`
  );
  return rows;
}

export async function insertCash(label: string, amount: number): Promise<void> {
  await query(`insert into cash_entries (label, amount) values ($1, $2)`, [label, amount]);
}

export async function updateCash(id: string, label: string, amount: number): Promise<void> {
  await query(
    `update cash_entries set label = $2, amount = $3, updated_at = now() where id = $1`,
    [id, label, amount]
  );
}

export async function deleteCash(id: string): Promise<void> {
  await query(`delete from cash_entries where id = $1`, [id]);
}

export interface CpfBalances {
  oa_amount: string;
  sa_amount: string;
  updated_at: Date;
}

export async function getCpfBalances(): Promise<CpfBalances> {
  const { rows } = await query<CpfBalances>(
    `select oa_amount, sa_amount, updated_at from cpf_balances where id = 1`
  );
  return rows[0];
}

export async function updateCpfBalances(oaAmount: number, saAmount: number): Promise<void> {
  await query(
    `update cpf_balances set oa_amount = $1, sa_amount = $2, updated_at = now() where id = 1`,
    [oaAmount, saAmount]
  );
}
