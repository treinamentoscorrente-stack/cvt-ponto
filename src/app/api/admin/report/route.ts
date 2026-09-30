import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { summariesForEmployee, aggregate } from "@/lib/ponto";
import { extraMinutesForEmployee, extraSessionsForEmployee, totalsWithExtra } from "@/lib/extra-work";
import { validMonth } from "@/lib/validation";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request:Request){
  const auth=await requireSession("admin");
  if(!auth.ok)return jsonError(auth.error,auth.status);

  const u=new URL(request.url);
  const month=u.searchParams.get("month")||"";
  const raw=u.searchParams.get("employeeId")||"ALL";
  if(!validMonth(month))return jsonError("Mês inválido.");

  const employees=raw==="ALL"
    ?(await db.query("SELECT id,name FROM employees ORDER BY name")).rows
    :(await db.query("SELECT id,name FROM employees WHERE id=$1",[Number(raw)])).rows;

  const rows:any[]=[];
  const extraRows:any[]=[];
  const all:any[]=[];
  let allExtra=0;

  for(const employee of employees){
    const id=Number(employee.id);
    const [summaries,extraSessions,extraMinutes]=await Promise.all([
      summariesForEmployee(id,month),
      extraSessionsForEmployee(id,month),
      extraMinutesForEmployee(id,month),
    ]);

    all.push(...summaries);
    allExtra+=extraMinutes;
    for(const d of summaries)rows.push({employee_id:id,employee_name:employee.name,...d});
    for(const extra of extraSessions)extraRows.push({employee_id:id,employee_name:employee.name,...extra});
  }

  rows.sort((x,y)=>x.date.localeCompare(y.date)||x.employee_name.localeCompare(y.employee_name));
  extraRows.sort((x,y)=>x.start_date.localeCompare(y.start_date)||x.start_time.localeCompare(y.start_time)||x.employee_name.localeCompare(y.employee_name));

  return NextResponse.json({
    month,
    employee_label:raw==="ALL"?"Todos os funcionários":employees[0]?.name??"Funcionário",
    totals:totalsWithExtra(aggregate(all),allExtra),
    rows,
    extra_rows:extraRows,
  },{headers:{"cache-control":"no-store"}});
}
