# Investment Portfolio Dashboard — Design

## Purpose

A personal web dashboard that shows the current status of the user's
investments and cash. The user manually enters what they hold (quantities of
stocks/ETFs/crypto/mutual funds, plus bonds, cash balances, and CPF Ordinary
Account/Special Account balances); the app fetches live pricing where
possible and computes market values, gain/loss, allocation, and total net
worth.

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

cpf_balances                          -- singleton row: exactly one OA and
  id            integer primary key   -- one SA per person, not a freeform
                                       -- list like cash_entries. The init
                                       -- SQL script inserts the single row
                                       -- (id=1, oa_amount=0, sa_amount=0)
                                       -- up front, so updateCpfBalances is
                                       -- always a plain UPDATE ... WHERE
                                       -- id=1, never an upsert/insert.
  oa_amount     numeric
  sa_amount     numeric
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
- `price_cache` is keyed on `(type, ticker)`, and `holdings.ticker` always
  already matches that canonical form — canonicalization happens once, at
  add-time, so no translation step is needed at fetch time. The mechanism
  differs by type:
  - `stock`/`etf`/`mutual_fund`: `addHolding` looks up the user's input
    against FMP's symbol search and stores the resolved canonical symbol
    (rejecting the input with a field error if no match is found).
  - `crypto`: there is no generic symbol-search lookup. `addHolding`
    uppercases the user's bare asset symbol (e.g. `btc` → `BTC`) and
    validates it against FMP's known crypto symbols; that bare symbol —
    never the `USD`-suffixed pair — is what's stored in `holdings.ticker`
    and used as the `price_cache` key. The `USD` pair suffix (e.g.
    `BTCUSD`) is a fetch-time-only detail of constructing the FMP request
    (see Data Flow) and is never itself stored.
- Bonds are the one holding type without live pricing: individual bonds
  don't have a simple ticker/live-price API via FMP, so bond holdings store
  a `manual_value` the user updates themselves. Bond *ETFs* are just regular
  ETFs (ticker + live price) and are unaffected by this.
- No migration framework — a single SQL init script (run once against the
  Vercel Postgres instance) is sufficient at this scale.
- CPF (Singapore Central Provident Fund) OA/SA balances are tracked
  separately from bank cash, since they're locked-up retirement savings,
  not freely spendable — they get their own line in the dashboard summary
  and allocation breakdown rather than being folded into "Cash". They're
  modeled as a singleton row (not a list like `cash_entries`) because each
  person has exactly one OA and one SA, updated in place via a single
  `updateCpfBalances` action. v1 covers only OA and SA, per the user's
  request — Medisave (MA) and Retirement Account (RA) are out of scope but
  would be a straightforward two-column addition to this same table later
  if needed.
- CPF balances are always SGD-denominated (not user-selectable), unlike
  holdings/cash which the user chooses to enter in the home currency.
  **This deployment therefore requires `HOME_CURRENCY=SGD`** for the CPF
  section to be summed correctly into net worth/allocation — the same
  silent-wrong-totals risk called out above for mismatched holding
  currencies applies here, except the user can't simply avoid entering
  CPF the way they can avoid entering a foreign-currency holding. If a
  future deployment ever used a non-SGD home currency, the CPF section
  would need to be hidden/disabled rather than summed in as-is. This
  interacts with the crypto live-pricing rule below: with
  `HOME_CURRENCY=SGD`, crypto holdings will always use `manual_value`
  (that rule requires `HOME_CURRENCY=USD` to live-price) — expected and
  already handled by that rule, not a new conflict.

## Pages & Components

- `/login` — password form; on success sets the session cookie and redirects
  to `/`.
- `/` (dashboard, auth-required) —
  - Summary cards: total net worth, total invested value, total cash, total
    CPF (OA + SA), total gain/loss.
  - Allocation breakdown by asset type (stocks/ETFs/crypto/mutual
    funds/bonds/cash/CPF).
  - Holdings table: type, ticker/name, quantity, current price, market
    value, gain/loss (when cost_basis is set). Inline add/edit/delete.
  - Cash list: label, amount, inline add/edit/delete.
  - CPF section: two fields, OA and SA balances, edited in place (no
    add/delete — see Data Model notes).
  - Manual "Refresh prices" action in addition to automatic staleness-based
    refresh.

