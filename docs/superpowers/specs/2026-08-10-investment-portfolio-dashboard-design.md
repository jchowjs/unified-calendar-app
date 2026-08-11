# Investment Portfolio Dashboard — Design

## Purpose

A personal web dashboard that shows the current status of the user's
investments and cash. The user manually enters what they hold (quantities of
stocks/ETFs/crypto/mutual funds — including SRS-held ETFs — plus bonds,
insurance savings policies, physical/savings-account gold, Endowus portfolio
investments, cash balances, and CPF Ordinary Account/Special Account
balances); the app fetches live pricing where possible, converts prices
quoted in a different currency to the app's single home currency
automatically, and computes market values, gain/loss, allocation, and total
net worth.

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
  crypto, mutual funds, commodity/gold spot price). Called only from
  server-side code (Server Components / Server Actions) so the API key
  never reaches the browser.

## Data Model

```
holdings
  id            uuid primary key
  type          enum('stock','etf','crypto','mutual_fund','bond',
                      'insurance_policy','gold','endowus')
  account       enum('brokerage','srs')   -- default 'brokerage'; see notes
  ticker        text, nullable            -- null for bond/insurance_policy/
                                           -- endowus; fixed constant for gold
  currency      text, nullable            -- listing currency for live-priced
                                           -- types (from FMP, or 'USD' for
                                           -- crypto/gold); home currency for
                                           -- manual-only types; null means
                                           -- "no conversion" (see notes)
  name          text
  quantity      numeric                   -- grams for gold; 1 for
                                           -- insurance_policy/endowus (see
                                           -- notes)
  cost_basis    numeric, nullable     -- total cost, for gain/loss; optional
                                      -- for most types, but recommended for
                                      -- insurance_policy/endowus (total
                                      -- premiums/amount invested to date)
  manual_value  numeric, nullable     -- meaning depends on type:
                                      -- bond/insurance_policy/endowus: the
                                      -- holding's total current value.
                                      -- stock/etf/crypto/mutual_fund/gold:
                                      -- a PER-UNIT price (per share/coin/
                                      -- gram), multiplied by quantity to
                                      -- get the total — matching how live
                                      -- pricing works for the same types,
                                      -- so entering a value doesn't require
                                      -- a different mental model than
                                      -- reading a live quote. Set whenever
                                      -- not live-priced: always for
                                      -- bond/insurance_policy/endowus; also
                                      -- for stock/etf/crypto/mutual_fund/
                                      -- gold when FMP support/currency/
                                      -- exchange coverage doesn't reach
                                      -- them (see Data Flow)
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
  type          enum('stock','etf','crypto','mutual_fund','gold')  -- part of composite key
  ticker        text                                        -- FMP-canonical symbol
  price         numeric
  fetched_at    timestamptz
  primary key (type, ticker)

fx_rates                              -- read-through cache, same shape/
  from_currency text                  -- staleness pattern as price_cache,
  to_currency   text                  -- but keyed on a currency pair
  rate          numeric               -- instead of (type, ticker)
  fetched_at    timestamptz
  primary key (from_currency, to_currency)
```

Notes:
- Single home currency for the whole app, set once as a constant/env var
  (e.g. `HOME_CURRENCY=SGD`) — not a database-backed setting, since it's
  fixed for the app's lifetime. FMP returns quotes in each security's
  native listing currency (e.g. a HK-listed stock in HKD); rather than
  restricting holdings to the home currency, `holdings.currency` captures
  the listing currency at add-time and the live-pricing path converts to
  the home currency automatically via `fx_rates` (see Data Flow). This was
  widened from an earlier version of this spec that excluded FX conversion
  entirely and required all holdings to already be in the home currency —
  live testing showed that constraint was too easy to violate silently
  (adding a USD stock under an SGD deployment produced a technically-live
  but mislabeled value) and too restrictive (it also forced crypto/gold,
  which FMP always quotes in USD, to require `HOME_CURRENCY=USD` with no
  other option). **Manual entries are the one exception**: whenever a
  value is typed in by hand — always for bond/insurance_policy/endowus,
  or as a fallback for any live-priced type FMP can't quote — it's assumed
  to already be in the home currency and is never converted, by the user's
  explicit choice (simpler than adding a currency field to manual entry;
  the user looks up the value themselves anyway and can convert mentally
  or just check a SGD-denominated source).
