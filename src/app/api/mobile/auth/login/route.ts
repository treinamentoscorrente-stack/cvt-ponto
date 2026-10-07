import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createMobileSession } from "@/lib/auth";
import { verifyPassword, clientIp } from "@/lib/security";
import { LOGIN_RE } from "@/lib/validation";
import { loginRateLimited, failLogin, clearLoginFailures } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { jsonBody, jsonError } from "@/lib/http";

export const runtime="nodejs";

export async function POST(request:Request){
  try{
    const body=await jsonBody(request);
    const login=String(body.login||"").trim();
    const password=String(body.password||"");
    const deviceName=String(body.device_name||"").trim();

    if(!LOGIN_RE.test(login)||password.length<1||password.length>128){
      return jsonError("Login ou senha inválidos.",401);
    }

    const ip=clientIp(request);
    const key=`${ip}|mobile|employee|${login.toLowerCase()}`;
    if(await loginRateLimited(key)){
      return jsonError("Muitas tentativas. Tente novamente em alguns minutos.",429);
    }

    const result=await db.query(
      `SELECT id,password_hash,password_salt,status,name
       FROM employees WHERE LOWER(login)=LOWER($1)`,
      [login],
    );
    const employee=result.rows[0];
    const ok=!!employee
      && employee.status==="ATIVO"
      && await verifyPassword(password,employee.password_hash,employee.password_salt);

    if(!ok){
      await failLogin(key);
      await audit("anonymous",null,"mobile_login_failed",{login},ip);
      return jsonError("Login ou senha inválidos.",401);
    }

    await clearLoginFailures(key);
    await db.query(`DELETE FROM mobile_sessions WHERE refresh_expires_at<=NOW() OR revoked_at IS NOT NULL`);
    const session=await createMobileSession("employee",Number(employee.id),deviceName);
    await audit("employee",Number(employee.id),"mobile_login_success",{deviceName:deviceName||null},ip);

    return NextResponse.json({
      ok:true,
      role:"employee",
      employee:{id:Number(employee.id),name:employee.name,login},
      ...session,
    },{headers:{"cache-control":"no-store"}});
  }catch{
    return jsonError("Requisição inválida.",400);
  }
}
