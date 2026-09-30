import { db } from "@/lib/db";
import { saoPauloNow, weekend, timeMinutes } from "@/lib/time";
export const TYPES = ["ENTRADA","INTERVALO_INICIO","INTERVALO_FIM","SAIDA"] as const;
export type PunchType = typeof TYPES[number];
export type DaySummary = { date:string; entrada:string|null; intervalo_inicio:string|null; intervalo_fim:string|null; saida:string|null; worked_minutes:number|null; expected_minutes:number|null; balance_minutes:number|null; status:string; punch_count:number };

export async function dailyExpected(date:string) {
  if (weekend(date)) return 0;
  const holiday = await db.query(`SELECT 1 FROM holidays WHERE holiday_date=$1`, [date]);
  if (holiday.rowCount) return 0;
  const company = await db.query(`SELECT daily_minutes FROM company WHERE id=1`);
  return Number(company.rows[0]?.daily_minutes ?? 480);
}
export async function summarizeRows(date:string, rows:Array<{punch_type:string;punch_time:string}>):Promise<DaySummary> {
  const by = Object.fromEntries(rows.map(r=>[r.punch_type,String(r.punch_time).slice(0,8)]));
  let worked:number|null=null, balance:number|null=null, status="SEM REGISTRO";
  if (rows.length > 0 && rows.length < 4) status = date === saoPauloNow().date ? "EM ANDAMENTO" : "JORNADA INCOMPLETA";
  if (rows.length === 4) {
    worked=(timeMinutes(by.INTERVALO_INICIO)-timeMinutes(by.ENTRADA))+(timeMinutes(by.SAIDA)-timeMinutes(by.INTERVALO_FIM));
    const expected=await dailyExpected(date); balance=worked-expected; status=balance>0?"POSITIVO":balance<0?"NEGATIVO":"CUMPRIDA";
  }
  return { date, entrada:by.ENTRADA??null, intervalo_inicio:by.INTERVALO_INICIO??null, intervalo_fim:by.INTERVALO_FIM??null, saida:by.SAIDA??null, worked_minutes:worked, expected_minutes:worked===null?null:await dailyExpected(date), balance_minutes:balance, status, punch_count:rows.length };
}
export async function summariesForEmployee(employeeId:number, month?:string) {
  const values:any[]=[employeeId]; let filter="employee_id=$1";
  if (month) { values.push(`${month}-%`); filter += ` AND work_date::text LIKE $2`; }
  const result=await db.query(`SELECT work_date::text AS work_date,punch_time::text AS punch_time,punch_type FROM punches WHERE ${filter} ORDER BY work_date DESC,punch_time ASC`, values);
  const grouped=new Map<string,Array<{punch_type:string;punch_time:string}>>();
  for (const r of result.rows) { const a=grouped.get(r.work_date)??[]; a.push(r); grouped.set(r.work_date,a); }
  const out:DaySummary[]=[]; for (const [date,rows] of grouped) out.push(await summarizeRows(date,rows)); return out;
}
export function aggregate(items:DaySummary[]) { let worked=0,positive=0,negative=0,pending=0; for (const s of items) { worked+=s.worked_minutes??0; if((s.balance_minutes??0)>0) positive+=s.balance_minutes!; if((s.balance_minutes??0)<0) negative+=Math.abs(s.balance_minutes!); if(s.status==="JORNADA INCOMPLETA") pending++; } return { worked_minutes:worked, positive_minutes:positive, negative_minutes:negative, balance_minutes:positive-negative, pending }; }
