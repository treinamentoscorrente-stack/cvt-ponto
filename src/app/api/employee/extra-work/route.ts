import { NextResponse } from "next/server";
import { requireSession, validCsrf } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonBody, jsonError } from "@/lib/http";
import { assertSameOrigin, clientIp } from "@/lib/security";
import { validDate } from "@/lib/validation";

export const runtime = "nodejs";
const TIME_RE=/^(?:[01]\d|2[0-3]):[0-5]\d$/;

export async function GET(){
  const auth=await requireSession("employee");
  if(!auth.ok)return jsonError(auth.error,auth.status);

  const r=await db.query(
    `SELECT id,
      to_char(started_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS start_date,
      to_char(started_at AT TIME ZONE 'America/Sao_Paulo','HH24:MI') AS start_time,
      to_char(ended_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS end_date,
      to_char(ended_at AT TIME ZONE 'America/Sao_Paulo','HH24:MI') AS end_time,
      ROUND(EXTRACT(EPOCH FROM (ended_at-started_at))/60)::int AS minutes,
      description,status,review_note,created_at,reviewed_at
     FROM extra_work_requests
     WHERE employee_id=$1
     ORDER BY created_at DESC
     LIMIT 50`,
    [auth.session.userId],
  );
  return NextResponse.json({requests:r.rows},{headers:{"cache-control":"no-store"}});
}

export async function POST(request:Request){
  try{
    assertSameOrigin(request);
    const auth=await requireSession("employee");
    if(!auth.ok)return jsonError(auth.error,auth.status);
    if(!validCsrf(request,auth.session))return jsonError("Token de segurança inválido.",403);

    const body=await jsonBody(request);
    const startDate=String(body.start_date||"");
    const startTime=String(body.start_time||"");
    const endDate=String(body.end_date||"");
    const endTime=String(body.end_time||"");
    const description=String(body.description||"").trim();

    if(!validDate(startDate)||!validDate(endDate))return jsonError("Data inválida.");
    if(!TIME_RE.test(startTime)||!TIME_RE.test(endTime))return jsonError("Horário inválido.");
    if(description.length<3||description.length>160)return jsonError("Informe a referência ou motivo das horas extras.");

    const employee=(await db.query(
      "SELECT admission_date::text AS admission_date,status FROM employees WHERE id=$1",
      [auth.session.userId],
    )).rows[0];
    if(!employee||employee.status!=="ATIVO")return jsonError("Funcionário inativo.",403);
    if(startDate<employee.admission_date)return jsonError("A data é anterior à admissão.",409);

    const ts=(await db.query(
      `SELECT
        (($1::date + $2::time) AT TIME ZONE 'America/Sao_Paulo') AS started_at,
        (($3::date + $4::time) AT TIME ZONE 'America/Sao_Paulo') AS ended_at,
        EXTRACT(EPOCH FROM (
          (($3::date + $4::time) AT TIME ZONE 'America/Sao_Paulo')
          - (($1::date + $2::time) AT TIME ZONE 'America/Sao_Paulo')
        ))/60 AS minutes`,
      [startDate,startTime,endDate,endTime],
    )).rows[0];

    const minutes=Number(ts.minutes);
    if(!Number.isFinite(minutes)||minutes<=0)return jsonError("A saída deve ser posterior à entrada.",409);
    if(minutes>1440)return jsonError("A jornada extra não pode ultrapassar 24 horas.",409);

    const future=(await db.query(
      `SELECT (($1::date + $2::time) AT TIME ZONE 'America/Sao_Paulo') > NOW() AS future`,
      [endDate,endTime],
    )).rows[0]?.future;
    if(future)return jsonError("A saída da jornada extra não pode estar no futuro.",409);

    const client=await db.connect();
    try{
      await client.query("BEGIN");
      const overlap=await client.query(
        `SELECT 1 FROM extra_work_requests
         WHERE employee_id=$1
           AND status IN ('PENDENTE','APROVADO')
           AND started_at < (($4::date + $5::time) AT TIME ZONE 'America/Sao_Paulo')
           AND ended_at > (($2::date + $3::time) AT TIME ZONE 'America/Sao_Paulo')
         LIMIT 1`,
        [auth.session.userId,startDate,startTime,endDate,endTime],
      );
      if(overlap.rowCount){
        await client.query("ROLLBACK");
        return jsonError("Já existe uma solicitação ou hora extra aprovada que sobrepõe este período.",409);
      }

      const inserted=await client.query(
        `INSERT INTO extra_work_requests(
          employee_id,started_at,ended_at,description
        ) VALUES(
          $1,
          (($2::date + $3::time) AT TIME ZONE 'America/Sao_Paulo'),
          (($4::date + $5::time) AT TIME ZONE 'America/Sao_Paulo'),
          $6
        )
        RETURNING id,status`,
        [auth.session.userId,startDate,startTime,endDate,endTime,description],
      );

      await client.query(
        `INSERT INTO audit_log(actor_role,actor_id,action,details,ip_address)
         VALUES('employee',$1,'extra_work_requested',$2::jsonb,$3)`,
        [auth.session.userId,JSON.stringify({
          requestId:Number(inserted.rows[0].id),
          startDate,startTime,endDate,endTime,minutes,description
        }),clientIp(request)],
      );
      await client.query("COMMIT");
      return NextResponse.json({ok:true,id:Number(inserted.rows[0].id),status:"PENDENTE",minutes},{status:201});
    }catch(e){
      await client.query("ROLLBACK");
      throw e;
    }finally{client.release();}
  }catch{
    return jsonError("Não foi possível enviar a solicitação de jornada extra.",400);
  }
}
