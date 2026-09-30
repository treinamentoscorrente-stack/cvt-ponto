import { NextResponse } from "next/server";
import { requireSession, validCsrf } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonBody, jsonError } from "@/lib/http";
import { assertSameOrigin, clientIp } from "@/lib/security";
import { validDate } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireSession("admin");
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const r = await db.query(`
    SELECT id,holiday_date::text AS holiday_date,description,created_at
    FROM holidays ORDER BY holiday_date DESC
  `);
  return NextResponse.json({ holidays: r.rows }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await requireSession("admin");
    if (!auth.ok) return jsonError(auth.error, auth.status);
    if (!validCsrf(request, auth.session)) return jsonError("Token de segurança inválido.", 403);
    const body = await jsonBody(request);
    const date = String(body.date || "");
    const description = String(body.description || "").trim();
    if (!validDate(date) || description.length < 2 || description.length > 120) return jsonError("Data ou descrição inválida.");

    const conflict = await db.query(`
      SELECT 1 FROM attendance_occurrences
      WHERE work_date=$1 AND (
        occurrence_type='FALTA' OR (occurrence_type='FOLGA' AND period<>'DIA_TODO')
      ) LIMIT 1
    `, [date]);
    if (conflict.rowCount) return jsonError("Existem faltas ou folgas parciais nesta data. Ajuste essas ocorrências antes de cadastrar o feriado.", 409);

    const result = await db.query(`
      INSERT INTO holidays(holiday_date,description)
      VALUES($1,$2)
      ON CONFLICT(holiday_date) DO UPDATE SET description=EXCLUDED.description
      RETURNING id,holiday_date::text AS holiday_date,description
    `, [date, description]);

    await db.query(
      `INSERT INTO audit_log(actor_role,actor_id,action,details,ip_address)
       VALUES('admin',$1,'holiday_upsert',$2::jsonb,$3)`,
      [auth.session.userId, JSON.stringify(result.rows[0]), clientIp(request)],
    );
    return NextResponse.json({ ok: true, holiday: result.rows[0] });
  } catch {
    return jsonError("Não foi possível salvar o feriado.", 400);
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
    if (!Number.isInteger(id) || id <= 0) return jsonError("Feriado inválido.");
    const before = (await db.query(`SELECT id,holiday_date::text AS holiday_date,description FROM holidays WHERE id=$1`, [id])).rows[0];
    if (!before) return jsonError("Feriado não encontrado.", 404);
    await db.query(`DELETE FROM holidays WHERE id=$1`, [id]);
    await db.query(
      `INSERT INTO audit_log(actor_role,actor_id,action,details,ip_address)
       VALUES('admin',$1,'holiday_delete',$2::jsonb,$3)`,
      [auth.session.userId, JSON.stringify({ before }), clientIp(request)],
    );
    return NextResponse.json({ ok: true });
  } catch {
    return jsonError("Não foi possível remover o feriado.", 400);
  }
}
