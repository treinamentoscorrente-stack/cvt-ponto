import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { verifyPassword, hashPassword, timingSafeTextEqual, assertSameOrigin, clientIp } from "@/lib/security";
import { LOGIN_RE } from "@/lib/validation";
import { loginRateLimited, failLogin, clearLoginFailures } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { jsonBody, jsonError } from "@/lib/http";

export const runtime = "nodejs";

async function bootstrapAdminIfNeeded(login: string, password: string) {
  const existing = await db.query(`SELECT COUNT(*)::int AS n FROM admins`);
  if (Number(existing.rows[0]?.n ?? 0) > 0) return;

  const bootstrapLogin = String(process.env.ADMIN_LOGIN || "").trim();
  const bootstrapPassword = String(process.env.ADMIN_PASSWORD || "");
  if (!bootstrapLogin || !bootstrapPassword) return;
  if (login.toLowerCase() !== bootstrapLogin.toLowerCase()) return;
  if (!timingSafeTextEqual(password, bootstrapPassword)) return;

  const hp = await hashPassword(password);
  await db.query(
    `INSERT INTO admins(login,password_hash,password_salt,active)
     VALUES($1,$2,$3,TRUE)
     ON CONFLICT(login) DO NOTHING`,
    [bootstrapLogin, hp.hash, hp.salt],
  );
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const b = await jsonBody(request);
    const role = String(b.role || "");
    const login = String(b.login || "").trim();
    const password = String(b.password || "");

    if (!["admin", "employee"].includes(role) || !LOGIN_RE.test(login) || password.length < 1 || password.length > 128) {
      return jsonError("Login ou senha inválidos.", 401);
    }

    const ip = clientIp(request);
    const key = `${ip}|${role}|${login.toLowerCase()}`;
    if (await loginRateLimited(key)) {
      return jsonError("Muitas tentativas. Tente novamente em alguns minutos.", 429);
    }

    if (role === "admin") {
      await bootstrapAdminIfNeeded(login, password);
    }

    const q = role === "admin"
      ? `SELECT id,password_hash,password_salt,active FROM admins WHERE LOWER(login)=LOWER($1)`
      : `SELECT id,password_hash,password_salt,status FROM employees WHERE LOWER(login)=LOWER($1)`;

    const r = await db.query(q, [login]);
    const u = r.rows[0];
    const ok = !!u
      && await verifyPassword(password, u.password_hash, u.password_salt)
      && (role === "admin" ? u.active : u.status === "ATIVO");

    if (!ok) {
      await failLogin(key);
      await audit("anonymous", null, "login_failed", { role, login }, ip);
      return jsonError("Login ou senha inválidos.", 401);
    }

    await clearLoginFailures(key);
    const s = await createSession(role as "admin" | "employee", Number(u.id));
    await audit(role, Number(u.id), "login_success", {}, ip);
    return NextResponse.json({ ok: true, role, csrf: s.csrf }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return jsonError(e instanceof Error && e.message === "ORIGIN" ? "Origem inválida." : "Requisição inválida.", 400);
  }
}
