import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { summariesForEmployee, aggregate } from "@/lib/ponto";
import { extraMinutesForEmployee, extraSessionsForEmployee, totalsWithExtra } from "@/lib/extra-work";
import { saoPauloNow } from "@/lib/time";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(){
  const auth=await requireSession("admin");
  if(!auth.ok)return jsonError(auth.error,auth.status);

  const employees=(await db.query("SELECT id,name,status,login FROM employees ORDER BY name")).rows;
  const today=saoPauloNow().date;
  const all:any[]=[];
  const out:any[]=[];
  let allExtra=0;

  for(const employee of employees){
    const id=Number(employee.id);
    const [summaries,extraMinutes,extraSessions]=await Promise.all([
      summariesForEmployee(id),
      extraMinutesForEmployee(id),
      extraSessionsForEmployee(id),
    ]);
    all.push(...summaries);
    allExtra+=extraMinutes;
    const td=summaries.find(v=>v.date===today);
    const openExtra=extraSessions.find(s=>s.open);
    out.push({
      id,
      name:employee.name,
      status:employee.status,
      login:employee.login,
      totals:totalsWithExtra(aggregate(summaries),extraMinutes),
      today_status:openExtra?"JORNADA EXTRA EM ANDAMENTO":td?.status??"SEM REGISTRO",
    });
  }

  return NextResponse.json({
    total:employees.length,
    active:employees.filter(x=>x.status==="ATIVO").length,
    inactive:employees.filter(x=>x.status==="INATIVO").length,
    totals:totalsWithExtra(aggregate(all),allExtra),
    employees:out,
  },{headers:{"cache-control":"no-store"}});
}
