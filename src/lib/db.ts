import { Pool, type QueryResultRow } from "pg";
import { env } from "./env";

declare global {
  var __pgPool: Pool | undefined;
}

// Reused across hot reloads / Server Action invocations in the same
// runtime instance rather than opening a new pool per request.
export function getPool(): Pool {
  if (!global.__pgPool) {
    global.__pgPool = new Pool({ connectionString: env.databaseUrl });
  }
  return global.__pgPool;
}

export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) {
  return getPool().query<T>(text, params);
}
