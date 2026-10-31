// Shared by the app and scripts/migrate.mjs.
//
// The pooler URL written by Stripe Projects embeds a mis-encoded password, so we
// take host/port/user from the URL and the password from SUPABASE_DB_PASS.
export function connectionOptions() {
  const raw = process.env.SUPABASE_POOLER_URL;
  const password = process.env.SUPABASE_DB_PASS;
  if (!raw || !password) {
    throw new Error("Missing SUPABASE_POOLER_URL / SUPABASE_DB_PASS. Run `stripe projects env --pull`.");
  }
  const url = new URL(raw);
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    database: url.pathname.slice(1) || "postgres",
    username: decodeURIComponent(url.username),
    password,
    ssl: "require",
    // Transaction-mode pooler (6543) does not support prepared statements.
    prepare: false,
  };
}