No separate CRUD pages — given the small scale (a personal holdings list),
add/edit/delete happens inline or via a lightweight modal on the dashboard
itself.

## Server Actions

- `login`, `logout`
- `addHolding`, `updateHolding`, `deleteHolding`
- `addCash`, `updateCash`, `deleteCash`
- `updateCpfBalances(oa_amount, sa_amount)` — updates the pre-seeded
  singleton `cpf_balances` row (id=1, see Data Model notes); no add/delete
  since OA and SA always exist, and no upsert/insert path is needed.
- `refreshPrices`

All mutating actions validate input server-side: holding quantity must be
positive; cash and CPF (OA/SA) amounts must be numeric and non-negative
(zero is valid, negative is not); and ticker vs. manual_value requirements
for holdings depend on type and resolution:
- `stock`/`etf`: ticker required (resolved via FMP symbol search, see Data
  Model notes); no manual_value.
- `bond`: manual_value required; no ticker.
- `mutual_fund`: ticker required (resolved via FMP symbol search, same as
  stock/etf). If the FMP plan lacks mutual fund access, manual_value is
  also required as the fallback value, and the UI should prompt for it in
  that case.
- `crypto`: ticker required (bare symbol, validated as described in Data
  Model notes). If `HOME_CURRENCY` isn't `USD`, OR the FMP plan lacks
  crypto quote access, manual_value is also required as the fallback
  value, and the UI should prompt for it in that case.

## Data Flow — Pricing

Stocks, ETFs, crypto, and mutual funds are different FMP endpoints with
different symbol formats and update cadences — they are not one uniform
"batch fetch":
- **Stocks/ETFs**: FMP quote endpoint, standard ticker (e.g. `AAPL`).
- **Crypto**: FMP quote endpoint with a pair suffix (e.g. `BTCUSD`), not
  the bare asset symbol. FMP crypto pairs are quoted against USD. The user
  types and `addHolding` stores the bare asset symbol (e.g. `BTC`); the
  `USD` suffix is appended only when constructing the FMP request at fetch
  time (step 2 below), never stored. This only resolves to a live price
  when `HOME_CURRENCY=USD` AND the FMP plan includes crypto quote access
  (consistent with the home-currency-only constraint above) — otherwise
  crypto holdings use `manual_value` instead, same as bonds.
- **Mutual funds**: NAV updates once per trading day (not intraday), so
  these are refreshed on a daily-staleness check rather than the 5-minute
  window below — no point re-fetching a value that hasn't changed.
- Implementation must confirm the FMP plan/tier in use actually includes
  crypto and mutual fund quote access before relying on it; if it doesn't,
  those two types fall back to `manual_value` like bonds until upgraded.

On dashboard load, each holding is classified as either **live-priced** or
**manual** (this classification is fixed at add-time by whether
`manual_value` is set — see Server Actions):
1. Read all holdings from Postgres.
2. For live-priced holdings — `stock`/`etf` always; `crypto` only when
   `HOME_CURRENCY=USD` and the FMP plan supports it; `mutual_fund` only
   when the FMP plan supports it —
   check `price_cache` for each distinct (type, ticker). If stale, fetch
   fresh quotes from FMP (appending the `USD` pair suffix for crypto
   requests only, per Data Model notes) and update the cache. Staleness
   window is 5 minutes for stock/etf/crypto, 24 hours for mutual_fund.
3. Manual holdings — bonds always, plus any crypto/mutual_fund holding that
   didn't qualify as live-priced above — skip step 2 entirely.
4. Compute market value per holding: `quantity * price` for live-priced
   holdings; `manual_value` directly (as the holding's total current value,
   not multiplied by quantity) for manual holdings. Aggregate into totals
   (net worth, allocation, gain/loss where cost_basis is present).

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
- Add one holding of each type (stock, ETF, crypto, mutual fund, bond), one
  cash entry, and set OA/SA CPF balances; confirm correct live prices,
  market values, and totals, and that CPF appears as its own line (not
  folded into cash).
- Confirm price cache staleness/refresh behavior (manual refresh and
  automatic re-fetch after 5 minutes).
- Confirm graceful handling of an invalid ticker.
- Edit and delete a holding and a cash entry; edit CPF OA/SA balances;
  confirm totals update.
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
- CPF Medisave (MA) and Retirement Account (RA) — only OA and SA are
  tracked in v1, per the user's request.