- `price_cache` is keyed on `(type, ticker)`, and `holdings.ticker` always
  already matches that canonical form — canonicalization happens once, at
  add-time, so no translation step is needed at fetch time. The mechanism
  differs by type:
  - `stock`/`etf`/`mutual_fund`: `addHolding` looks up the user's input
    against FMP's symbol search and stores the resolved canonical symbol
    when found. If FMP can't resolve it at all (a genuine zero-result
    search, or the search call itself failing) — common for funds FMP's
    US-centric coverage doesn't index, e.g. Singapore-distributed unit
    trusts identified by ISIN/fund-house codes rather than a ticker —
    manual_value is required instead, and the raw user-typed text is
    stored as a plain, non-canonical `ticker` label (this holding is then
    permanently manual; it never attempts live pricing, same as any other
    holding with `manual_value` set). This is a stricter version of the
    same "can't resolve it → require manual_value" pattern already used
    when a resolved ticker's live quote or FX conversion fails (see
    Server Actions) — here it's the resolution step itself that fails.
  - `crypto`: there is no generic symbol-search lookup. `addHolding`
    uppercases the user's bare asset symbol (e.g. `btc` → `BTC`) and
    validates it against FMP's known crypto symbols; that bare symbol —
    never the `USD`-suffixed pair — is what's stored in `holdings.ticker`
    and used as the `price_cache` key. The `USD` pair suffix (e.g.
    `BTCUSD`) is a fetch-time-only detail of constructing the FMP request
    (see Data Flow) and is never itself stored.
- Bonds are one of two holding types without live pricing (see
  `insurance_policy` below for the other): individual bonds don't have a
  simple ticker/live-price API via FMP, so bond holdings store a
  `manual_value` the user updates themselves. Bond *ETFs* are just regular
  ETFs (ticker + live price) and are unaffected by this.
- `account` distinguishes which wrapper a holding sits in — `brokerage`
  (default, taxable/ordinary) vs `srs` (Supplementary Retirement Scheme,
  tax-advantaged but withdrawal-restricted). It has no effect on pricing:
  an SRS-held ETF is resolved, cached, and live-priced through the exact
  same mechanism as a brokerage-held ETF with the same ticker (the field
  only affects how holdings are grouped/labeled for display — see Pages &
  Components). `account` doesn't apply to CPF (its own table) or cash.
  `account` is only user-settable for `stock`/`etf`/`mutual_fund`/`endowus`
  — the types SRS funds can actually be invested in (including via an
  Endowus SRS portfolio). `bond`, `crypto`, `insurance_policy`, and `gold`
  are always forced to `brokerage` server-side (not exposed as a choice in
  their add forms), since SRS in practice isn't used to hold these here;
  this can be revisited if that changes.
- `insurance_policy` (e.g. an endowment or whole-life savings plan bought
  through an insurer) is a manual-value holding type: it has no ticker or
  market price at all, only a surrender/cash value the user updates
  whenever they get a statement from the insurer, stored in `manual_value`.
  Unlike bonds, `cost_basis` (total premiums paid to date) is expected to
  be set for these so gain/loss is meaningful. `quantity` is fixed at `1`
  for this type — a policy isn't a per-unit holding, and
  `manual_value`/`cost_basis` already represent the whole policy.
- `endowus` (an Endowus robo-advisor portfolio) is modeled the same way as
  `insurance_policy`: no ticker, `manual_value` is the single blended
  portfolio value shown in the Endowus app/statement, `cost_basis` is the
  total amount invested to date, and `quantity` is fixed at `1`. v1
  deliberately does not break an Endowus portfolio into its individual
  underlying unit trusts — those aren't tracked as separate holdings, per
  the user's choice for simplicity, since Endowus itself only surfaces one
  blended value in normal use. `account` for `endowus` follows the same
  rule as `stock`/`etf`/`mutual_fund` (optional, defaults to `brokerage`,
  settable to `srs`), since Endowus supports investing SRS funds.
