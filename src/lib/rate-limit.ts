import { db } from "@/lib/db";
import { sha256 } from "@/lib/security";
const WINDOW_MINUTES = 5, MAX = 5;
export async function loginRateLimited(keyRaw: string) {
  const key = sha256(keyRaw);
  const result = await db.query(`SELECT attempts,window_started_at FROM login_attempts WHERE attempt_key=$1`, [key]);
  const row = result.rows[0]; if (!row) return false;
  const age = Date.now() - new Date(row.window_started_at).getTime();
  if (age > WINDOW_MINUTES*60_000) { await db.query(`DELETE FROM login_attempts WHERE attempt_key=$1`, [key]); return false; }
  return Number(row.attempts) >= MAX;
}
export async function failLogin(keyRaw: string) {
  const key = sha256(keyRaw);
  await db.query(`INSERT INTO login_attempts(attempt_key,attempts,window_started_at) VALUES($1,1,NOW()) ON CONFLICT(attempt_key) DO UPDATE SET attempts=CASE WHEN login_attempts.window_started_at < NOW()-INTERVAL '5 minutes' THEN 1 ELSE login_attempts.attempts+1 END, window_started_at=CASE WHEN login_attempts.window_started_at < NOW()-INTERVAL '5 minutes' THEN NOW() ELSE login_attempts.window_started_at END`, [key]);
}
export async function clearLoginFailures(keyRaw: string) { await db.query(`DELETE FROM login_attempts WHERE attempt_key=$1`, [sha256(keyRaw)]); }
