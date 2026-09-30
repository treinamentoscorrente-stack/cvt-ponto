import { NextResponse } from "next/server";
import { requireSession, validCsrf } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonBody, jsonError } from "@/lib/http";
import { assertSameOrigin, clientIp, hashPassword } from "@/lib/security";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const auth = await requireSession("admin");
    if (!auth.ok) return jsonError(auth.error, auth.status);
    if (!validCsrf(request, auth.session)) return jsonError("Token de segurança inválido.", 403);

    const { id } = await params;
    const employeeId = Number(id);
    const body = await jsonBody(request);
    const password = String(body.password || "");

    if (!Number.isInteger(employeeId) || employeeId <= 0) return jsonError("Funcionário inválido.");
    if (password.length < 8 || password.length > 128) return jsonError("A senha precisa ter entre 8 e 128 caracteres.");

    const { hash, salt } = await hashPassword(password);
    const client = await db.connect();

    try {
      await client.query("BEGIN");
      const result = await client.query(
        "UPDATE employees SET password_hash=$1,password_salt=$2,updated_at=NOW() WHERE id=$3 RETURNING id",
        [hash, salt, employeeId]
      );
      if (!result.rowCount) {
        await client.query("ROLLBACK");
        return jsonError("Funcionário não encontrado.", 404);
      }

      await client.query("DELETE FROM sessions WHERE role='employee' AND user_id=$1", [employeeId]);
      await client.query(
        "INSERT INTO audit_log(actor_role,actor_id,action,details,ip_address) VALUES('admin',$1,'employee_password_reset',$2::jsonb,$3)",
        [auth.session.userId, JSON.stringify({ employeeId }), clientIp(request)]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return NextResponse.json({ ok: true });
  } catch {
    return jsonError("Não foi possível redefinir a senha.", 400);
  }
}
