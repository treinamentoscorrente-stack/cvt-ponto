import fs from "node:fs";

const requiredFiles = [
  "src/app/page.tsx",
  "src/app/admin/page.tsx",
  "src/app/ponto/page.tsx",
  "src/lib/db.ts",
  "db/schema.sql",
];

let failed = false;
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    console.error(`Arquivo ausente: ${file}`);
    failed = true;
  }
}

const requiredEnv = ["DATABASE_URL"];
for (const key of requiredEnv) {
  if (!process.env[key]) console.warn(`Aviso: ${key} ainda não está definido.`);
}

if (failed) process.exit(1);
console.log("Estrutura do projeto: OK");
console.log("Use npm run typecheck e npm run build após instalar as dependências.");
