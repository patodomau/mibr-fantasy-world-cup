import { createHash, createHmac } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
const apiBaseUrl = process.env.MIBR_AWS_API_BASE_URL?.replace(/\/+$/, "");
const apiKeyId = process.env.MIBR_AWS_API_KEY_ID;
const apiSecret = process.env.MIBR_AWS_API_SECRET;

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

if (!apiBaseUrl || !apiKeyId || !apiSecret) {
  console.error("MIBR_AWS_API_BASE_URL, MIBR_AWS_API_KEY_ID, and MIBR_AWS_API_SECRET are required.");
  process.exit(1);
}

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

const path = "/mibr/admin/import";
const body = JSON.stringify({ backup });
const timestamp = Math.floor(Date.now() / 1000).toString();
const bodyHash = createHash("sha256").update(body).digest("hex");
const canonical = `POST\n${path}\n${timestamp}\n${bodyHash}`;
const signature = createHmac("sha256", apiSecret).update(canonical).digest("hex");

const response = await fetch(`${apiBaseUrl}${path}`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-MiBR-Key-Id": apiKeyId,
    "X-MiBR-Timestamp": timestamp,
    "X-MiBR-Signature": signature,
  },
  body,
});

const payload = await response.json();
if (!response.ok) {
  console.error(payload.error ?? "Migration import failed.");
  process.exit(1);
}

console.log(
  `Imported ${payload.importedItems} items into DynamoDB. Leaderboard entries: ${payload.leaderboardEntries}.`,
);
