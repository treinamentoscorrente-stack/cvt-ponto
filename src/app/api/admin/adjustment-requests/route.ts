import { NextResponse } from "next/server";
import { requireSession, validCsrf } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonBody, jsonError } from "@/lib/http";
import { assertSameOrigin, clientIp } from "@/lib/security";

export const runtime = "nodejs";
const TYPES = ["ENTRADA","INTERVALO_INICIO","INTERVALO_FIM","SAIDA"] as const;

function requestTimes(row: any) {
  return {
    ENTRADA: row.requested_entrada ? String(row.requested_entrada).slice(0,5) : null,
    INTERVALO_INICIO: row.requested_intervalo_inicio ? String(row.requested_intervalo_inicio).slice(0,5) : null,
    INTERVALO_FIM: row.requested_intervalo_fim ? String(row.requested_intervalo_fim).slice(0,5) : null,
    SAIDA: row.requested_saida ? String(row.requested_saida).slice(0,5) : null,
  };
}

function validOrder(times: Record<string,string|null>) {
  let last = -1;
  for (const type of TYPES) {
    const value = times[type];
    if (!value) continue;
    const [h,m] = value.split(":").map(Number);
    const current = h*60+m;
    if (current <= last) return false;
    last = current;
  }
  return true;
}

export async function GET() {
  const auth = await requireSession("admin");
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const result = await db.query(
    `SELECT r.id,r.employee_id,e.name AS employee_name,r.work_date::text AS work_date,
            r.requested_entrada::text,r.requested_intervalo_inicio::text,
            r.requested_intervalo_fim::text,r.requested_saida::text,
            r.reason,r.original_punches,r.status,r.review_note,
            r.created_at,r.reviewed_at
     FROM punch_adjustment_requests r
     JOIN employees e ON e.id=r.employee_id
     ORDER BY CASE WHEN r.status='PENDENTE' THEN 0 ELSE 1 END,
              r.created_at DESC
     LIMIT 200`
  );

  return NextResponse.json({ requests:result.rows }, { headers: { "cache-control":"no-store" } });
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await requireSession("admin");
    if (!auth.ok) return jsonError(auth.error, auth.status);
    if (!validCsrf(request, auth.session)) return jsonError("Token de segurança inválido.", 403);

    const body = await jsonBody(request);
    const id = Number(body.id);
    const decision = String(body.decision || "");
    const reviewNote = String(body.review_note || "").trim();

    if (!Number.isInteger(id) || id <= 0) return jsonError("Solicitação inválida.");
    if (!["APROVADO","REJEITADO"].includes(decision)) return jsonError("Decisão inválida.");
    if (reviewNote.length > 240) return jsonError("Observação muito longa.");

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const req = (await client.query(
        `SELECT * FROM punch_adjustment_requests WHERE id=$1 FOR UPDATE`,
        [id],
      )).rows[0];

      if (!req) {
        await client.query("ROLLBACK");
        return jsonError("Solicitação não encontrada.", 404);
      }
      if (req.status !== "PENDENTE") {
        await client.query("ROLLBACK");
        return jsonError("Esta solicitação já foi analisada.", 409);
      }

      if (decision === "REJEITADO") {
        await client.query(
          `UPDATE punch_adjustment_requests
           SET status='REJEITADO',reviewed_by=$1,review_note=$2,reviewed_at=NOW()
           WHERE id=$3`,
          [auth.session.userId, reviewNote || null, id],
        );
        await client.query(
          `INSERT INTO audit_log(actor_role,actor_id,action,details,ip_address)
           VALUES('admin',$1,'punch_adjustment_rejected',$2::jsonb,$3)`,
          [auth.session.userId, JSON.stringify({
            requestId:id,employeeId:Number(req.employee_id),date:String(req.work_date).slice(0,10),
            reason:req.reason,reviewNote:reviewNote || null
          }), clientIp(request)],
        );
        await client.query("COMMIT");
        return NextResponse.json({ ok:true,status:"REJEITADO" });
      }

      const occurrence = (await client.query(
        `SELECT occurrence_type,period FROM attendance_occurrences
         WHERE employee_id=$1 AND work_date=$2`,
        [req.employee_id, req.work_date],
      )).rows[0];

      if (occurrence && ["FALTA","ATESTADO"].includes(occurrence.occurrence_type)) {
        await client.query("ROLLBACK");
        return jsonError("Remova a falta ou atestado antes de aprovar este ajuste.", 409);
      }

      const times = requestTimes(req);
      if (!validOrder(times)) {
        await client.query("ROLLBACK");
        return jsonError("Os horários solicitados não estão em ordem válida.", 409);
      }
      if (occurrence?.occurrence_type === "FOLGA" && occurrence.period !== "DIA_TODO") {
        if (times.INTERVALO_INICIO || times.INTERVALO_FIM) {
          await client.query("ROLLBACK");
          return jsonError("Folga parcial aceita somente Entrada e Saída.", 409);
        }
      }

      const before = (await client.query(
        `SELECT punch_type,punch_time::text AS punch_time
         FROM punches WHERE employee_id=$1 AND work_date=$2 ORDER BY punch_time`,
        [req.employee_id, req.work_date],
      )).rows;

      await client.query(
        `DELETE FROM punches WHERE employee_id=$1 AND work_date=$2`,
        [req.employee_id, req.work_date],
      );

      for (const type of TYPES) {
        const value = times[type];
        if (!value) continue;
        await client.query(
          `INSERT INTO punches(employee_id,work_date,punch_time,punch_type)
           VALUES($1,$2,$3,$4)`,
          [req.employee_id, req.work_date, value + ":00", type],
        );
      }

      await client.query(
        `UPDATE punch_adjustment_requests
         SET status='APROVADO',reviewed_by=$1,review_note=$2,reviewed_at=NOW()
         WHERE id=$3`,
        [auth.session.userId, reviewNote || null, id],
      );

      await client.query(
        `INSERT INTO audit_log(actor_role,actor_id,action,details,ip_address)
         VALUES('admin',$1,'punch_adjustment_approved',$2::jsonb,$3)`,
        [auth.session.userId, JSON.stringify({
          requestId:id,employeeId:Number(req.employee_id),date:String(req.work_date).slice(0,10),
          employeeReason:req.reason,reviewNote:reviewNote || null,
          before,after:times
        }), clientIp(request)],
      );

      await client.query("COMMIT");
      return NextResponse.json({ ok:true,status:"APROVADO" });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch {
    return jsonError("Não foi possível analisar a solicitação.", 400);
  }
}
