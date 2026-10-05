"use client";

import type { DashboardData, Totals } from "./types";
import { formatMinutes, todaySaoPaulo } from "@/lib/client-utils";

const emptyTotals:Totals={worked_minutes:0,positive_minutes:0,negative_minutes:0,balance_minutes:0,pending:0};

export default function AdminDashboard({
  data,
  month,
  onMonthChange,
}:{
  data:DashboardData|null;
  month:string;
  onMonthChange:(value:string)=>void;
}){
  const totals=data?.totals??emptyTotals;

  return <>
    <div className="metrics">
      {[
        ["Funcionários",data?.total??0],
        ["Ativos",data?.active??0],
        ["Horas trabalhadas — geral",formatMinutes(totals.worked_minutes)],
        ["Horas positivas — geral",formatMinutes(totals.positive_minutes)],
        ["Horas negativas — geral",formatMinutes(totals.negative_minutes)],
        ["Banco atual",formatMinutes(totals.balance_minutes,true)],
      ].map(([label,value])=><article className="metric" key={String(label)}><span>{label}</span><strong>{value}</strong></article>)}
    </div>

    <div className="panel tableWrap adminDashboardGeneral">
      <div className="sectionHead"><div><p className="eyebrow">BANCO ATUAL</p><h2>Acumulado geral por funcionário</h2></div><span className="badge">Todo o período</span></div>
      <table>
        <thead><tr><th>Funcionário</th><th>Usuário</th><th>Trabalhado geral</th><th>Positivas geral</th><th>Negativas geral</th><th>Banco atual</th><th>Status hoje</th></tr></thead>
        <tbody>{data?.employees.map(employee=><tr key={employee.id}>
          <td><strong>{employee.name}</strong></td>
          <td>{employee.login}</td>
          <td>{formatMinutes(employee.totals.worked_minutes)}</td>
          <td className="bankPositive">{formatMinutes(employee.totals.positive_minutes)}</td>
          <td className="bankNegative">{formatMinutes(employee.totals.negative_minutes)}</td>
          <td className={employee.totals.balance_minutes>=0?"bankBalance positive":"bankBalance negative"}>{formatMinutes(employee.totals.balance_minutes,true)}</td>
          <td>{employee.today_status}</td>
        </tr>)}</tbody>
      </table>
    </div>

    <div className="panel adminDashboardMonth">
      <div className="sectionHead dashboardMonthHead">
        <div><p className="eyebrow">VISÃO POR MÊS</p><h2>Banco de horas mensal</h2><p className="dashboardHelper">Selecione o mês para consultar trabalhado, horas positivas, negativas e saldo de cada funcionário.</p></div>
        <label className="dashboardMonthFilter">Mês<input type="month" value={month} max={todaySaoPaulo().slice(0,7)} onChange={event=>onMonthChange(event.target.value)} /></label>
      </div>
      <div className="tableWrap dashboardMonthTable">
        <table>
          <thead><tr><th>Funcionário</th><th>Trabalhado geral</th><th>Positivas geral</th><th>Negativas geral</th><th>Banco atual</th></tr></thead>
          <tbody>{data?.monthly_employees?.map(employee=><tr key={employee.id}>
            <td><strong>{employee.name}</strong></td>
            <td>{formatMinutes(employee.totals.worked_minutes)}</td>
            <td className="bankPositive">{formatMinutes(employee.totals.positive_minutes)}</td>
            <td className="bankNegative">{formatMinutes(employee.totals.negative_minutes)}</td>
            <td className={employee.totals.balance_minutes>=0?"bankBalance positive":"bankBalance negative"}>{formatMinutes(employee.totals.balance_minutes,true)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
  </>;
}
