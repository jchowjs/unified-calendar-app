# Investment Portfolio Dashboard — Design

## Purpose

A personal web dashboard that shows the current status of the user's
investments and cash. The user manually enters what they hold (quantities of
stocks/ETFs/crypto/mutual funds, plus bonds and cash balances); the app fetches
live pricing where possible and computes market values, gain/loss, allocation,
and total net worth.

This is a single-user personal finance tool, not a multi-tenant product.

## Access & Deployment

- Hosted on Vercel so the user can reach it from their phone anywhere (not
  limited to a local network).
- Protected by a single shared password. Entering the correct password sets a
  signed session cookie; Next.js middleware checks this cookie on every
  request and redirects unauthenticated requests to `/login`. No user
  accounts/signup — this app has exactly one user.
- All secrets (FMP API key, password hash, cookie signing secret) are stored
  as Vercel environment variables, never committed to the repo.

## Tech Stack

- **Next.js 14 (App Router)**, deployed on Vercel.
- **Postgres** (Vercel Postgres / Neon) for durable storage of holdings and
  cash entries. Chosen over a schemaless KV blob because the data is
  naturally relational (distinct holding/cash records the user edits
  individually) and Postgres integrates natively with Vercel.
- **Financial Modeling Prep (FMP)** REST API for live pricing (stocks, ETFs,
  crypto, mutual funds). Called only from server-side code (Server
  Components / Server Actions) so the API key never reaches the browser.

## Data Model

```
holdings
  id            uuid primary key
  type          enum('stock','etf','crypto','mutual_fund','bond')
  ticker        text, nullable        -- null for bonds
  name          text
  quantity      numeric
  cost_basis    numeric, nullable     -- total cost, for gain/loss; optional
  manual_value  numeric, nullable     -- current value for bonds (no live price)
  created_at    timestamptz
  updated_at    timestamptz

cash_entries
  id            uuid primary key
  label         text                  -- e.g. "DBS Savings"
  amount        numeric
  created_at    timestamptz
  updated_at    timestamptz

price_cache
  ticker        text primary key
  price         numeric
  fetched_at    timestamptz
```

Notes:
- Single home currency for the whole app (no per-entry currency/FX
  conversion) — all cash entries and displayed totals are in one currency
  the user chooses once.
- Bonds are the one holding type without live pricing: individual bonds
  don't have a simple ticker/live-price API via FMP, so bond holdings store
  a `manual_value` the user updates themselves. Bond *ETFs* are just regular
  ETFs (ticker + live price) and are unaffected by this.

## Pages & Components

- `/login` — password form; on success sets the session cookie and redirects
  to `/`.
- `/` (dashboard, auth-required) —
  - Summary cards: total net worth, total invested value, total cash, total
    gain/loss.
  - Allocation breakdown by asset type (stocks/ETFs/crypto/mutual
    funds/bonds/cash).
  - Holdings table: type, ticker/name, quantity, current price, market
    value, gain/loss (when cost_basis is set). Inline add/edit/delete.
  - Cash list: label, amount, inline add/edit/delete.
  - Manual "Refresh prices" action in addition to automatic staleness-based
    refresh.

No separate CRUD pages — given the small scale (a personal holdings list),
add/edit/delete happens inline or via a lightweight modal on the dashboard
itself.

## Server Actions

- `addHolding`, `updateHolding`, `deleteHolding`
- `addCash`, `updateCash`, `deleteCash`
- `refreshPrices`

All mutating actions validate input server-side: quantity must be positive,
ticker is required for non-bond types, amounts must be numeric.

## Data Flow — Pricing

On dashboard load:
1. Read all holdings from Postgres.
2. For each distinct ticker among stock/etf/crypto/mutual_fund holdings,
   check `price_cache`. If the cached price is stale (older than 5 minutes),
   batch-fetch fresh quotes from FMP and update the cache.
3. Bonds skip this entirely and use `manual_value` directly.
4. Compute market value per holding (`quantity * price`, or `manual_value`
   for bonds) and aggregate totals (net worth, allocation, gain/loss where
   cost_basis is present).

## Error Handling

- If FMP is unreachable, or a ticker is invalid/unknown, that row shows
  "price unavailable" — falling back to the last cached price if one
  exists, otherwise showing cost basis or `—`. A single bad ticker never
  breaks the rest of the dashboard.
- Server Actions return inline field-level errors on invalid input (e.g.
  negative quantity, missing ticker) rather than throwing unhandled
  exceptions.

## Testing

Manual verification after build (via the `run` skill / local dev server,
then again after Vercel deploy):
- Log in with the shared password; confirm unauthenticated requests to `/`
  redirect to `/login`.
- Add one holding of each type (stock, ETF, crypto, mutual fund, bond) and
  one cash entry; confirm correct live prices, market values, and totals.
- Confirm price cache staleness/refresh behavior (manual refresh and
  automatic re-fetch after 5 minutes).
- Confirm graceful handling of an invalid ticker.
- Edit and delete a holding and a cash entry; confirm totals update.
- Log out (or clear cookie) and confirm redirect back to `/login`.

## Out of Scope (v1)

- Multi-currency / FX conversion.
- Multi-user accounts or sharing.
- Historical performance charts / snapshots over time.
- Automatic position sync from a broker (e.g. IBKR) — holdings are entered
  manually, by design.
- Transaction history / tax lot tracking beyond a single cost_basis figure.
