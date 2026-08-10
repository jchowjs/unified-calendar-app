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
  signed session cookie (30-day expiry); Next.js middleware checks this
  cookie on every request and redirects unauthenticated requests to
  `/login`. A `logout` Server Action clears the cookie and redirects back to
  `/login`. No user accounts/signup — this app has exactly one user.
- The password is stored as a bcrypt hash in an env var; the login action
  compares the submitted password against it. Given this is a personal,
  low-traffic app, v1 accepts brute-force risk as-is rather than adding
  rate-limiting/lockout — noted here explicitly as a conscious tradeoff, not
  an oversight.
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
  manual_value  numeric, nullable     -- current value when not live-priced:
                                      -- always for bonds; also for
                                      -- crypto/mutual funds when FMP
                                      -- support/currency doesn't cover them
                                      -- (see Data Flow)
  created_at    timestamptz
  updated_at    timestamptz

cash_entries
  id            uuid primary key
  label         text                  -- e.g. "DBS Savings"
  amount        numeric
  created_at    timestamptz
  updated_at    timestamptz

price_cache
  type          enum('stock','etf','crypto','mutual_fund')  -- part of composite key
  ticker        text                                        -- FMP-canonical symbol
  price         numeric
  fetched_at    timestamptz
  primary key (type, ticker)
```

Notes:
- Single home currency for the whole app, set once as a constant/env var
  (e.g. `HOME_CURRENCY=USD`) — not a database-backed setting, since it's
  fixed for the app's lifetime. **Constraint: v1 only supports holdings
  that are listed/traded in the home currency.** FMP returns quotes in each
  security's native listing currency (e.g. a HK-listed stock in HKD), and
  since FX conversion is explicitly out of scope, mixing listing currencies
  would silently produce wrong totals. The add-holding form should
  make this constraint visible to the user (e.g. a note or a currency
  field defaulted to and locked at the home currency).
- `price_cache` is keyed on `(type, ticker)` using FMP's canonical symbol
  for that type (not necessarily what the user typed) to avoid collisions
  between differently-typed instruments that share a raw symbol string.
  Canonicalization happens once, at add-time: `addHolding` looks up the
  user's input against FMP's symbol search for the given type and stores
  the resolved canonical symbol directly in `holdings.ticker` (rejecting
  the input with a field error if no match is found). Because of this,
  `holdings.ticker` and `price_cache.ticker` are always already in the same
  canonical form — no separate translation step is needed at fetch time.
- Bonds are the one holding type without live pricing: individual bonds
  don't have a simple ticker/live-price API via FMP, so bond holdings store
  a `manual_value` the user updates themselves. Bond *ETFs* are just regular
  ETFs (ticker + live price) and are unaffected by this.
- No migration framework — a single SQL init script (run once against the
  Vercel Postgres instance) is sufficient at this scale.

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

- `login`, `logout`
- `addHolding`, `updateHolding`, `deleteHolding`
- `addCash`, `updateCash`, `deleteCash`
- `refreshPrices`

All mutating actions validate input server-side: quantity must be positive,
amounts must be numeric, and ticker vs. manual_value requirements depend on
type and resolution:
- `stock`/`etf`: ticker required (resolved via FMP symbol search, see Data
  Model notes); no manual_value.
- `bond`: manual_value required; no ticker.
- `crypto`/`mutual_fund`: ticker required (resolved the same way as
  stock/etf). If canonicalization succeeds but the type isn't live-priced
  in this deployment (non-USD home currency for crypto, or FMP plan lacks
  mutual fund access), manual_value is also required as the fallback
  value, and the UI should prompt for it in that case.

## Data Flow — Pricing

Stocks, ETFs, crypto, and mutual funds are different FMP endpoints with
different symbol formats and update cadences — they are not one uniform
"batch fetch":
- **Stocks/ETFs**: FMP quote endpoint, standard ticker (e.g. `AAPL`).
- **Crypto**: FMP quote endpoint with a pair suffix (e.g. `BTCUSD`), not
  the bare asset symbol. FMP crypto pairs are quoted against USD. The user
  types the bare asset symbol (e.g. `BTC`); `addHolding` derives the pair
  by appending `USD`. This only resolves to a live price when
  `HOME_CURRENCY=USD` (consistent with the home-currency-only constraint
  above) — for any other home currency, crypto holdings use `manual_value`
  instead, same as bonds.
- **Mutual funds**: NAV updates once per trading day (not intraday), so
  these are refreshed on a daily-staleness check rather than the 5-minute
  window below — no point re-fetching a value that hasn't changed.
- Implementation must confirm the FMP plan/tier in use actually includes
  crypto and mutual fund quote access before relying on it; if it doesn't,
  those two types fall back to `manual_value` like bonds until upgraded.

On dashboard load:
1. Read all holdings from Postgres.
2. For each distinct (type, ticker) among stock/etf/crypto holdings, check
   `price_cache`. If stale (older than 5 minutes), fetch fresh quotes from
   FMP and update the cache. Mutual fund holdings use the same cache keyed
   by `(mutual_fund, ticker)` but with a 24-hour staleness window instead.
3. Bonds (and any type without confirmed FMP plan support) skip this
   entirely and use `manual_value` directly.
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
- Log out via the `logout` action and confirm the cookie is cleared and
  `/` redirects back to `/login`.
- Confirm mutual fund prices refresh on a daily cadence rather than every
  5 minutes.

## Out of Scope (v1)

- Multi-currency / FX conversion — as a consequence, v1 only supports
  holdings listed in the app's single home currency (see Data Model notes).
- Multi-user accounts or sharing.
- Historical performance charts / snapshots over time.
- Automatic position sync from a broker (e.g. IBKR) — holdings are entered
  manually, by design.
- Transaction history / tax lot tracking beyond a single cost_basis figure.
