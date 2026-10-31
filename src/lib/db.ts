import postgres from "postgres";
import { connectionOptions } from "./db-config.mjs";

const globalForDb = globalThis as unknown as { sql?: postgres.Sql };

// Reuse one pool across dev hot reloads.
export const sql = globalForDb.sql ?? postgres({ ...connectionOptions(), max: 5 });
if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;

/** Route ids are user-supplied; Postgres errors on malformed uuids, so check first. */
export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