- `gold` covers physical gold (bars/coins) and gold savings/passbook
  accounts (no ticker of their own — priced by weight against the spot
  gold price). `quantity` is in **grams** (v1's fixed unit — no per-holding
  unit selector). Unlike bond/insurance_policy/endowus, gold attempts live
  pricing the same way crypto does: `ticker` is fixed internally to the
  constant `XAUUSD` (not user-entered) and used as the `price_cache` key
  when live-priced; `currency` is always `USD` (FMP quotes gold in USD per
  troy ounce), converted to the home currency same as any other live
  price. This resolves to a live price whenever the FMP plan includes
  commodity/spot gold quote access — otherwise gold falls back to
  `manual_value` (a price **per gram**, multiplied by `quantity`, entered
  directly in the home currency), same as bonds. See Data Flow for the
  live-price gram/troy-ounce conversion and the FX conversion step.
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
- CPF balances are always SGD-denominated (not user-selectable), and unlike
  holdings, CPF has no `currency`/conversion mechanism of its own (it's a
  fixed pair of numbers in `cpf_balances`, not priced through the
  live/manual pipeline). **This deployment therefore requires
  `HOME_CURRENCY=SGD`** for the CPF section to be summed correctly into
  net worth/allocation. If a future deployment ever used a non-SGD home
  currency, the CPF section would need to be hidden/disabled rather than
  summed in as-is — this is independent of the FX conversion support
  described above, which only applies to holdings.

## Pages & Components

- `/login` — password form; on success sets the session cookie and redirects
  to `/`.
- `/` (dashboard, auth-required) —
  - Summary cards: total net worth, total invested value, total cash, total
    CPF (OA + SA), total SRS, total gain/loss.
  - Allocation breakdown by asset type (stocks/ETFs/crypto/mutual
    funds/bonds/insurance policies/gold/Endowus/cash/CPF), plus a separate
    SRS-vs-brokerage breakdown within invested holdings (an SRS-held ETF
    counts toward both its asset-type slice and the SRS total — these are
    two different cuts of the same holdings, not mutually exclusive
    categories).
  - Holdings table: type, account (brokerage/SRS), ticker/name, quantity,
    current price, market value, gain/loss (when cost_basis is set).
    Inline add/edit/delete.
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
for holdings depend on type and resolution. For every ticker-priced type
below, "the price/quote check" at add-time is really two checks — the
price quote itself, AND (whenever `currency` differs from `HOME_CURRENCY`)
that an FX rate can actually be fetched (via `canConvertToHomeCurrency`,
see Data Flow). Both must succeed for the holding to be accepted without
manual_value; if either fails, manual_value is required instead. This
closes a gap found in live testing: without the FX check, a holding whose
price quote succeeds but whose currency can never be converted (e.g. an
FMP plan without forex access) would be accepted as "live" and then sit
permanently "unavailable" at render time with no way to fix it except
editing in a manual value after the fact.
- `stock`/`etf`: ticker required (non-empty text). If FMP's symbol search
  can't resolve it at all (see Data Model notes), OR resolves it but the
  price/FX check fails, manual_value is also required as the fallback
  value (entered directly in the home currency, not converted), and the
  UI should prompt for it in that case — same pattern as `mutual_fund`
  below (this was widened from an earlier version of this spec that
  assumed stock/etf would always be quotable; live testing against a real
  FMP free tier showed non-US exchanges are commonly gated behind a paid
  plan, and that some funds aren't resolvable via FMP's search at all).
  `account` optional, defaults to `brokerage` (set to `srs` for SRS-held
  ETFs).
- `bond`: manual_value required; no ticker; `account` forced to
  `brokerage` server-side (not user-settable — see Data Model notes).
- `mutual_fund`: ticker required (non-empty text), same resolution and
  fallback rules as stock/etf — this is the type where the "FMP can't
  resolve it at all" fallback matters most in practice, since
  Singapore-distributed unit trusts are commonly outside FMP's coverage
  (see Data Model notes). `account` optional, defaults to `brokerage`
  (set to `srs` for SRS-held unit trusts).
- `crypto`: ticker required (bare symbol, validated as described in Data
  Model notes); `currency` always `USD`. If the price/FX check fails,
  manual_value is also required as the fallback value, and the UI should
  prompt for it in that case. `account` forced to `brokerage` server-side
  (not user-settable).
- `insurance_policy`: manual_value required; no ticker; quantity is fixed
  at `1` server-side (not user-editable); `account` forced to `brokerage`
  server-side (not user-settable); cost_basis strongly recommended (UI
  should prompt for it) but not hard-required, consistent with other types
  where cost_basis is optional.
- `endowus`: manual_value required; no ticker; quantity is fixed at `1`
  server-side (not user-editable); `account` optional, defaults to
  `brokerage` (set to `srs` for an Endowus SRS portfolio); cost_basis
  strongly recommended (UI should prompt for it) but not hard-required.
