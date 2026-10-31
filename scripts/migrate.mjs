// Applies db/schema.sql. Run with: npm run db:migrate
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { connectionOptions } from "../src/lib/db-config.mjs";

const sql = postgres({ ...connectionOptions(), max: 1, onnotice: () => {} });
const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");

try {
  await sql.unsafe(schema);
  console.log("Schema applied.");
} finally {
  await sql.end();
}
