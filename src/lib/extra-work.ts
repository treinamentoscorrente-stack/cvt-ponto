import { db } from "@/lib/db";

export type ExtraWorkSession = {
  id:number;
  start_date:string;
  start_time:string;
  end_date:string|null;
  end_time:string|null;
  minutes:number|null;
  description:string|null;
  open:boolean;
};

export async function extraSessionsForEmployee(employeeId:number, month?:string):Promise<ExtraWorkSession[]> {
  const params:any[]=[employeeId];
  let filter="employee_id=$1";
  if(month){params.push(month);filter+=" AND to_char(started_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM')=$2";}
  const r=await db.query(
    `SELECT id,
      to_char(started_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS start_date,
      to_char(started_at AT TIME ZONE 'America/Sao_Paulo','HH24:MI:SS') AS start_time,
      CASE WHEN ended_at IS NULL THEN NULL ELSE to_char(ended_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') END AS end_date,
      CASE WHEN ended_at IS NULL THEN NULL ELSE to_char(ended_at AT TIME ZONE 'America/Sao_Paulo','HH24:MI:SS') END AS end_time,
      CASE WHEN ended_at IS NULL THEN NULL ELSE ROUND(EXTRACT(EPOCH FROM (ended_at-started_at))/60)::int END AS minutes,
      description
    FROM extra_work_sessions
    WHERE ${filter}
    ORDER BY started_at DESC`,
    params,
  );
  return r.rows.map((x:any)=>({
    id:Number(x.id),start_date:x.start_date,start_time:x.start_time,
    end_date:x.end_date??null,end_time:x.end_time??null,
    minutes:x.minutes==null?null:Number(x.minutes),
    description:x.description??null,open:x.end_date==null,
  }));
}

export async function extraMinutesForEmployee(employeeId:number, month?:string){
  const params:any[]=[employeeId];
  let filter="employee_id=$1 AND ended_at IS NOT NULL";
  if(month){params.push(month);filter+=" AND to_char(started_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM')=$2";}
  const r=await db.query(
    `SELECT COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (ended_at-started_at))/60)),0)::int AS minutes
     FROM extra_work_sessions WHERE ${filter}`,
    params,
  );
  return Number(r.rows[0]?.minutes??0);
}

export function totalsWithExtra<T extends {
  worked_minutes:number;positive_minutes:number;negative_minutes:number;balance_minutes:number;pending:number
}>(base:T,extraMinutes:number){
  return {
    ...base,
    worked_minutes:base.worked_minutes+extraMinutes,
    positive_minutes:base.positive_minutes+extraMinutes,
    balance_minutes:base.balance_minutes+extraMinutes,
    extra_minutes:extraMinutes,
  };
}
