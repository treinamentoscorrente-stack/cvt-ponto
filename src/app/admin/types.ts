export type Employee = {
  id:number;
  name:string;
  cpf:string;
  admission_date:string;
  status:"ATIVO"|"INATIVO";
  login:string;
};

export type Totals = {
  worked_minutes:number;
  positive_minutes:number;
  negative_minutes:number;
  balance_minutes:number;
  pending:number;
};

export type DashboardEmployee = {
  id:number;
  name:string;
  login:string;
  status:string;
  totals:Totals;
  today_status?:string;
};

export type DashboardData = {
  total:number;
  active:number;
  inactive:number;
  totals:Totals;
  employees:DashboardEmployee[];
  month:string;
  monthly_employees:DashboardEmployee[];
};

export type EmployeeReport = {
  employee_id:number;
  employee_name:string;
  employee_cpf:string;
  admission_date:string;
  totals:Totals;
  rows:Array<any>;
};

export type ReportData = {
  month:string;
  employee_label:string;
  totals:Totals;
  rows:Array<any>;
  employee_reports:Array<EmployeeReport>;
};

export type Occurrence = {
  id:number;
  employee_id:number;
  employee_name:string;
  work_date:string;
  occurrence_type:"FALTA"|"FOLGA"|"ATESTADO";
  period:"DIA_TODO"|"MANHA"|"TARDE";
  note:string|null;
};

export type Holiday = {
  id:number;
  holiday_date:string;
  description:string;
};

export type AdjustmentRequest = {
  id:number;
  employee_id:number;
  employee_name:string;
  work_date:string;
  requested_entrada:string|null;
  requested_intervalo_inicio:string|null;
  requested_intervalo_fim:string|null;
  requested_saida:string|null;
  reason:string;
  original_punches:Array<{punch_type:string;punch_time:string}>;
  status:"PENDENTE"|"APROVADO"|"REJEITADO";
  review_note:string|null;
  created_at:string;
  reviewed_at:string|null;
};

export type AdminView = "dashboard"|"employees"|"occurrences"|"adjustments"|"requests"|"holidays"|"report";
