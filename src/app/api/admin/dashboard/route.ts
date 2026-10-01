import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { summariesForEmployee, aggregate } from "@/lib/ponto";
import { extraMinutesForEmployee, totalsWithExtra } from "@/lib/extra-work";
import { saoPauloNow } from "@/lib/time";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

const MONTH_RE=/^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(request:Request){
  const auth=await requireSession("admin");
  if(!auth.ok)return jsonError(auth.error,auth.status);

  const employees=(await db.query("SELECT id,name,status,login FROM employees ORDER BY name")).rows;
  const today=saoPauloNow().date;
  const currentMonth=today.slice(0,7);
  const requestedMonth=new URL(request.url).searchParams.get("month")||currentMonth;
  if(!MONTH_RE.test(requestedMonth))return jsonError("Competência inválida.",400);

  const allGeneral:any[]=[];
  const allMonthly:any[]=[];
  const generalEmployees:any[]=[];
  const monthlyEmployees:any[]=[];
  let allGeneralExtra=0;
  let allMonthlyExtra=0;

  for(const employee of employees){
    const id=Number(employee.id);
    const [generalSummaries,generalExtra,monthlySummaries,monthlyExtra]=await Promise.all([
      summariesForEmployee(id),
      extraMinutesForEmployee(id),
      summariesForEmployee(id,requestedMonth),
      extraMinutesForEmployee(id,requestedMonth),
    ]);

    allGeneral.push(...generalSummaries);
    allMonthly.push(...monthlySummaries);
    allGeneralExtra+=generalExtra;
    allMonthlyExtra+=monthlyExtra;

    const todaySummary=generalSummaries.find(v=>v.date===today);
    const base={
      id,
      name:employee.name,
      status:employee.status,
      login:employee.login,
    };

    generalEmployees.push({
      ...base,
      totals:totalsWithExtra(aggregate(generalSummaries),generalExtra),
      today_status:todaySummary?.status??"SEM REGISTRO",
    });

    monthlyEmployees.push({
      ...base,
      totals:totalsWithExtra(aggregate(monthlySummaries),monthlyExtra),
    });
  }

  return NextResponse.json({
    total:employees.length,
    active:employees.filter(x=>x.status==="ATIVO").length,
    inactive:employees.filter(x=>x.status==="INATIVO").length,
    totals:totalsWithExtra(aggregate(allGeneral),allGeneralExtra),
    employees:generalEmployees,
    month:requestedMonth,
    monthly_totals:totalsWithExtra(aggregate(allMonthly),allMonthlyExtra),
    monthly_employees:monthlyEmployees,
  },{headers:{"cache-control":"no-store"}});
}
