// Read-only: prints your database's tables, columns and approximate row counts. Never prints data or the connection string.
// Usage: npm run db:schema   (reads DATABASE_URL from .env)
import pg from "pg";

const raw = process.env.DATABASE_URL;
if (!raw) { console.error("DATABASE_URL is not set. Add it to .env first."); process.exit(1); }
if (raw.includes("[YOUR-PASSWORD]")) { console.error("DATABASE_URL still contains [YOUR-PASSWORD]. Replace it with your database password in .env (never commit it)."); process.exit(1); }

// `pgbouncer=true` is a Prisma option, not a Postgres one.
const url = new URL(raw);
url.searchParams.delete("pgbouncer");
const client = new pg.Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query("BEGIN READ ONLY");
  const cols = await client.query(`
    select c.table_name, c.column_name, c.data_type, c.is_nullable
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public' order by c.table_name, c.ordinal_position`);
  const counts = await client.query(`
    select relname as table_name, greatest(reltuples, 0)::bigint as approx_rows
    from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'`);
  await client.query("ROLLBACK");
  const rows = new Map(counts.rows.map((r) => [r.table_name, r.approx_rows]));
  const byTable = new Map();
  for (const c of cols.rows) byTable.set(c.table_name, [...(byTable.get(c.table_name) ?? []), c]);
  if (!byTable.size) console.log("Connected. No tables in the public schema.");
  for (const [table, list] of byTable) {
    console.log(`\n${table}  (about ${rows.get(table) ?? "?"} rows)`);
    for (const c of list) console.log(`  ${c.column_name}  ${c.data_type}${c.is_nullable === "NO" ? "  not null" : ""}`);
  }
} catch (e) {
  console.error("Could not read the schema:", e.code ?? "", e.message?.replace(/postgresql:\/\/\S+/g, "<connection string hidden>"));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