- `gold`: quantity required (grams, positive); ticker not user-set (fixed
  internally to `XAUUSD`); `currency` always `USD`; `account` forced to
  `brokerage` server-side (not user-settable). If the price/FX check
  fails, manual_value is also required as the fallback value — a price
  **per gram**, multiplied by `quantity` to get the total, entered
  directly in the home currency (see Data Model notes) — and the UI
  should prompt for it in that case.

## Data Flow — Pricing

Stocks, ETFs, crypto, mutual funds, and gold are different FMP endpoints
with different symbol formats and update cadences — they are not one
uniform "batch fetch":
- **Stocks/ETFs**: FMP quote endpoint, standard ticker (e.g. `AAPL`).
- **Crypto**: FMP quote endpoint with a pair suffix (e.g. `BTCUSD`), not
  the bare asset symbol. FMP crypto pairs are quoted against USD. The user
  types and `addHolding` stores the bare asset symbol (e.g. `BTC`); the
  `USD` suffix is appended only when constructing the FMP request at fetch
  time (step 2 below), never stored. Always attempted regardless of home
  currency — the resulting USD value is converted like any other
  non-home-currency quote (see FX conversion below) — otherwise (FMP plan
  lacks crypto access) crypto holdings use `manual_value` instead, same as
  bonds.
- **Mutual funds**: NAV updates once per trading day (not intraday), so
  these are refreshed on a daily-staleness check rather than the 5-minute
  window below — no point re-fetching a value that hasn't changed.
- **Gold**: FMP commodity/spot price endpoint, fixed symbol `XAUUSD`,
  quoted in USD per troy ounce. Native-currency market value is
  `(quantity_grams / 31.1034768) * price_per_troy_oz`, then converted from
  USD like any other holding. Otherwise (FMP plan lacks commodity access)
  gold uses `manual_value` instead, same as bonds.
- Implementation must confirm the FMP plan/tier in use actually includes
  quote access for the specific tickers/exchanges, asset classes (crypto,
  mutual fund, commodity/gold), before relying on it; if it doesn't, those
  holdings fall back to `manual_value` like bonds until upgraded (or
  permanently, for tickers/exchanges outside the plan's coverage —
  confirmed in practice: a free-tier FMP plan quoted a US stock live but
  couldn't quote an SGX-listed one, which is what motivated extending the
  manual_value fallback to stock/etf too, not just crypto/mutual_fund/gold).

**FX conversion**: after computing a live-priced holding's value in its own
listing currency (`holdings.currency`), if that currency differs from
`HOME_CURRENCY`, the value is multiplied by an exchange rate fetched from
FMP's forex quote endpoint (symbol e.g. `USDSGD`) and cached in `fx_rates`
— same read-through pattern, staleness, and manual-refresh support as
`price_cache`, just keyed by currency pair instead of (type, ticker). If no
conversion is needed (`currency` is null or equals `HOME_CURRENCY`), the
native value is used as-is. Manual entries never go through this step —
they're defined to already be in the home currency (see Data Model notes).

On dashboard load, each holding is classified as either **live-priced** or
**manual** (this classification is fixed at add-time by whether
`manual_value` is set — see Server Actions):
1. Read all holdings from Postgres.
2. For live-priced holdings — every `stock`/`etf`/`crypto`/`mutual_fund`/
   `gold` holding where FMP could quote the ticker at add-time — check
   `price_cache` for each distinct (type, ticker). If stale, fetch fresh
   quotes from FMP (appending the `USD` pair suffix for crypto requests
   only, per Data Model notes) and update the cache. Staleness window is 5
   minutes for stock/etf/crypto/gold, 24 hours for mutual_fund. Then apply
   FX conversion as described above.
3. Manual holdings — bond, insurance_policy, and endowus holdings always,
   plus any stock/etf/crypto/mutual_fund/gold holding that didn't qualify
   as live-priced above — skip step 2 entirely.
4. Compute market value per holding: for live-priced holdings, `quantity *
   price` (or the gram/troy-ounce conversion above for gold), converted to
   the home currency; for manual holdings, this splits by type (see Data
   Model notes) — bond/insurance_policy/endowus use `manual_value` directly
   as the total; stock/etf/crypto/mutual_fund/gold use `quantity *
   manual_value` (gold's manual entry is price-per-gram, so no
   troy-ounce conversion applies here, unlike its live-priced path), with
   no FX conversion applied to either (manual entries are always already
   in the home currency). Aggregate into totals (net worth, allocation,
   gain/loss where cost_basis is present).

