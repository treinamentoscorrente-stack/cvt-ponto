import fs from "node:fs/promises";
import pg from "pg";
const { Client } = pg;

const connectionString = process.env.DB_MIGRATION_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Defina DB_MIGRATION_URL ou DATABASE_URL antes de executar a migração.");
  process.exit(1);
}

const sql = await fs.readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
const client = new Client({ connectionString, application_name: "cvt-ponto-migrate" });
try {
  await client.connect();
  await client.query(sql);
  console.log("Banco PostgreSQL migrado com sucesso.");
} finally {
  await client.end();
}
