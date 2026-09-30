import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { summariesForEmployee, aggregate } from "@/lib/ponto";
import { extraMinutesForEmployee, extraSessionsForEmployee } from "@/lib/extra-work";
import { validMonth } from "@/lib/validation";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

const WEEKDAYS=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

function weekday(date:string){
  const [y,m,d]=date.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y,m-1,d)).getUTCDay()];
}

function hm(minutes:number){
  const sign=minutes<0?"-":"+";
  const a=Math.abs(minutes);
  return `${sign}${String(Math.floor(a/60)).padStart(2,"0")}h${String(a%60).padStart(2,"0")}`;
}

function reportTotals(base:ReturnType<typeof aggregate>,bankCredit:number){
  const normalPositive=base.positive_minutes;
  const totalPositive=normalPositive+bankCredit;
  return {
    ...base,
    normal_positive_minutes:normalPositive,
    bank_credit_minutes:bankCredit,
    positive_minutes:totalPositive,
    balance_minutes:totalPositive-base.negative_minutes,
    extra_minutes:bankCredit,
  };
}

export async function GET(request:Request){
  const auth=await requireSession("admin");
  if(!auth.ok)return jsonError(auth.error,auth.status);

  const u=new URL(request.url);
  const month=u.searchParams.get("month")||"";
  const raw=u.searchParams.get("employeeId")||"ALL";
  if(!validMonth(month))return jsonError("Mês inválido.");

  const employees=raw==="ALL"
    ?(await db.query("SELECT id,name,cpf,admission_date::text AS admission_date FROM employees ORDER BY name")).rows
    :(await db.query("SELECT id,name,cpf,admission_date::text AS admission_date FROM employees WHERE id=$1",[Number(raw)])).rows;

  const employeeReports:any[]=[];
  const allRows:any[]=[];
  const allExtraRows:any[]=[];
  const aggregateDays:any[]=[];
  let aggregateExtra=0;

  for(const employee of employees){
    const id=Number(employee.id);
    const [summaries,extraSessions,extraMinutes]=await Promise.all([
      summariesForEmployee(id,month),
      extraSessionsForEmployee(id,month),
      extraMinutesForEmployee(id,month),
    ]);

    const extraByDate=new Map<string,{minutes:number;descriptions:string[]}>();
    for(const x of extraSessions){
      const current=extraByDate.get(x.start_date)??{minutes:0,descriptions:[]};
      current.minutes+=x.minutes;
      if(x.description&&!current.descriptions.includes(x.description))current.descriptions.push(x.description);
      extraByDate.set(x.start_date,current);
      allExtraRows.push({employee_id:id,employee_name:employee.name,employee_cpf:employee.cpf,...x});
    }

    const rows=summaries
      .map(day=>{
        const extra=extraByDate.get(day.date)??{minutes:0,descriptions:[]};
        const dailyBalance=day.balance_minutes==null
          ?(extra.minutes>0?extra.minutes:null)
          :day.balance_minutes+extra.minutes;

        const details:string[]=[];
        if(day.holiday_description)details.push(day.holiday_description);
        if(day.note)details.push(day.note);
        if(extra.minutes>0)details.push(`Jornada extra aprovada ${hm(extra.minutes)} no banco: ${extra.descriptions.join(", ")||"sem referência"}`);

        return {
          employee_id:id,
          employee_name:employee.name,
          employee_cpf:employee.cpf,
          ...day,
          weekday:weekday(day.date),
          extra_minutes:extra.minutes,
          daily_balance_minutes:dailyBalance,
          details:details.join(" • "),
        };
      })
      .sort((a,b)=>a.date.localeCompare(b.date));

    const totals=reportTotals(aggregate(summaries),extraMinutes);
    employeeReports.push({
      employee_id:id,
      employee_name:employee.name,
      employee_cpf:employee.cpf,
      admission_date:employee.admission_date,
      totals,
      rows,
    });

    aggregateDays.push(...summaries);
    aggregateExtra+=extraMinutes;
    allRows.push(...rows);
  }

  allRows.sort((a,b)=>a.employee_name.localeCompare(b.employee_name)||a.date.localeCompare(b.date));
  allExtraRows.sort((a,b)=>a.employee_name.localeCompare(b.employee_name)||a.start_date.localeCompare(b.start_date)||a.start_time.localeCompare(b.start_time));

  return NextResponse.json({
    month,
    employee_label:raw==="ALL"?"Todos os funcionários":employees[0]?.name??"Funcionário",
    totals:reportTotals(aggregate(aggregateDays),aggregateExtra),
    rows:allRows,
    extra_rows:allExtraRows,
    employee_reports:employeeReports,
  },{headers:{"cache-control":"no-store"}});
}