## Error Handling

- If FMP is unreachable, or a ticker is invalid/unknown, that row shows
  "price unavailable" — falling back to the last cached price if one
  exists, otherwise showing cost basis or `—`. A single bad ticker never
  breaks the rest of the dashboard.
- Same fallback shape for FX: if a holding has a live price but the
  exchange rate can't be fetched fresh, fall back to the last cached rate
  regardless of its age; only show "unavailable" if no rate has ever been
  cached for that currency pair. A native-currency price is never shown
  unconverted — that would silently misrepresent the value, the exact
  failure mode this design is meant to prevent.
- Server Actions return inline field-level errors on invalid input (e.g.
  negative quantity, missing ticker) rather than throwing unhandled
  exceptions.

## Testing

Manual verification after build (via the `run` skill / local dev server,
then again after Vercel deploy):
- Log in with the shared password; confirm unauthenticated requests to `/`
  redirect to `/login`.
- Add one holding of each type (stock, ETF, crypto, mutual fund, bond,
  insurance policy, gold, Endowus), one cash entry, and set OA/SA CPF
  balances; confirm correct live prices, market values, and totals, and
  that CPF appears as its own line (not folded into cash).
- Add an ETF holding with `account=srs`; confirm it's live-priced
  identically to a brokerage-held ETF with the same ticker, but is broken
  out separately in the SRS total. Repeat for an `endowus` holding with
  `account=srs`.
- Add an insurance policy and an Endowus holding, each with a manual_value
  and cost_basis; confirm gain/loss displays correctly, quantity is fixed
  at 1 for both, and manual_value is used as the total (not multiplied by
  quantity) — contrast with the next case.
- Add a stock/etf/crypto/mutual_fund/gold holding with a manual fallback
  value (e.g. an unquotable ticker); confirm the value shown is `quantity
  * manual_value` (per-unit price × quantity), not the flat manual_value —
  this is the opposite convention from bond/insurance_policy/endowus above,
  and was the source of a real bug caught in live testing (a 10-share
  manual entry that wasn't multiplied by 10).
- Add a holding whose live price is quoted in a different currency than
  `HOME_CURRENCY` (e.g. a US stock under an SGD deployment); confirm the
  displayed value is the FX-converted amount, not the raw native-currency
  number relabeled with the home currency's symbol (the bug this feature
  replaced). Confirm `fx_rates` gets a cached row for that currency pair.
- Confirm price cache staleness/refresh behavior (manual refresh and
  automatic re-fetch after 5 minutes) for both prices and FX rates.
- Confirm graceful handling of an invalid ticker.
- Edit and delete a holding and a cash entry; edit CPF OA/SA balances;
  confirm totals update.
- Log out via the `logout` action and confirm the cookie is cleared and
  `/` redirects back to `/login`.
- Confirm mutual fund prices refresh on a daily cadence rather than every
  5 minutes.

## Out of Scope (v1)

- FX conversion for manual entries — a manually-entered value is always
  assumed to already be in the home currency and is never converted, by
  the user's explicit choice (see Data Model notes). Only live-fetched
  prices go through FX conversion.
- Historical/point-in-time FX rates — conversion always uses the current
  cached rate, not the rate on the date a holding was added or a cost
  basis was recorded.
- Multi-user accounts or sharing.
- Historical performance charts / snapshots over time.
- Automatic position sync from a broker (e.g. IBKR) — holdings are entered
  manually, by design.
- Transaction history / tax lot tracking beyond a single cost_basis figure.
- CPF Medisave (MA) and Retirement Account (RA) — only OA and SA are
  tracked in v1, per the user's request.
- SRS contribution room/cap tracking (the annual contribution limit) —
  v1 only tracks the current value of SRS-held ETFs, not how much
  contribution room remains.
- Insurance policy projections — guaranteed vs. non-guaranteed maturity
  value breakdowns, projected future value, or premium payment schedules.
  v1 only tracks current surrender value and premiums paid to date.
- Breaking an Endowus portfolio into its individual underlying unit
  trusts — v1 tracks one blended portfolio value only, per the user's
  choice.
- Gold in units other than grams (e.g. troy ounces as a user-facing unit),
  and gold purity/karat tracking.
