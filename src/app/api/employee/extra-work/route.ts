import { NextResponse } from "next/server";
import { requireSession, validCsrf } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonBody, jsonError } from "@/lib/http";
import { assertSameOrigin, clientIp } from "@/lib/security";

export const runtime = "nodejs";

function sessionPayload(row:any){
  return {
    id:Number(row.id),
    start_date:row.start_date,
    start_time:row.start_time,
    end_date:row.end_date??null,
    end_time:row.end_time??null,
    minutes:row.minutes==null?null:Number(row.minutes),
    description:row.description??null,
    open:row.end_date==null,
  };
}

export async function POST(request:Request){
  try{
    assertSameOrigin(request);
    const auth=await requireSession("employee");
    if(!auth.ok)return jsonError(auth.error,auth.status);
    if(!validCsrf(request,auth.session))return jsonError("Token de segurança inválido.",403);

    const body=await jsonBody(request);
    const action=String(body.action||"");
    const description=String(body.description||"").trim();
    if(!["START","STOP"].includes(action))return jsonError("Ação inválida.");
    if(description.length>160)return jsonError("Descrição muito longa.");

    const client=await db.connect();
    try{
      await client.query("BEGIN");
      const emp=(await client.query("SELECT status FROM employees WHERE id=$1 FOR UPDATE",[auth.session.userId])).rows[0];
      if(!emp||emp.status!=="ATIVO"){
        await client.query("ROLLBACK");
        return jsonError("Funcionário inativo.",403);
      }

      const open=(await client.query(
        "SELECT id FROM extra_work_sessions WHERE employee_id=$1 AND ended_at IS NULL FOR UPDATE",
        [auth.session.userId],
      )).rows[0];

      if(action==="START"){
        if(open){
          await client.query("ROLLBACK");
          return jsonError("Já existe uma jornada extra em andamento.",409);
        }
        const r=await client.query(
          "INSERT INTO extra_work_sessions(employee_id,description) VALUES($1,$2) RETURNING id, to_char(started_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS start_date, to_char(started_at AT TIME ZONE 'America/Sao_Paulo','HH24:MI:SS') AS start_time, NULL::text AS end_date, NULL::text AS end_time, NULL::int AS minutes, description",
          [auth.session.userId,description||null],
        );
        await client.query(
          "INSERT INTO audit_log(actor_role,actor_id,action,details,ip_address) VALUES('employee',$1,'extra_work_start',$2::jsonb,$3)",
          [auth.session.userId,JSON.stringify({sessionId:Number(r.rows[0].id),description:description||null}),clientIp(request)],
        );
        await client.query("COMMIT");
        return NextResponse.json({ok:true,session:sessionPayload(r.rows[0])},{status:201});
      }

      if(!open){
        await client.query("ROLLBACK");
        return jsonError("Não há jornada extra em andamento.",409);
      }

      const r=await client.query(
        "UPDATE extra_work_sessions SET ended_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING id, to_char(started_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS start_date, to_char(started_at AT TIME ZONE 'America/Sao_Paulo','HH24:MI:SS') AS start_time, to_char(ended_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS end_date, to_char(ended_at AT TIME ZONE 'America/Sao_Paulo','HH24:MI:SS') AS end_time, ROUND(EXTRACT(EPOCH FROM (ended_at-started_at))/60)::int AS minutes, description",
        [open.id],
      );
      await client.query(
        "INSERT INTO audit_log(actor_role,actor_id,action,details,ip_address) VALUES('employee',$1,'extra_work_stop',$2::jsonb,$3)",
        [auth.session.userId,JSON.stringify({sessionId:Number(r.rows[0].id),minutes:Number(r.rows[0].minutes)}),clientIp(request)],
      );
      await client.query("COMMIT");
      return NextResponse.json({ok:true,session:sessionPayload(r.rows[0])});
    }catch(e){
      await client.query("ROLLBACK");
      throw e;
    }finally{client.release();}
  }catch{
    return jsonError("Não foi possível registrar a jornada extra.",400);
  }
}
