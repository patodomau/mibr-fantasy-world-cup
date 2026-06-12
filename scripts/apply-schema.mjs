import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const sql = neon(databaseUrl);
const schemaSql = await readFile(join(process.cwd(), "db", "schema.sql"), "utf8");
const statements = schemaSql
  .split(";")
  .map((statement) => statement.trim())
  .filter(Boolean);

for (const statement of statements) {
  await sql.query(`${statement};`);
}

console.log("Applied mibr_fantasy_world_cup schema.");
