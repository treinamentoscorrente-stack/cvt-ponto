import { db } from "@/lib/db";

export type ExtraWorkSession = {
  id:number;
  start_date:string;
  start_time:string;
  end_date:string;
  end_time:string;
  minutes:number;
  description:string|null;
  status:"APROVADO";
};

export async function extraSessionsForEmployee(employeeId:number, month?:string):Promise<ExtraWorkSession[]> {
  const params:any[]=[employeeId];
  let legacyFilter="employee_id=$1 AND ended_at IS NOT NULL";
  let requestFilter="employee_id=$1 AND status='APROVADO'";
  if(month){
    params.push(month);
    legacyFilter+=" AND to_char(started_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM')=$2";
    requestFilter+=" AND to_char(started_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM')=$2";
  }

  const [legacy,approved]=await Promise.all([
    db.query(
      `SELECT id,
        to_char(started_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS start_date,
        to_char(started_at AT TIME ZONE 'America/Sao_Paulo','HH24:MI:SS') AS start_time,
        to_char(ended_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS end_date,
        to_char(ended_at AT TIME ZONE 'America/Sao_Paulo','HH24:MI:SS') AS end_time,
        ROUND(EXTRACT(EPOCH FROM (ended_at-started_at))/60)::int AS minutes,
        description
       FROM extra_work_sessions
       WHERE ${legacyFilter}`,
      params,
    ),
    db.query(
      `SELECT id,
        to_char(started_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS start_date,
        to_char(started_at AT TIME ZONE 'America/Sao_Paulo','HH24:MI:SS') AS start_time,
        to_char(ended_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS end_date,
        to_char(ended_at AT TIME ZONE 'America/Sao_Paulo','HH24:MI:SS') AS end_time,
        ROUND(EXTRACT(EPOCH FROM (ended_at-started_at))/60)::int AS minutes,
        description
       FROM extra_work_requests
       WHERE ${requestFilter}`,
      params,
    ),
  ]);

  return [...legacy.rows,...approved.rows]
    .map((x:any)=>({
      id:Number(x.id),
      start_date:x.start_date,
      start_time:x.start_time,
      end_date:x.end_date,
      end_time:x.end_time,
      minutes:Number(x.minutes),
      description:x.description??null,
      status:"APROVADO" as const,
    }))
    .sort((a,b)=>(b.start_date+b.start_time).localeCompare(a.start_date+a.start_time));
}

export async function extraMinutesForEmployee(employeeId:number, month?:string){
  const sessions=await extraSessionsForEmployee(employeeId,month);
  return sessions.reduce((sum,s)=>sum+s.minutes,0);
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
