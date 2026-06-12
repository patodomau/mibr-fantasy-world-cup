import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const outputPath =
  process.argv[2] ??
  `/tmp/mibr-fantasy-world-cup-db-backup-${new Date().toISOString().replaceAll(":", "-")}.json`;

const sql = neon(databaseUrl);

const tables = [
  ["authorized_users", "discord_user_id"],
  ["teams", "id"],
  ["matches", "id"],
  ["predictions", "id"],
  ["match_sync_runs", "id"],
  ["match_source_observations", "id"],
  ["match_observations", "id"],
  ["match_conflicts", "id"],
];

const backup = {
  exportedAt: new Date().toISOString(),
  schema: "mibr_fantasy_world_cup",
  tables: {},
};

for (const [table, orderColumn] of tables) {
  backup.tables[table] = await sql.query(
    `select * from mibr_fantasy_world_cup.${table} order by ${orderColumn}`,
  );
}

const resolvedPath = resolve(outputPath);
await mkdir(dirname(resolvedPath), { recursive: true });
await writeFile(resolvedPath, `${JSON.stringify(backup, null, 2)}\n`, "utf8");

console.log(`Exported ${tables.length} tables to ${resolvedPath}`);
