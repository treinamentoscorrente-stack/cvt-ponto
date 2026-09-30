import { NextResponse } from "next/server";
import { requireSession, validCsrf } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonBody, jsonError } from "@/lib/http";
import { assertSameOrigin, clientIp } from "@/lib/security";
import { baseExpected } from "@/lib/ponto";
import { validDate } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireSession("admin");
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const r = await db.query(`
    SELECT o.id,o.employee_id,e.name AS employee_name,o.work_date::text AS work_date,
           o.occurrence_type,o.period,o.note,o.created_at,o.updated_at
    FROM attendance_occurrences o
    JOIN employees e ON e.id=o.employee_id
    ORDER BY o.work_date DESC,e.name
    LIMIT 250
  `);
  return NextResponse.json({ occurrences: r.rows }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await requireSession("admin");
    if (!auth.ok) return jsonError(auth.error, auth.status);
    if (!validCsrf(request, auth.session)) return jsonError("Token de segurança inválido.", 403);

    const body = await jsonBody(request);
    const employeeId = Number(body.employeeId);
    const date = String(body.date || "");
    const type = String(body.type || "");
    let period = String(body.period || "DIA_TODO");
    const note = String(body.note || "").trim();

    if (!Number.isInteger(employeeId) || employeeId <= 0 || !validDate(date)) return jsonError("Funcionário ou data inválidos.");
    if (!["FALTA","FOLGA","ATESTADO"].includes(type)) return jsonError("Tipo de ocorrência inválido.");
    if (type !== "FOLGA") period = "DIA_TODO";
    if (!["DIA_TODO","MANHA","TARDE"].includes(period)) return jsonError("Período inválido.");
    if (note.length > 240) return jsonError("Observação muito longa.");

    const emp = await db.query(`SELECT id FROM employees WHERE id=$1`, [employeeId]);
    if (!emp.rowCount) return jsonError("Funcionário não encontrado.", 404);

    const base = await baseExpected(date);
    if (type === "FALTA" && base === 0) return jsonError("Não é possível lançar falta em dia sem jornada prevista.", 409);
    if (type === "FOLGA" && period !== "DIA_TODO" && base === 0) return jsonError("Folga parcial só pode ser lançada em dia com jornada prevista.", 409);

    if (type === "FALTA" || type === "ATESTADO") {
      const p = await db.query(`SELECT COUNT(*)::int AS n FROM punches WHERE employee_id=$1 AND work_date=$2`, [employeeId, date]);
      if (Number(p.rows[0]?.n ?? 0) > 0) return jsonError("Este dia já possui batidas. Ajuste ou remova os pontos antes desta ocorrência.", 409);
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const before = (await client.query(
        `SELECT id,occurrence_type,period,note FROM attendance_occurrences WHERE employee_id=$1 AND work_date=$2 FOR UPDATE`,
        [employeeId, date],
      )).rows[0] ?? null;

      const result = await client.query(`
        INSERT INTO attendance_occurrences(employee_id,work_date,occurrence_type,period,note,created_by)
        VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(employee_id,work_date) DO UPDATE SET
          occurrence_type=EXCLUDED.occurrence_type,
          period=EXCLUDED.period,
          note=EXCLUDED.note,
          updated_at=NOW()
        RETURNING id,employee_id,work_date::text AS work_date,occurrence_type,period,note
      `, [employeeId, date, type, period, note || null, auth.session.userId]);

      await client.query(
        `INSERT INTO audit_log(actor_role,actor_id,action,details,ip_address)
         VALUES('admin',$1,'occurrence_upsert',$2::jsonb,$3)`,
        [auth.session.userId, JSON.stringify({ before, after: result.rows[0] }), clientIp(request)],
      );
      await client.query("COMMIT");
      return NextResponse.json({ ok: true, occurrence: result.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch {
    return jsonError("Não foi possível salvar a ocorrência.", 400);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await requireSession("admin");
    if (!auth.ok) return jsonError(auth.error, auth.status);
    if (!validCsrf(request, auth.session)) return jsonError("Token de segurança inválido.", 403);
    const body = await jsonBody(request);
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return jsonError("Ocorrência inválida.");

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const before = (await client.query(`
        SELECT id,employee_id,work_date::text AS work_date,occurrence_type,period,note
        FROM attendance_occurrences WHERE id=$1 FOR UPDATE
      `, [id])).rows[0];
      if (!before) {
        await client.query("ROLLBACK");
        return jsonError("Ocorrência não encontrada.", 404);
      }
      await client.query(`DELETE FROM attendance_occurrences WHERE id=$1`, [id]);
      await client.query(
        `INSERT INTO audit_log(actor_role,actor_id,action,details,ip_address)
         VALUES('admin',$1,'occurrence_delete',$2::jsonb,$3)`,
        [auth.session.userId, JSON.stringify({ before }), clientIp(request)],
      );
      await client.query("COMMIT");
      return NextResponse.json({ ok: true });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch {
    return jsonError("Não foi possível remover a ocorrência.", 400);
  }
}
