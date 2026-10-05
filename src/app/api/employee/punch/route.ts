import { NextResponse } from "next/server";
import { requireSession, validCsrf } from "@/lib/auth";
import { db } from "@/lib/db";
import { expectedPunchTypes, type DayOccurrence } from "@/lib/ponto";
import { saoPauloNow } from "@/lib/time";
import { jsonError } from "@/lib/http";
import { assertSameOrigin, clientIp } from "@/lib/security";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await requireSession("employee");
    if (!auth.ok) return jsonError(auth.error, auth.status);
    if (!validCsrf(request, auth.session)) return jsonError("Token de segurança inválido.", 403);

    const now = saoPauloNow();
    const client = await db.connect();
    let type: string;

    try {
      await client.query("BEGIN");
      const employee = (await client.query(
        `SELECT status FROM employees WHERE id=$1 FOR UPDATE`,
        [auth.session.userId],
      )).rows[0];

      if (!employee || employee.status !== "ATIVO") {
        await client.query("ROLLBACK");
        return jsonError("Funcionário inativo.", 403);
      }

      const occurrenceRow = (await client.query(
        `SELECT occurrence_type,period,note
         FROM attendance_occurrences WHERE employee_id=$1 AND work_date=$2`,
        [auth.session.userId, now.date],
      )).rows[0];

      const occurrence: DayOccurrence | null = occurrenceRow ? {
        occurrence_type: occurrenceRow.occurrence_type,
        period: occurrenceRow.period,
        note: occurrenceRow.note ?? null,
      } : null;

      const sequence = expectedPunchTypes(occurrence);
      if (!sequence.length) {
        await client.query("ROLLBACK");
        const label = occurrence?.occurrence_type === "ATESTADO" ? "atestado" : "falta";
        return jsonError(`Registro de ponto bloqueado: há ${label} lançado para hoje.`, 409);
      }

      const punches = await client.query(
        `SELECT punch_time::text AS punch_time,punch_type
         FROM punches WHERE employee_id=$1 AND work_date=$2 ORDER BY punch_time`,
        [auth.session.userId, now.date],
      );

      const existing = new Set(punches.rows.map(row => String(row.punch_type)));
      const next = sequence.find(punchType => !existing.has(punchType));
      if (!next) {
        await client.query("ROLLBACK");
        return jsonError("Jornada do dia já concluída.", 409);
      }

      type = next;
      const last = punches.rows.at(-1)?.punch_time;
      if (last && now.time <= last) {
        await client.query("ROLLBACK");
        return jsonError("Aguarde um instante para registrar a próxima batida.", 409);
      }

      await client.query(
        `INSERT INTO punches(employee_id,work_date,punch_time,punch_type) VALUES($1,$2,$3,$4)`,
        [auth.session.userId, now.date, now.time, type],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    await audit("employee", auth.session.userId, "punch", { type, date: now.date, time: now.time }, clientIp(request));
    return NextResponse.json({ ok: true, type, date: now.date, time: now.time }, { status: 201 });
  } catch {
    return jsonError("Não foi possível registrar o ponto.", 400);
  }
}
