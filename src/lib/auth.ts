import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/security";

const COOKIE = "cvt_session";
const HOURS = 8;
const MOBILE_ACCESS_MINUTES = 15;
const MOBILE_REFRESH_DAYS = 30;

export type SessionRole = "admin" | "employee";
export type Session = {
  role: SessionRole;
  userId: number;
  csrf: string;
  tokenHash: string;
  transport: "cookie" | "bearer";
  mobileSessionId?: number;
};

async function ensureActiveUser(role:SessionRole,userId:number,tokenHash:string,table:"sessions"|"mobile_sessions"){
  if(role!=="employee")return true;
  const emp=await db.query(`SELECT status FROM employees WHERE id=$1`,[userId]);
  if(emp.rows[0]?.status==="ATIVO")return true;
  await db.query(`DELETE FROM ${table} WHERE ${table==="sessions"?"token_hash":"access_token_hash"}=$1`,[tokenHash]);
  return false;
}

export async function createSession(role: SessionRole, userId: number) {
  const raw = randomToken(32);
  const tokenHash = sha256(raw);
  const csrf = randomToken(24);
  const expires = new Date(Date.now() + HOURS*3600_000);
  await db.query(
    `INSERT INTO sessions(token_hash,role,user_id,csrf_token,expires_at) VALUES($1,$2,$3,$4,$5)`,
    [tokenHash, role, userId, csrf, expires],
  );
  const jar = await cookies();
  jar.set(COOKIE, raw, {
    httpOnly:true,
    sameSite:"strict",
    secure:process.env.NODE_ENV === "production",
    path:"/",
    maxAge:HOURS*3600,
  });
  return { csrf };
}

export async function clearSession() {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (raw) await db.query(`DELETE FROM sessions WHERE token_hash=$1`, [sha256(raw)]);
  jar.set(COOKIE, "", {
    httpOnly:true,
    sameSite:"strict",
    secure:process.env.NODE_ENV === "production",
    path:"/",
    maxAge:0,
  });
}

export async function createMobileSession(role:SessionRole,userId:number,deviceName?:string){
  const accessToken=randomToken(32);
  const refreshToken=randomToken(48);
  const accessExpiresAt=new Date(Date.now()+MOBILE_ACCESS_MINUTES*60_000);
  const refreshExpiresAt=new Date(Date.now()+MOBILE_REFRESH_DAYS*24*3600_000);

  await db.query(
    `INSERT INTO mobile_sessions(
      role,user_id,access_token_hash,refresh_token_hash,
      access_expires_at,refresh_expires_at,device_name
    ) VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [
      role,userId,sha256(accessToken),sha256(refreshToken),
      accessExpiresAt,refreshExpiresAt,deviceName?.slice(0,120)||null,
    ],
  );

  return {
    accessToken,
    refreshToken,
    accessExpiresAt:accessExpiresAt.toISOString(),
    refreshExpiresAt:refreshExpiresAt.toISOString(),
  };
}

export async function refreshMobileSession(refreshToken:string){
  const refreshHash=sha256(refreshToken);
  const current=(await db.query(
    `SELECT id,role,user_id
     FROM mobile_sessions
     WHERE refresh_token_hash=$1
       AND revoked_at IS NULL
       AND refresh_expires_at>NOW()
     FOR UPDATE`,
    [refreshHash],
  )).rows[0];

  if(!current)return null;

  const role=current.role as SessionRole;
  const userId=Number(current.user_id);
  if(role==="employee"){
    const emp=(await db.query(`SELECT status FROM employees WHERE id=$1`,[userId])).rows[0];
    if(!emp||emp.status!=="ATIVO"){
      await db.query(`UPDATE mobile_sessions SET revoked_at=NOW() WHERE id=$1`,[current.id]);
      return null;
    }
  }

  const accessToken=randomToken(32);
  const nextRefreshToken=randomToken(48);
  const accessExpiresAt=new Date(Date.now()+MOBILE_ACCESS_MINUTES*60_000);
  const refreshExpiresAt=new Date(Date.now()+MOBILE_REFRESH_DAYS*24*3600_000);

  await db.query(
    `UPDATE mobile_sessions
     SET access_token_hash=$1,refresh_token_hash=$2,
         access_expires_at=$3,refresh_expires_at=$4,last_seen_at=NOW()
     WHERE id=$5`,
    [
      sha256(accessToken),sha256(nextRefreshToken),
      accessExpiresAt,refreshExpiresAt,current.id,
    ],
  );

  return {
    role,
    userId,
    accessToken,
    refreshToken:nextRefreshToken,
    accessExpiresAt:accessExpiresAt.toISOString(),
    refreshExpiresAt:refreshExpiresAt.toISOString(),
  };
}

export async function revokeMobileSession(accessToken:string){
  if(!accessToken)return;
  await db.query(
    `UPDATE mobile_sessions SET revoked_at=NOW() WHERE access_token_hash=$1 AND revoked_at IS NULL`,
    [sha256(accessToken)],
  );
}

async function getBearerSession():Promise<Session|null>{
  const headerList=await headers();
  const authorization=headerList.get("authorization")||"";
  const match=authorization.match(/^Bearer\s+(.+)$/i);
  if(!match)return null;

  const tokenHash=sha256(match[1]);
  const result=await db.query(
    `SELECT id,role,user_id
     FROM mobile_sessions
     WHERE access_token_hash=$1
       AND revoked_at IS NULL
       AND access_expires_at>NOW()`,
    [tokenHash],
  );
  const row=result.rows[0];
  if(!row)return null;

  const role=row.role as SessionRole;
  const userId=Number(row.user_id);
  if(!await ensureActiveUser(role,userId,tokenHash,"mobile_sessions"))return null;

  return {
    role,
    userId,
    csrf:"",
    tokenHash,
    transport:"bearer",
    mobileSessionId:Number(row.id),
  };
}

export async function getSession(): Promise<Session | null> {
  const bearer=await getBearerSession();
  if(bearer)return bearer;

  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  const tokenHash = sha256(raw);

  await db.query(`DELETE FROM sessions WHERE expires_at <= NOW()`);
  const result = await db.query(
    `SELECT role,user_id,csrf_token FROM sessions WHERE token_hash=$1 AND expires_at>NOW()`,
    [tokenHash],
  );
  const row = result.rows[0];
  if (!row) return null;

  const role=row.role as SessionRole;
  const userId=Number(row.user_id);
  if(!await ensureActiveUser(role,userId,tokenHash,"sessions"))return null;

  return {
    role,
    userId,
    csrf:row.csrf_token,
    tokenHash,
    transport:"cookie",
  };
}

export async function requireSession(role?: SessionRole) {
  const s = await getSession();
  if (!s) return { ok:false as const, status:401, error:"Sessão inválida ou expirada." };
  if (role && s.role !== role) return { ok:false as const, status:403, error:"Acesso não autorizado." };
  return { ok:true as const, session:s };
}

export function validCsrf(request: Request, session: Session) {
  if(session.transport==="bearer")return true;
  const supplied = request.headers.get("x-csrf-token") || "";
  return supplied.length > 10 && supplied === session.csrf;
}
