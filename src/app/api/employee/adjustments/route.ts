import { NextResponse } from "next/server";
import { requireSession, validCsrf } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonBody, jsonError } from "@/lib/http";
import { assertSameOrigin, clientIp } from "@/lib/security";
import { summaryForDate } from "@/lib/ponto";
import { saoPauloNow } from "@/lib/time";
import { validDate } from "@/lib/validation";

export const runtime = "nodejs";

const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const fields = ["entrada","intervalo_inicio","intervalo_fim","saida"] as const;

function normalizeTime(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (!TIME_RE.test(text)) throw new Error("TIME");
  return text;
}

function validateOrder(times: Record<string,string|null>) {
  let last = -1;
  for (const key of fields) {
    const value = times[key];
    if (!value) continue;
    const [h,m] = value.split(":").map(Number);
    const current = h*60+m;
    if (current <= last) throw new Error("ORDER");
    last = current;
  }
}

export async function GET(request: Request) {
  const auth = await requireSession("employee");
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const u = new URL(request.url);
  const date = String(u.searchParams.get("date") || "");

  if (date) {
    if (!validDate(date)) return jsonError("Data inválida.");
    const emp = (await db.query(
      `SELECT admission_date::text AS admission_date FROM employees WHERE id=$1`,
      [auth.session.userId],
    )).rows[0];
    if (!emp || date < emp.admission_date || date > saoPauloNow().date) {
      return jsonError("A data deve estar entre a admissão e hoje.");
    }
    const summary = await summaryForDate(auth.session.userId, date);
    const pending = (await db.query(
      `SELECT id,work_date::text AS work_date,
              requested_entrada::text,requested_intervalo_inicio::text,
              requested_intervalo_fim::text,requested_saida::text,
              reason,status,review_note,created_at,reviewed_at
       FROM punch_adjustment_requests
       WHERE employee_id=$1 AND work_date=$2 AND status='PENDENTE'
       LIMIT 1`,
      [auth.session.userId, date],
    )).rows[0] ?? null;
    return NextResponse.json({ summary, pending }, { headers: { "cache-control":"no-store" } });
  }

  const result = await db.query(
    `SELECT id,work_date::text AS work_date,
            requested_entrada::text,requested_intervalo_inicio::text,
            requested_intervalo_fim::text,requested_saida::text,
            reason,status,review_note,created_at,reviewed_at
     FROM punch_adjustment_requests
     WHERE employee_id=$1
     ORDER BY created_at DESC
     LIMIT 20`,
    [auth.session.userId],
  );
  return NextResponse.json({ requests: result.rows }, { headers: { "cache-control":"no-store" } });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await requireSession("employee");
    if (!auth.ok) return jsonError(auth.error, auth.status);
    if (!validCsrf(request, auth.session)) return jsonError("Token de segurança inválido.", 403);

    const body = await jsonBody(request);
    const date = String(body.date || "");
    const reason = String(body.reason || "").trim();

    if (!validDate(date)) return jsonError("Data inválida.");
    if (reason.length < 3 || reason.length > 240) return jsonError("Informe o motivo do ajuste.");

    const emp = (await db.query(
      `SELECT admission_date::text AS admission_date,status FROM employees WHERE id=$1`,
      [auth.session.userId],
    )).rows[0];
    if (!emp || emp.status !== "ATIVO") return jsonError("Funcionário inativo.", 403);
    if (date < emp.admission_date || date > saoPauloNow().date) {
      return jsonError("A data deve estar entre a admissão e hoje.");
    }

    const occurrence = (await db.query(
      `SELECT occurrence_type,period FROM attendance_occurrences
       WHERE employee_id=$1 AND work_date=$2`,
      [auth.session.userId, date],
    )).rows[0];

    if (occurrence && ["FALTA","ATESTADO"].includes(occurrence.occurrence_type)) {
      return jsonError("Este dia possui falta ou atestado lançado e não aceita solicitação de ponto.", 409);
    }

    const times: Record<string,string|null> = {};
    for (const key of fields) times[key] = normalizeTime(body[key]);
    validateOrder(times);

    if (occurrence?.occurrence_type === "FOLGA" && occurrence.period !== "DIA_TODO") {
      if (times.intervalo_inicio || times.intervalo_fim) {
        return jsonError("Em folga parcial, a jornada utiliza somente Entrada e Saída.", 409);
      }
    }

    const original = (await db.query(
      `SELECT punch_type,punch_time::text AS punch_time
       FROM punches WHERE employee_id=$1 AND work_date=$2 ORDER BY punch_time`,
      [auth.session.userId, date],
    )).rows;

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const duplicate = await client.query(
        `SELECT id FROM punch_adjustment_requests
         WHERE employee_id=$1 AND work_date=$2 AND status='PENDENTE' FOR UPDATE`,
        [auth.session.userId, date],
      );
      if (duplicate.rowCount) {
        await client.query("ROLLBACK");
        return jsonError("Já existe uma solicitação pendente para esta data.", 409);
      }

      const result = await client.query(
        `INSERT INTO punch_adjustment_requests(
          employee_id,work_date,requested_entrada,requested_intervalo_inicio,
          requested_intervalo_fim,requested_saida,reason,original_punches
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
        RETURNING id,work_date::text AS work_date,status`,
        [
          auth.session.userId,date,times.entrada,times.intervalo_inicio,
          times.intervalo_fim,times.saida,reason,JSON.stringify(original),
        ],
      );

      await client.query(
        `INSERT INTO audit_log(actor_role,actor_id,action,details,ip_address)
         VALUES('employee',$1,'punch_adjustment_requested',$2::jsonb,$3)`,
        [auth.session.userId, JSON.stringify({
          requestId:Number(result.rows[0].id), date, reason,
          requested:times, original
        }), clientIp(request)],
      );
      await client.query("COMMIT");

      return NextResponse.json({ ok:true, request:result.rows[0] }, { status:201 });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (e) {
    if (e instanceof Error && e.message === "TIME") return jsonError("Horário inválido.");
    if (e instanceof Error && e.message === "ORDER") return jsonError("Os horários devem estar em ordem crescente.");
    return jsonError("Não foi possível enviar a solicitação.", 400);
  }
}
