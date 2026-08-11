-- Investment Portfolio Dashboard — schema
-- Run once against a fresh Postgres database. No migration framework;
-- see docs/superpowers/specs/2026-08-10-investment-portfolio-dashboard-design.md.

create extension if not exists pgcrypto;

create type holding_type as enum (
  'stock', 'etf', 'crypto', 'mutual_fund', 'bond',
  'insurance_policy', 'gold', 'endowus'
);

create type holding_account as enum ('brokerage', 'srs');

create table holdings (
  id            uuid primary key default gen_random_uuid(),
  type          holding_type not null,
  account       holding_account not null default 'brokerage',
  ticker        text,
  currency      text,           -- listing currency for live-priced types
                                 -- (from FMP, or 'USD' for crypto/gold);
                                 -- null means "no conversion" (manual
                                 -- entries are always already in the home
                                 -- currency, see design doc)
  name          text not null,
  quantity      numeric not null,
  cost_basis    numeric,
  manual_value  numeric,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table cash_entries (
  id            uuid primary key default gen_random_uuid(),
  label         text not null,
  amount        numeric not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Singleton row: exactly one OA and one SA per person. Seeded below so
-- updateCpfBalances is always a plain UPDATE ... WHERE id = 1.
create table cpf_balances (
  id            integer primary key,
  oa_amount     numeric not null default 0,
  sa_amount     numeric not null default 0,
  updated_at    timestamptz not null default now()
);

insert into cpf_balances (id, oa_amount, sa_amount) values (1, 0, 0);

create table price_cache (
  type          text not null
                  check (type in ('stock', 'etf', 'crypto', 'mutual_fund', 'gold')),
  ticker        text not null,
  price         numeric not null,
  fetched_at    timestamptz not null default now(),
  primary key (type, ticker)
);

create table fx_rates (
  from_currency text not null,
  to_currency   text not null,
  rate          numeric not null,
  fetched_at    timestamptz not null default now(),
  primary key (from_currency, to_currency)
);
