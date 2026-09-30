import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/security";

const COOKIE = "cvt_session";
const HOURS = 8;
export type SessionRole = "admin" | "employee";
export type Session = { role: SessionRole; userId: number; csrf: string; tokenHash: string };

export async function createSession(role: SessionRole, userId: number) {
  const raw = randomToken(32); const tokenHash = sha256(raw); const csrf = randomToken(24);
  const expires = new Date(Date.now() + HOURS*3600_000);
  await db.query(`INSERT INTO sessions(token_hash,role,user_id,csrf_token,expires_at) VALUES($1,$2,$3,$4,$5)`, [tokenHash, role, userId, csrf, expires]);
  const jar = await cookies();
  jar.set(COOKIE, raw, { httpOnly:true, sameSite:"strict", secure:process.env.NODE_ENV === "production", path:"/", maxAge:HOURS*3600 });
  return { csrf };
}

export async function clearSession() {
  const jar = await cookies(); const raw = jar.get(COOKIE)?.value;
  if (raw) await db.query(`DELETE FROM sessions WHERE token_hash=$1`, [sha256(raw)]);
  jar.set(COOKIE, "", { httpOnly:true, sameSite:"strict", secure:process.env.NODE_ENV === "production", path:"/", maxAge:0 });
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies(); const raw = jar.get(COOKIE)?.value; if (!raw) return null;
  const tokenHash = sha256(raw);
  await db.query(`DELETE FROM sessions WHERE expires_at <= NOW()`);
  const result = await db.query(`SELECT role,user_id,csrf_token FROM sessions WHERE token_hash=$1 AND expires_at>NOW()`, [tokenHash]);
  const row = result.rows[0]; if (!row) return null;
  if (row.role === "employee") {
    const emp = await db.query(`SELECT status FROM employees WHERE id=$1`, [row.user_id]);
    if (!emp.rows[0] || emp.rows[0].status !== "ATIVO") { await db.query(`DELETE FROM sessions WHERE token_hash=$1`, [tokenHash]); return null; }
  }
  return { role: row.role, userId:Number(row.user_id), csrf:row.csrf_token, tokenHash };
}

export async function requireSession(role?: SessionRole) {
  const s = await getSession();
  if (!s) return { ok:false as const, status:401, error:"Sessão inválida ou expirada." };
  if (role && s.role !== role) return { ok:false as const, status:403, error:"Acesso não autorizado." };
  return { ok:true as const, session:s };
}

export function validCsrf(request: Request, session: Session) {
  const supplied = request.headers.get("x-csrf-token") || "";
  return supplied.length > 10 && supplied === session.csrf;
}
