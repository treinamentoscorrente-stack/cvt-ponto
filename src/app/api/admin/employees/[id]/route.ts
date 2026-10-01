import { NextResponse } from "next/server";
import { requireSession, validCsrf } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonBody, jsonError } from "@/lib/http";
import { assertSameOrigin, clientIp } from "@/lib/security";
import { cleanCpf, LOGIN_RE, validCpf, validDate } from "@/lib/validation";

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

    const name = String(body.name || "").trim();
    const cpf = cleanCpf(String(body.cpf || ""));
    const admissionDate = String(body.admission_date || "");
    const status = String(body.status || "");
    const login = String(body.login || "").trim();

    if (
      !Number.isInteger(employeeId) ||
      employeeId <= 0 ||
      name.length < 2 ||
      name.length > 100 ||
      !validCpf(cpf) ||
      !validDate(admissionDate) ||
      !["ATIVO", "INATIVO"].includes(status) ||
      !LOGIN_RE.test(login)
    ) {
      return jsonError("Dados do funcionário inválidos.");
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const before = await client.query(
        "SELECT id,name,cpf,admission_date::text,status,login FROM employees WHERE id=$1 FOR UPDATE",
        [employeeId]
      );
      if (!before.rowCount) {
        await client.query("ROLLBACK");
        return jsonError("Funcionário não encontrado.", 404);
      }

      const previous = before.rows[0];
      await client.query(
        `UPDATE employees
         SET name=$1,cpf=$2,admission_date=$3,status=$4,login=$5,updated_at=NOW()
         WHERE id=$6`,
        [name, cpf, admissionDate, status, login, employeeId]
      );

      if (status === "INATIVO" || previous.login !== login) {
        await client.query("DELETE FROM sessions WHERE role='employee' AND user_id=$1", [employeeId]);
      }

      await client.query(
        `INSERT INTO audit_log(actor_role,actor_id,action,details,ip_address)
         VALUES('admin',$1,'employee_update',$2::jsonb,$3)`,
        [
          auth.session.userId,
          JSON.stringify({
            employeeId,
            before: {
              name: previous.name,
              cpf: previous.cpf,
              admission_date: previous.admission_date,
              status: previous.status,
              login: previous.login,
            },
            after: { name, cpf, admission_date: admissionDate, status, login },
          }),
          clientIp(request),
        ]
      );

      await client.query("COMMIT");
      return NextResponse.json({ ok: true });
    } catch (error: any) {
      await client.query("ROLLBACK");
      if (error?.code === "23505") return jsonError("CPF ou usuário já cadastrado.", 409);
      throw error;
    } finally {
      client.release();
    }
  } catch {
    return jsonError("Não foi possível atualizar o funcionário.", 400);
  }
}
