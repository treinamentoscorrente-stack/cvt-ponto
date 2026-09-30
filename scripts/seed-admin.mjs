import crypto from "node:crypto";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import pg from "pg";
const { Client } = pg;

const connectionString = process.env.DB_MIGRATION_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Defina DB_MIGRATION_URL ou DATABASE_URL antes de criar o administrador.");
  process.exit(1);
}

const defaultLogin = process.env.ADMIN_LOGIN || "CVT";
let login = defaultLogin;
let password = process.env.ADMIN_PASSWORD || "";

if (!password) {
  const rl = readline.createInterface({ input, output });
  login = (await rl.question(`Login do administrador [${defaultLogin}]: `)).trim() || defaultLogin;
  password = await rl.question("Senha inicial (mínimo 8 caracteres): ");
  rl.close();
}

if (!/^[A-Za-z0-9._-]{3,40}$/.test(login)) throw new Error("Login administrativo inválido.");
if (password.length < 8 || password.length > 128) throw new Error("A senha precisa ter entre 8 e 128 caracteres.");

const salt = crypto.randomBytes(16);
const hash = await new Promise((resolve, reject) => {
  crypto.scrypt(password, salt, 32, { N: 16384, r: 8, p: 1 }, (err, key) => err ? reject(err) : resolve(key));
});

const client = new Client({ connectionString, application_name: "cvt-ponto-seed" });
try {
  await client.connect();
  await client.query(
    `INSERT INTO admins(login,password_hash,password_salt,active)
     VALUES($1,$2,$3,TRUE)
     ON CONFLICT(login) DO UPDATE SET
       password_hash=EXCLUDED.password_hash,
       password_salt=EXCLUDED.password_salt,
       active=TRUE,
       updated_at=NOW()`,
    [login, hash.toString("base64"), salt.toString("base64")]
  );
  console.log(`Administrador ${login} criado/atualizado.`);
} finally {
  await client.end();
}
