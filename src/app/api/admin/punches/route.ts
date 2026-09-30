import { NextResponse } from "next/server";
import { requireSession, validCsrf } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonBody, jsonError } from "@/lib/http";
import { assertSameOrigin, clientIp } from "@/lib/security";
import { summaryForDate, TYPES } from "@/lib/ponto";
import { validDate } from "@/lib/validation";

export const runtime = "nodejs";
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export async function GET(request: Request) {
  const auth = await requireSession("admin");
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const u = new URL(request.url);
  const employeeId = Number(u.searchParams.get("employeeId"));
  const date = String(u.searchParams.get("date") || "");
  if (!Number.isInteger(employeeId) || employeeId <= 0 || !validDate(date)) return jsonError("Funcionário ou data inválidos.");
  const summary = await summaryForDate(employeeId, date);
  return NextResponse.json({ summary }, { headers: { "cache-control": "no-store" } });
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await requireSession("admin");
    if (!auth.ok) return jsonError(auth.error, auth.status);
    if (!validCsrf(request, auth.session)) return jsonError("Token de segurança inválido.", 403);

    const body = await jsonBody(request);
    const employeeId = Number(body.employeeId);
    const date = String(body.date || "");
    const reason = String(body.reason || "").trim();
    if (!Number.isInteger(employeeId) || employeeId <= 0 || !validDate(date)) return jsonError("Funcionário ou data inválidos.");
    if (reason.length < 3 || reason.length > 240) return jsonError("Informe um motivo para o ajuste.");

    const times: Record<string,string> = {
      ENTRADA: String(body.entrada || "").trim(),
      INTERVALO_INICIO: String(body.intervalo_inicio || "").trim(),
      INTERVALO_FIM: String(body.intervalo_fim || "").trim(),
      SAIDA: String(body.saida || "").trim(),
    };

    const supplied = TYPES.filter(t => times[t]);
    for (const type of supplied) if (!TIME_RE.test(times[type])) return jsonError("Horário inválido.");

    let last = -1;
    for (const type of supplied) {
      const [h,m] = times[type].split(":").map(Number);
      const current = h * 60 + m;
      if (current <= last) return jsonError("Os horários devem estar em ordem crescente.");
      last = current;
    }

    const occurrence = (await db.query(
      `SELECT occurrence_type,period FROM attendance_occurrences WHERE employee_id=$1 AND work_date=$2`,
      [employeeId, date],
    )).rows[0];
    if (supplied.length && ["FALTA","ATESTADO"].includes(occurrence?.occurrence_type)) {
      return jsonError("Remova a falta/atestado antes de inserir batidas neste dia.", 409);
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const emp = await client.query(`SELECT id FROM employees WHERE id=$1 FOR UPDATE`, [employeeId]);
      if (!emp.rowCount) {
        await client.query("ROLLBACK");
        return jsonError("Funcionário não encontrado.", 404);
      }

      const before = (await client.query(`
        SELECT punch_type,punch_time::text AS punch_time
        FROM punches WHERE employee_id=$1 AND work_date=$2 ORDER BY punch_time
      `, [employeeId, date])).rows;

      await client.query(`DELETE FROM punches WHERE employee_id=$1 AND work_date=$2`, [employeeId, date]);
      for (const type of TYPES) {
        if (!times[type]) continue;
        await client.query(
          `INSERT INTO punches(employee_id,work_date,punch_time,punch_type) VALUES($1,$2,$3,$4)`,
          [employeeId, date, times[type] + ":00", type],
        );
      }

      const after = TYPES.filter(t => times[t]).map(t => ({ punch_type: t, punch_time: times[t] + ":00" }));
      await client.query(
        `INSERT INTO audit_log(actor_role,actor_id,action,details,ip_address)
         VALUES('admin',$1,'punch_manual_adjustment',$2::jsonb,$3)`,
        [auth.session.userId, JSON.stringify({ employeeId, date, reason, before, after }), clientIp(request)],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return NextResponse.json({ ok: true, summary: await summaryForDate(employeeId, date) });
  } catch {
    return jsonError("Não foi possível ajustar o ponto.", 400);
  }
}
