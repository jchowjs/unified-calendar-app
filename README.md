# Investment Portfolio Dashboard

A personal, password-protected dashboard for tracking investments and cash.
You enter what you hold; the app fetches live pricing where possible and
computes market values, gain/loss, allocation, and total net worth.

See the full design spec at
[`docs/superpowers/specs/2026-08-10-investment-portfolio-dashboard-design.md`](docs/superpowers/specs/2026-08-10-investment-portfolio-dashboard-design.md)
for the complete data model and rules. This README covers running and
deploying it.

## Stack

- Next.js 16 (App Router), deployed on Vercel
- Postgres (Vercel Postgres / Neon, or any Postgres-compatible database)
- [Financial Modeling Prep](https://financialmodelingprep.com) for live pricing

## Local development

1. **Postgres**: point `DATABASE_URL` at any Postgres database, then apply
   the schema once:
   ```bash
   psql "$DATABASE_URL" -f db/init.sql
   ```
2. **Env vars**: copy `.env.example` to `.env.local` and fill in every
   value. Generate the two secrets:
   ```bash
   node -e "console.log(require('bcryptjs').hashSync('your-password', 10))"   # PASSWORD_HASH
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # SESSION_SECRET
   ```
   **Important**: if you put `PASSWORD_HASH` in a `.env*` file, escape every
   `$` as `\$` (e.g. `\$2b\$10\$...`). Next.js's env loader treats a bare
   `$word` as variable interpolation and will silently corrupt a bcrypt hash
   otherwise — see the comment in `.env.example`. This only matters for
   `.env` files; entering the hash directly in Vercel's dashboard doesn't
   need escaping.
3. **Run it**:
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000 — you'll be redirected to `/login`.

## Deploying to Vercel

1. Push this repo to GitHub (or your Git provider of choice) and import it
   in Vercel.
2. Add a Postgres database from the Vercel dashboard (Storage → Postgres,
   powered by Neon) and connect it to the project — this sets
   `DATABASE_URL` (or `POSTGRES_URL`; if Vercel names it differently, add a
   `DATABASE_URL` env var pointing to the same connection string) for you.
3. Run `db/init.sql` once against that database (Vercel's dashboard has a
   query console, or connect with `psql` using the connection string from
   the dashboard).
4. Get an FMP API key at financialmodelingprep.com and add it as
   `FMP_API_KEY` in the Vercel project's environment variables.
5. Add `HOME_CURRENCY` (SGD, to support CPF tracking — see the design doc's
   notes on why this is required), `PASSWORD_HASH`, and `SESSION_SECRET` as
   env vars directly in Vercel's dashboard (no `\$` escaping needed there —
   that's only for local `.env` files).
6. Deploy. Visit the URL, log in with the password you hashed into
   `PASSWORD_HASH`.

## Notes on live pricing

- Stocks, ETFs, and mutual funds are looked up by ticker via FMP and
  live-priced.
- Crypto and gold only live-price when `HOME_CURRENCY=USD`, since FMP quotes
  them in USD and this app doesn't do FX conversion. With `HOME_CURRENCY=SGD`
  (required for CPF), both need a manually-entered value instead.
- Bonds, insurance policies, and Endowus portfolios are always
  manually-valued — there's no live pricing API for these.
- Confirm your FMP plan actually covers the asset classes you use (some
  endpoints, like mutual funds or commodities, may need a paid tier). If a
  quote fails, the app asks you to enter a value manually rather than
  breaking.

Full rules for each holding type are in the design spec linked above.
