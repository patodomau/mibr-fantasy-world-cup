import { readFile } from "node:fs/promises";
import { createHash, createHmac } from "node:crypto";
import { resolve } from "node:path";

const apiBaseUrl = process.env.MIBR_AWS_API_BASE_URL?.replace(/\/+$/, "");
const apiKeyId = process.env.MIBR_AWS_API_KEY_ID;
const apiSecret = process.env.MIBR_AWS_API_SECRET;
const inputPath = process.argv[2];

if (!inputPath) {
  console.error("Usage: node scripts/import-backup-to-aws-api.mjs <backup.json>");
  process.exit(1);
}

if (!apiBaseUrl || !apiKeyId || !apiSecret) {
  console.error("MIBR_AWS_API_BASE_URL, MIBR_AWS_API_KEY_ID, and MIBR_AWS_API_SECRET are required.");
  process.exit(1);
}

const rawBackup = JSON.parse(await readFile(resolve(inputPath), "utf8"));
const backup = {
  exportedAt: rawBackup.exportedAt,
  schema: rawBackup.schema,
  tables: {
    authorized_users: rawBackup.tables?.authorized_users ?? [],
    teams: rawBackup.tables?.teams ?? [],
    matches: rawBackup.tables?.matches ?? [],
    predictions: rawBackup.tables?.predictions ?? [],
  },
};
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
  console.error(payload.error ?? "Backup import failed.");
  process.exit(1);
}

console.log(
  `Imported ${payload.importedItems} items into DynamoDB. Leaderboard entries: ${payload.leaderboardEntries}.`,
);
