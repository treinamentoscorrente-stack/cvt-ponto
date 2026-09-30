import { NextResponse } from "next/server";
import { requireSession, validCsrf } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonBody, jsonError } from "@/lib/http";
import { assertSameOrigin, clientIp } from "@/lib/security";

export const runtime = "nodejs";

export async function GET(){
  const auth=await requireSession("admin");
  if(!auth.ok)return jsonError(auth.error,auth.status);

  const r=await db.query(
    `SELECT r.id,r.employee_id,e.name AS employee_name,
      to_char(r.started_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS start_date,
      to_char(r.started_at AT TIME ZONE 'America/Sao_Paulo','HH24:MI') AS start_time,
      to_char(r.ended_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS end_date,
      to_char(r.ended_at AT TIME ZONE 'America/Sao_Paulo','HH24:MI') AS end_time,
      ROUND(EXTRACT(EPOCH FROM (r.ended_at-r.started_at))/60)::int AS minutes,
      r.description,r.status,r.review_note,r.created_at,r.reviewed_at
     FROM extra_work_requests r
     JOIN employees e ON e.id=r.employee_id
     ORDER BY CASE WHEN r.status='PENDENTE' THEN 0 ELSE 1 END,r.created_at DESC
     LIMIT 250`
  );
  return NextResponse.json({requests:r.rows},{headers:{"cache-control":"no-store"}});
}

export async function PATCH(request:Request){
  try{
    assertSameOrigin(request);
    const auth=await requireSession("admin");
    if(!auth.ok)return jsonError(auth.error,auth.status);
    if(!validCsrf(request,auth.session))return jsonError("Token de segurança inválido.",403);

    const body=await jsonBody(request);
    const id=Number(body.id);
    const decision=String(body.decision||"");
    const reviewNote=String(body.review_note||"").trim();

    if(!Number.isInteger(id)||id<=0)return jsonError("Solicitação inválida.");
    if(!["APROVADO","REJEITADO"].includes(decision))return jsonError("Decisão inválida.");
    if(reviewNote.length>240)return jsonError("Observação muito longa.");

    const client=await db.connect();
    try{
      await client.query("BEGIN");
      const row=(await client.query(
        "SELECT * FROM extra_work_requests WHERE id=$1 FOR UPDATE",
        [id],
      )).rows[0];

      if(!row){
        await client.query("ROLLBACK");
        return jsonError("Solicitação não encontrada.",404);
      }
      if(row.status!=="PENDENTE"){
        await client.query("ROLLBACK");
        return jsonError("Esta solicitação já foi analisada.",409);
      }

      if(decision==="APROVADO"){
        const overlap=await client.query(
          `SELECT 1 FROM extra_work_requests
           WHERE employee_id=$1 AND id<>$2 AND status='APROVADO'
             AND started_at < $4 AND ended_at > $3
           LIMIT 1`,
          [row.employee_id,id,row.started_at,row.ended_at],
        );
        if(overlap.rowCount){
          await client.query("ROLLBACK");
          return jsonError("Já existe outra jornada extra aprovada que sobrepõe este período.",409);
        }
      }

      await client.query(
        `UPDATE extra_work_requests
         SET status=$1,reviewed_by=$2,review_note=$3,reviewed_at=NOW()
         WHERE id=$4`,
        [decision,auth.session.userId,reviewNote||null,id],
      );

      await client.query(
        `INSERT INTO audit_log(actor_role,actor_id,action,details,ip_address)
         VALUES('admin',$1,$2,$3::jsonb,$4)`,
        [
          auth.session.userId,
          decision==="APROVADO"?"extra_work_approved":"extra_work_rejected",
          JSON.stringify({
            requestId:id,
            employeeId:Number(row.employee_id),
            startedAt:row.started_at,
            endedAt:row.ended_at,
            description:row.description,
            reviewNote:reviewNote||null
          }),
          clientIp(request),
        ],
      );

      await client.query("COMMIT");
      return NextResponse.json({ok:true,status:decision});
    }catch(e){
      await client.query("ROLLBACK");
      throw e;
    }finally{client.release();}
  }catch{
    return jsonError("Não foi possível analisar a solicitação de jornada extra.",400);
  }
}
