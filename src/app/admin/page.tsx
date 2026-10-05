"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminDashboard from "./AdminDashboard";
import type { AdjustmentRequest, AdminView, DashboardData, Employee, Holiday, Occurrence, ReportData } from "./types";
import { apiRequest, clearCsrf } from "@/lib/client-api";
import { formatCpfBR, formatDateBR, formatMinutes, formatMonthBR, todaySaoPaulo } from "@/lib/client-utils";

const NAV_ITEMS:Array<[AdminView,string]>=[
  ["dashboard","Dashboard"],
  ["employees","Funcionários"],
  ["occurrences","Ocorrências"],
  ["adjustments","Ajuste de ponto"],
  ["requests","Solicitações de ajuste"],
  ["holidays","Feriados"],
  ["report","Relatório mensal"],
];

const PUNCH_LABEL:Record<string,string>={ENTRADA:"E",INTERVALO_INICIO:"I.I.",INTERVALO_FIM:"F.I.",SAIDA:"S"};

function intervalText(row:any){
  if(row.intervalo_inicio&&row.intervalo_fim)return `${String(row.intervalo_inicio).slice(0,5)} – ${String(row.intervalo_fim).slice(0,5)}`;
  if(row.intervalo_inicio)return `${String(row.intervalo_inicio).slice(0,5)} – ?`;
  if(row.intervalo_fim)return `? – ${String(row.intervalo_fim).slice(0,5)}`;
  return "—";
}

function reportRowClass(row:any){
  if(Number(row.daily_balance_minutes)<0)return "balanceNegative";
  if(Number(row.daily_balance_minutes)>0)return "balancePositive";
  if(String(row.status||"").includes("CUMPRIDA"))return "balanceFulfilled";
  if(row.status==="FIM DE SEMANA")return "mutedDay";
  return "";
}

function occurrenceLabel(occurrence:Occurrence){
  if(occurrence.occurrence_type==="FALTA")return "Falta";
  if(occurrence.occurrence_type==="ATESTADO")return "Atestado";
  if(occurrence.period==="MANHA")return "Folga manhã";
  if(occurrence.period==="TARDE")return "Folga tarde";
  return "Folga integral";
}

function originalText(rows:AdjustmentRequest["original_punches"]|null|undefined){
  if(!rows?.length)return "Sem registros";
  return rows.map(row=>`${PUNCH_LABEL[row.punch_type]??row.punch_type} ${String(row.punch_time).slice(0,5)}`).join(" • ");
}

function requestedText(request:AdjustmentRequest){
  const parts=[
    request.requested_entrada&&`E ${String(request.requested_entrada).slice(0,5)}`,
    request.requested_intervalo_inicio&&`I.I. ${String(request.requested_intervalo_inicio).slice(0,5)}`,
    request.requested_intervalo_fim&&`F.I. ${String(request.requested_intervalo_fim).slice(0,5)}`,
    request.requested_saida&&`S ${String(request.requested_saida).slice(0,5)}`,
  ].filter(Boolean);
  return parts.length?parts.join(" • "):"Remover todas as batidas";
}

function csvCell(value:any){
  let text=String(value??"");
  if(/^[=+\-@]/.test(text))text="'"+text;
  return `"${text.replaceAll('"','""')}"`;
}

export default function Admin(){
  const router=useRouter();
  const [view,setView]=useState<AdminView>("dashboard");
  const [dashboard,setDashboard]=useState<DashboardData|null>(null);
  const [dashboardMonth,setDashboardMonth]=useState(()=>todaySaoPaulo().slice(0,7));
  const [employees,setEmployees]=useState<Employee[]>([]);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  const [report,setReport]=useState<ReportData|null>(null);
  const [reportEmployee,setReportEmployee]=useState("ALL");
  const [reportMonth,setReportMonth]=useState(()=>todaySaoPaulo().slice(0,7));
  const [downloadingPdf,setDownloadingPdf]=useState(false);
  const [downloadingTimecard,setDownloadingTimecard]=useState(false);

  const [passwordEmployee,setPasswordEmployee]=useState<Employee|null>(null);
  const [newPassword,setNewPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [savingEmployee,setSavingEmployee]=useState(false);
  const [editingEmployee,setEditingEmployee]=useState<Employee|null>(null);
  const [savingEmployeeEdit,setSavingEmployeeEdit]=useState(false);
  const [editEmployeeForm,setEditEmployeeForm]=useState({
    name:"",
    cpf:"",
    admission_date:"",
    status:"ATIVO" as "ATIVO"|"INATIVO",
    login:"",
  });

  const [occurrences,setOccurrences]=useState<Occurrence[]>([]);
  const [occurrenceType,setOccurrenceType]=useState<"FALTA"|"FOLGA"|"ATESTADO">("FALTA");
  const [occurrencePeriod,setOccurrencePeriod]=useState<"DIA_TODO"|"MANHA"|"TARDE">("DIA_TODO");
  const [holidays,setHolidays]=useState<Holiday[]>([]);
  const [adjustmentRequests,setAdjustmentRequests]=useState<AdjustmentRequest[]>([]);

  const [adjustEmployee,setAdjustEmployee]=useState("");
  const [adjustDate,setAdjustDate]=useState(todaySaoPaulo());
  const [adjustLoaded,setAdjustLoaded]=useState(false);
  const [adjustSummary,setAdjustSummary]=useState<any>(null);
  const [adjustTimes,setAdjustTimes]=useState({entrada:"",intervalo_inicio:"",intervalo_fim:"",saida:""});
  const [adjustReason,setAdjustReason]=useState("");

  const api=useCallback(
    (url:string,options:RequestInit={})=>apiRequest(url,options,()=>router.replace("/")),
    [router],
  );

  const loadBase=useCallback(async()=>{
    const dashboardUrl=`/api/admin/dashboard?month=${encodeURIComponent(dashboardMonth)}`;
    const [dashboardResult,employeesResult]=await Promise.allSettled([
      api(dashboardUrl),
      api("/api/admin/employees"),
    ]);

    if(dashboardResult.status==="fulfilled")setDashboard(dashboardResult.value as DashboardData);
    if(employeesResult.status==="fulfilled"){
      const nextEmployees=(employeesResult.value as any).employees||[];
      setEmployees(nextEmployees);
      if(!adjustEmployee&&nextEmployees[0])setAdjustEmployee(String(nextEmployees[0].id));
    }

    const errors=[dashboardResult,employeesResult]
      .filter((result):result is PromiseRejectedResult=>result.status==="rejected")
      .map(result=>result.reason instanceof Error?result.reason.message:"Erro ao carregar dados.");
    if(errors.length)setError(errors.join(" • "));
  },[api,adjustEmployee,dashboardMonth]);

  const loadOccurrences=useCallback(async()=>{
    try{
      const result:any=await api("/api/admin/occurrences");
      setOccurrences(result.occurrences||[]);
    }catch(e){setError(e instanceof Error?e.message:"Erro ao carregar ocorrências.");}
  },[api]);

  const loadHolidays=useCallback(async()=>{
    try{
      const result:any=await api("/api/admin/holidays");
      setHolidays(result.holidays||[]);
    }catch(e){setError(e instanceof Error?e.message:"Erro ao carregar feriados.");}
  },[api]);

  const loadAdjustmentRequests=useCallback(async()=>{
    try{
      const result:any=await api("/api/admin/adjustment-requests");
      setAdjustmentRequests(result.requests||[]);
    }catch(e){setError(e instanceof Error?e.message:"Erro ao carregar solicitações.");}
  },[api]);

  useEffect(()=>{void loadBase();},[loadBase]);
  useEffect(()=>{
    if(view==="occurrences")void loadOccurrences();
    if(view==="requests")void loadAdjustmentRequests();
    if(view==="holidays")void loadHolidays();
  },[view,loadOccurrences,loadAdjustmentRequests,loadHolidays]);

  async function logout(){
    await api("/api/auth/logout",{method:"POST",body:"{}"});
    clearCsrf();
    router.replace("/");
  }

  async function createEmployee(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(savingEmployee)return;
    setError("");setNotice("");setSavingEmployee(true);
    const form=event.currentTarget;
    const fields=new FormData(form);
    try{
      await api("/api/admin/employees",{method:"POST",body:JSON.stringify({
        name:fields.get("name"),
        cpf:fields.get("cpf"),
        admission_date:fields.get("admission"),
        status:fields.get("status"),
        login:fields.get("login"),
        password:fields.get("password"),
      })});
      form.reset();
      await loadBase();
      setNotice("Funcionário cadastrado com sucesso.");
    }catch(e){
      setError(e instanceof Error?e.message:"Erro");
      await loadBase();
    }finally{
      setSavingEmployee(false);
    }
  }

  function startEditEmployee(employee:Employee){
    setPasswordEmployee(null);
    setEditingEmployee(employee);
    setEditEmployeeForm({
      name:employee.name,
      cpf:employee.cpf,
      admission_date:String(employee.admission_date).slice(0,10),
      status:employee.status,
      login:employee.login,
    });
  }

  async function saveEmployeeEdit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!editingEmployee||savingEmployeeEdit)return;
    setError("");setNotice("");setSavingEmployeeEdit(true);
    try{
      await api(`/api/admin/employees/${editingEmployee.id}`,{method:"PATCH",body:JSON.stringify(editEmployeeForm)});
      await loadBase();
      setNotice(`Cadastro de ${editEmployeeForm.name} atualizado com sucesso.`);
      setEditingEmployee(null);
    }catch(e){setError(e instanceof Error?e.message:"Erro ao atualizar funcionário.");}
    finally{setSavingEmployeeEdit(false);}
  }

  async function toggleEmployee(employee:Employee){
    try{
      setError("");setNotice("");
      await api(`/api/admin/employees/${employee.id}/status`,{
        method:"PATCH",
        body:JSON.stringify({status:employee.status==="ATIVO"?"INATIVO":"ATIVO"}),
      });
      await loadBase();
    }catch(e){setError(e instanceof Error?e.message:"Erro");}
  }

  async function resetPassword(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!passwordEmployee)return;
    setError("");setNotice("");
    if(newPassword.length<8||newPassword.length>128){setError("A senha precisa ter entre 8 e 128 caracteres.");return;}
    if(newPassword!==confirmPassword){setError("As senhas não conferem.");return;}
    try{
      await api(`/api/admin/employees/${passwordEmployee.id}/password`,{method:"PATCH",body:JSON.stringify({password:newPassword})});
      setNotice(`Senha de ${passwordEmployee.name} redefinida com sucesso.`);
      setPasswordEmployee(null);setNewPassword("");setConfirmPassword("");
    }catch(e){setError(e instanceof Error?e.message:"Erro ao redefinir senha.");}
  }

  async function saveOccurrence(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    setError("");setNotice("");
    const form=event.currentTarget;
    const fields=new FormData(form);
    try{
      await api("/api/admin/occurrences",{method:"POST",body:JSON.stringify({
        employeeId:Number(fields.get("employeeId")),
        date:fields.get("date"),
        type:occurrenceType,
        period:occurrenceType==="FOLGA"?occurrencePeriod:"DIA_TODO",
        note:fields.get("note"),
      })});
      form.reset();
      setOccurrenceType("FALTA");setOccurrencePeriod("DIA_TODO");
      await Promise.all([loadOccurrences(),loadBase()]);
      setNotice("Ocorrência salva e saldo recalculado.");
    }catch(e){setError(e instanceof Error?e.message:"Erro ao salvar ocorrência.");}
  }

  async function removeOccurrence(id:number){
    try{
      setError("");setNotice("");
      await api("/api/admin/occurrences",{method:"DELETE",body:JSON.stringify({id})});
      await Promise.all([loadOccurrences(),loadBase()]);
      setNotice("Ocorrência removida.");
    }catch(e){setError(e instanceof Error?e.message:"Erro ao remover ocorrência.");}
  }

  async function reviewAdjustmentRequest(request:AdjustmentRequest,decision:"APROVADO"|"REJEITADO"){
    const action=decision==="APROVADO"?"aprovar":"rejeitar";
    if(!window.confirm(`Deseja ${action} o ajuste de ${request.employee_name} em ${formatDateBR(request.work_date)}?`))return;
    let reviewNote="";
    if(decision==="REJEITADO"){
      const typed=window.prompt("Motivo da rejeição (opcional):","");
      if(typed===null)return;
      reviewNote=typed.trim();
    }
    try{
      setError("");setNotice("");
      await api("/api/admin/adjustment-requests",{method:"PATCH",body:JSON.stringify({id:request.id,decision,review_note:reviewNote})});
      await Promise.all([loadAdjustmentRequests(),loadBase()]);
      setNotice(decision==="APROVADO"?"Ajuste aprovado e aplicado ao ponto.":"Solicitação rejeitada; o ponto foi mantido.");
    }catch(e){setError(e instanceof Error?e.message:"Erro ao analisar solicitação.");}
  }

  async function saveHoliday(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    setError("");setNotice("");
    const form=event.currentTarget;
    const fields=new FormData(form);
    try{
      await api("/api/admin/holidays",{method:"POST",body:JSON.stringify({date:fields.get("date"),description:fields.get("description")})});
      form.reset();
      await Promise.all([loadHolidays(),loadBase()]);
      setNotice("Feriado salvo.");
    }catch(e){setError(e instanceof Error?e.message:"Erro ao salvar feriado.");}
  }

  async function removeHoliday(id:number){
    try{
      setError("");setNotice("");
      await api("/api/admin/holidays",{method:"DELETE",body:JSON.stringify({id})});
      await Promise.all([loadHolidays(),loadBase()]);
      setNotice("Feriado removido.");
    }catch(e){setError(e instanceof Error?e.message:"Erro ao remover feriado.");}
  }

  async function loadAdjustment(){
    setError("");setNotice("");
    if(!adjustEmployee||!adjustDate){setError("Selecione funcionário e data.");return;}
    try{
      const result:any=await api(`/api/admin/punches?employeeId=${encodeURIComponent(adjustEmployee)}&date=${encodeURIComponent(adjustDate)}`);
      const summary=result.summary;
      setAdjustSummary(summary);
      setAdjustTimes({
        entrada:summary.entrada?String(summary.entrada).slice(0,5):"",
        intervalo_inicio:summary.intervalo_inicio?String(summary.intervalo_inicio).slice(0,5):"",
        intervalo_fim:summary.intervalo_fim?String(summary.intervalo_fim).slice(0,5):"",
        saida:summary.saida?String(summary.saida).slice(0,5):"",
      });
      setAdjustReason("");
      setAdjustLoaded(true);
    }catch(e){setError(e instanceof Error?e.message:"Erro ao carregar o dia.");}
  }

  async function saveAdjustment(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    setError("");setNotice("");
    try{
      const result:any=await api("/api/admin/punches",{method:"PUT",body:JSON.stringify({
        employeeId:Number(adjustEmployee),
        date:adjustDate,
        reason:adjustReason,
        ...adjustTimes,
      })});
      setAdjustSummary(result.summary);
      setAdjustReason("");
      await loadBase();
      setNotice("Ponto ajustado manualmente e registrado na auditoria.");
    }catch(e){setError(e instanceof Error?e.message:"Erro ao ajustar ponto.");}
  }

  async function generateReport(){
    try{
      setError("");
      setReport(await api(`/api/admin/report?employeeId=${encodeURIComponent(reportEmployee)}&month=${encodeURIComponent(reportMonth)}`) as ReportData);
    }catch(e){setError(e instanceof Error?e.message:"Erro");}
  }

  function exportCsv(){
    if(!report)return;
    const header=["Funcionário","CPF","Data","Dia","Entrada","Intervalo","Saída","Trabalhado","Banco +","Débito banco","Saldo do dia","Situação","Observação"];
    const lines=[header.map(csvCell).join(";")];
    for(const row of report.rows){
      lines.push([
        row.employee_name,
        formatCpfBR(row.employee_cpf),
        formatDateBR(row.date),
        row.weekday,
        row.entrada?String(row.entrada).slice(0,5):"",
        intervalText(row),
        row.saida?String(row.saida).slice(0,5):"",
        formatMinutes(row.worked_minutes),
        row.bank_credit_display??"",
        formatMinutes(row.bank_debit_minutes),
        formatMinutes(row.daily_balance_minutes,true),
        row.status,
        row.details??"",
      ].map(csvCell).join(";"));
    }
    const blob=new Blob(["\ufeff"+lines.join("\r\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;
    link.download=`espelho-ponto-cvt-${reportMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function downloadPdf(){
    if(!report||downloadingPdf)return;
    setDownloadingPdf(true);setError("");
    try{
      const {downloadMonthlyReportPdf}=await import("@/lib/report-pdf");
      downloadMonthlyReportPdf(report);
    }catch(e){setError(e instanceof Error?e.message:"Não foi possível gerar o PDF.");}
    finally{setDownloadingPdf(false);}
  }

  async function downloadTimecard(){
    if(reportEmployee==="ALL"||downloadingTimecard)return;
    setDownloadingTimecard(true);setError("");
    try{
      const fresh:any=await api(`/api/admin/report?employeeId=${encodeURIComponent(reportEmployee)}&month=${encodeURIComponent(reportMonth)}`);
      const {downloadTimecardPdf}=await import("@/lib/timecard-pdf");
      downloadTimecardPdf(fresh);
    }catch(e){setError(e instanceof Error?e.message:"Não foi possível gerar o cartão ponto.");}
    finally{setDownloadingTimecard(false);}
  }

  return <div className="appShell adminShell">
    <aside className="sidebar adminSidebar">
      <div className="sideBrand"><div className="brandMark small">CVT</div><div><strong>Controle de Ponto</strong><small>Área administrativa</small></div></div>
      <nav>{NAV_ITEMS.map(([key,label])=><button key={key} className={view===key?"active":""} onClick={()=>setView(key)}>{label}</button>)}</nav>
      <button className="logout" onClick={logout}>Sair</button>
    </aside>

    <main className="content adminContent">
      <header className="topbar adminTopbar"><div><p className="eyebrow">CVT</p><h1>Painel Administrativo</h1></div><span className="secureBadge">Sessão protegida</span></header>
      {error&&<div className="alert error" onClick={()=>setError("")}>{error}</div>}
      {notice&&<div className="alert" onClick={()=>setNotice("")}>{notice}</div>}

      {view==="dashboard"&&<AdminDashboard data={dashboard} month={dashboardMonth} onMonthChange={setDashboardMonth} />}

      {view==="employees"&&<>
        <div className="panel adminSectionPanel">
          <div className="sectionHead"><div><p className="eyebrow">CADASTRO</p><h2>Novo funcionário</h2></div><span className="badge">{employees.length}/3 cadastrados</span></div>
          <form className="formGrid" onSubmit={createEmployee}>
            <label>Nome<input name="name" required /></label>
            <label>CPF<input name="cpf" required /></label>
            <label>Data de admissão<input name="admission" type="date" required /></label>
            <label>Status<select name="status"><option>ATIVO</option><option>INATIVO</option></select></label>
            <label>Usuário<input name="login" minLength={3} maxLength={40} required /></label>
            <label>Senha<input name="password" type="password" minLength={8} maxLength={128} required /></label>
            <div className="formAction"><button className="primary" disabled={savingEmployee||employees.length>=3}>{savingEmployee?"SALVANDO...":employees.length>=3?"LIMITE DE 3 ATINGIDO":"CADASTRAR FUNCIONÁRIO"}</button></div>
          </form>
        </div>

        {editingEmployee&&<div className="panel adminEditPanel">
          <div className="sectionHead"><div><p className="eyebrow">EDIÇÃO DE CADASTRO</p><h2>{editingEmployee.name}</h2></div><button className="secondary" type="button" onClick={()=>setEditingEmployee(null)}>Cancelar</button></div>
          <form className="formGrid" onSubmit={saveEmployeeEdit}>
            <label>Nome<input value={editEmployeeForm.name} onChange={e=>setEditEmployeeForm(value=>({...value,name:e.target.value}))} required /></label>
            <label>CPF<input value={editEmployeeForm.cpf} onChange={e=>setEditEmployeeForm(value=>({...value,cpf:e.target.value}))} required /></label>
            <label>Data de admissão<input type="date" value={editEmployeeForm.admission_date} onChange={e=>setEditEmployeeForm(value=>({...value,admission_date:e.target.value}))} required /></label>
            <label>Status<select value={editEmployeeForm.status} onChange={e=>setEditEmployeeForm(value=>({...value,status:e.target.value as "ATIVO"|"INATIVO"}))}><option>ATIVO</option><option>INATIVO</option></select></label>
            <label>Usuário<input value={editEmployeeForm.login} onChange={e=>setEditEmployeeForm(value=>({...value,login:e.target.value}))} minLength={3} maxLength={40} required /></label>
            <div className="formAction"><button className="primary" disabled={savingEmployeeEdit}>{savingEmployeeEdit?"SALVANDO...":"SALVAR ALTERAÇÕES"}</button></div>
          </form>
          <p className="serverNote">A senha é gerenciada separadamente pela opção “Redefinir senha”.</p>
        </div>}

        <div className="panel tableWrap adminEmployeeTable">
          <div className="sectionHead"><div><p className="eyebrow">EQUIPE</p><h2>Funcionários cadastrados</h2></div></div>
          <table>
            <thead><tr><th>Nome</th><th>Usuário</th><th>CPF</th><th>Admissão</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>{employees.map(employee=><tr key={employee.id}>
              <td><strong>{employee.name}</strong></td><td>{employee.login}</td><td>{formatCpfBR(employee.cpf)}</td><td>{formatDateBR(employee.admission_date)}</td>
              <td><span className={employee.status==="ATIVO"?"statusPill active":"statusPill inactive"}>{employee.status}</span></td>
              <td><div className="reportActions adminRowActions"><button className="secondary" onClick={()=>startEditEmployee(employee)}>Editar</button><button className="secondary" onClick={()=>toggleEmployee(employee)}>{employee.status==="ATIVO"?"Inativar":"Ativar"}</button><button className="dark" onClick={()=>{setEditingEmployee(null);setPasswordEmployee(employee);setNewPassword("");setConfirmPassword("");}}>Redefinir senha</button></div></td>
            </tr>)}</tbody>
          </table>
        </div>

        {passwordEmployee&&<div className="panel adminPasswordPanel">
          <div className="sectionHead"><div><p className="eyebrow">SEGURANÇA</p><h2>Redefinir senha — {passwordEmployee.name}</h2></div><button className="secondary" type="button" onClick={()=>setPasswordEmployee(null)}>Cancelar</button></div>
          <form className="formGrid" onSubmit={resetPassword}>
            <label>Nova senha<input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} minLength={8} maxLength={128} autoComplete="new-password" required /></label>
            <label>Confirmar senha<input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} minLength={8} maxLength={128} autoComplete="new-password" required /></label>
            <div className="formAction"><button className="primary">SALVAR NOVA SENHA</button></div>
          </form>
        </div>}
      </>}

      {view==="occurrences"&&<>
        <div className="panel">
          <div className="sectionHead"><div><p className="eyebrow">JORNADA</p><h2>Falta, folga ou atestado</h2></div></div>
          <form className="formGrid" onSubmit={saveOccurrence}>
            <label>Funcionário<select name="employeeId" required>{employees.map(employee=><option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
            <label>Data<input name="date" type="date" required /></label>
            <label>Tipo<select value={occurrenceType} onChange={e=>{const value=e.target.value as typeof occurrenceType;setOccurrenceType(value);if(value!=="FOLGA")setOccurrencePeriod("DIA_TODO");}}><option value="FALTA">Falta — desconta 8h</option><option value="FOLGA">Folga — debita banco de horas</option><option value="ATESTADO">Atestado — não desconta</option></select></label>
            {occurrenceType==="FOLGA"&&<label>Período<select value={occurrencePeriod} onChange={e=>setOccurrencePeriod(e.target.value as typeof occurrencePeriod)}><option value="DIA_TODO">Dia todo — debita 8h do banco</option><option value="MANHA">Folga de manhã — debita 4h / trabalha à tarde</option><option value="TARDE">Folga à tarde — debita 4h / trabalha de manhã</option></select></label>}
            <label>Observação<input name="note" maxLength={240} placeholder="Opcional" /></label>
            <div className="formAction"><button className="primary">SALVAR OCORRÊNCIA</button></div>
          </form>
        </div>
        <div className="panel tableWrap"><table><thead><tr><th>Data</th><th>Funcionário</th><th>Ocorrência</th><th>Observação</th><th>Ação</th></tr></thead><tbody>{occurrences.map(occurrence=><tr key={occurrence.id}><td>{formatDateBR(occurrence.work_date)}</td><td>{occurrence.employee_name}</td><td>{occurrenceLabel(occurrence)}</td><td>{occurrence.note??"—"}</td><td><button className="secondary" onClick={()=>removeOccurrence(occurrence.id)}>Remover</button></td></tr>)}</tbody></table></div>
      </>}

      {view==="adjustments"&&<>
        <div className="panel">
          <div className="sectionHead"><div><p className="eyebrow">CORREÇÃO ADMINISTRATIVA</p><h2>Ajuste manual do ponto</h2></div></div>
          <div className="reportTools">
            <label>Funcionário<select value={adjustEmployee} onChange={e=>{setAdjustEmployee(e.target.value);setAdjustLoaded(false);}}>{employees.map(employee=><option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
            <label>Data<input type="date" value={adjustDate} onChange={e=>{setAdjustDate(e.target.value);setAdjustLoaded(false);}} /></label>
            <div className="reportActions"><button className="primary" type="button" onClick={loadAdjustment}>CARREGAR DIA</button></div>
          </div>
        </div>
        {adjustLoaded&&<div className="panel">
          <div className="sectionHead"><div><p className="eyebrow">REGISTROS DO DIA</p><h2>{adjustSummary?.status??"SEM REGISTRO"}</h2></div><span className="badge">Previsto: {formatMinutes(adjustSummary?.expected_minutes)}</span></div>
          <form className="formGrid" onSubmit={saveAdjustment}>
            <label>Entrada<input type="time" value={adjustTimes.entrada} onChange={e=>setAdjustTimes(value=>({...value,entrada:e.target.value}))} /></label>
            <label>Início intervalo<input type="time" value={adjustTimes.intervalo_inicio} onChange={e=>setAdjustTimes(value=>({...value,intervalo_inicio:e.target.value}))} /></label>
            <label>Fim intervalo<input type="time" value={adjustTimes.intervalo_fim} onChange={e=>setAdjustTimes(value=>({...value,intervalo_fim:e.target.value}))} /></label>
            <label>Saída<input type="time" value={adjustTimes.saida} onChange={e=>setAdjustTimes(value=>({...value,saida:e.target.value}))} /></label>
            <label>Motivo do ajuste<input value={adjustReason} onChange={e=>setAdjustReason(e.target.value)} minLength={3} maxLength={240} placeholder="Ex.: esquecimento de batida" required /></label>
            <div className="formAction"><button className="primary">SALVAR AJUSTE</button></div>
          </form>
          <p className="serverNote">Campos vazios removem aquela batida. Todo ajuste registra antes, depois e motivo na auditoria.</p>
        </div>}
      </>}

      {view==="requests"&&<>
        <div className="panel"><div className="sectionHead"><div><p className="eyebrow">APROVAÇÃO</p><h2>Solicitações de ajuste dos funcionários</h2></div><span className="badge">{adjustmentRequests.filter(request=>request.status==="PENDENTE").length} pendente(s)</span></div><p className="serverNote">O ponto só é alterado quando a solicitação é aprovada. Rejeições mantêm os registros originais.</p></div>
        <div className="panel tableWrap"><table><thead><tr><th>Data</th><th>Funcionário</th><th>Ponto original</th><th>Solicitado</th><th>Motivo</th><th>Status</th><th>Ações</th></tr></thead><tbody>{adjustmentRequests.length?adjustmentRequests.map(request=><tr key={request.id}><td>{formatDateBR(request.work_date)}</td><td>{request.employee_name}</td><td>{originalText(request.original_punches)}</td><td>{requestedText(request)}</td><td>{request.reason}</td><td>{request.status}{request.review_note?` — ${request.review_note}`:""}</td><td>{request.status==="PENDENTE"?<div className="reportActions"><button className="primary" onClick={()=>reviewAdjustmentRequest(request,"APROVADO")}>Aprovar</button><button className="secondary" onClick={()=>reviewAdjustmentRequest(request,"REJEITADO")}>Rejeitar</button></div>:"—"}</td></tr>):<tr><td colSpan={7}>Nenhuma solicitação encontrada.</td></tr>}</tbody></table></div>
      </>}

      {view==="holidays"&&<>
        <div className="panel"><div className="sectionHead"><div><p className="eyebrow">CALENDÁRIO</p><h2>Cadastrar feriado</h2></div></div><form className="formGrid" onSubmit={saveHoliday}><label>Data<input name="date" type="date" required /></label><label>Descrição<input name="description" minLength={2} maxLength={120} placeholder="Ex.: Natal" required /></label><div className="formAction"><button className="primary">SALVAR FERIADO</button></div></form></div>
        <div className="panel tableWrap"><table><thead><tr><th>Data</th><th>Feriado</th><th>Ação</th></tr></thead><tbody>{holidays.map(holiday=><tr key={holiday.id}><td>{formatDateBR(holiday.holiday_date)}</td><td>{holiday.description}</td><td><button className="secondary" onClick={()=>removeHoliday(holiday.id)}>Remover</button></td></tr>)}</tbody></table></div>
      </>}

      {view==="report"&&<>
        <div className="panel noPrint">
          <p className="eyebrow">CONFERÊNCIA MENSAL</p><h2>Espelho mensal de ponto</h2>
          <p className="serverNote">O relatório mensal continua analítico. O Cartão Ponto PDF é um documento separado, compacto e com somente os dias efetivamente trabalhados.</p>
          <div className="reportTools">
            <label>Funcionário<select value={reportEmployee} onChange={e=>setReportEmployee(e.target.value)}><option value="ALL">Todos os funcionários</option>{employees.map(employee=><option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
            <label>Mês<input type="month" value={reportMonth} onChange={e=>setReportMonth(e.target.value)} /></label>
            <div className="reportActions"><button className="primary" onClick={generateReport}>GERAR</button><button className="secondary" onClick={exportCsv} disabled={!report}>EXCEL / CSV</button><button className="dark" onClick={downloadPdf} disabled={!report||downloadingPdf}>{downloadingPdf?"GERANDO...":"BAIXAR RELATÓRIO PDF"}</button><button className="secondary" onClick={downloadTimecard} disabled={reportEmployee==="ALL"||downloadingTimecard}>{downloadingTimecard?"GERANDO CARTÃO...":"BAIXAR CARTÃO PONTO"}</button></div>
          </div>
          {reportEmployee==="ALL"&&<p className="serverNote">Para baixar o Cartão Ponto em uma única folha, selecione um funcionário específico.</p>}
        </div>

        <div className="reportPrintRoot">{report?.employee_reports?.map(employeeReport=><section className="employeePrintSheet" key={employeeReport.employee_id}>
          <header className="printReportHeader"><div className="printBrand"><div className="brandMark printLogo">CVT</div><div><strong>Corrente da Vida Treinamentos</strong><span>Espelho Mensal de Ponto</span></div></div><div className="printPeriod"><span>Competência</span><strong>{formatMonthBR(report.month)}</strong></div></header>
          <div className="employeeIdentity"><div><span>Funcionário</span><strong>{employeeReport.employee_name}</strong></div><div><span>CPF</span><strong>{formatCpfBR(employeeReport.employee_cpf)}</strong></div><div><span>Admissão</span><strong>{formatDateBR(employeeReport.admission_date)}</strong></div></div>
          <div className="printTotals">{[["Trabalhadas",formatMinutes(employeeReport.totals.worked_minutes)],["Positivas",formatMinutes(employeeReport.totals.positive_minutes)],["Negativas",formatMinutes(employeeReport.totals.negative_minutes)],["Saldo do mês",formatMinutes(employeeReport.totals.balance_minutes,true)]].map(([label,value])=><div key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}</div>
          <div className="tableWrap printTableWrap"><table className="monthlyPunchTable"><thead><tr><th>Data</th><th>Dia</th><th>Entrada</th><th>Intervalo</th><th>Saída</th><th>Trabalhado</th><th>Banco +</th><th>Débito</th><th>Saldo dia</th><th>Situação / observação</th></tr></thead><tbody>{employeeReport.rows.map((row:any)=><tr key={row.date} className={reportRowClass(row)}><td>{formatDateBR(row.date)}</td><td>{row.weekday}</td><td>{row.entrada?String(row.entrada).slice(0,5):"—"}</td><td>{intervalText(row)}</td><td>{row.saida?String(row.saida).slice(0,5):"—"}</td><td>{formatMinutes(row.worked_minutes)}</td><td className="creditCell">{row.bank_credit_minutes?<><strong>+{formatMinutes(row.bank_credit_minutes)}</strong><span>{row.bank_credit_display}</span></>:"—"}</td><td>{row.bank_debit_minutes?formatMinutes(row.bank_debit_minutes):"—"}</td><td>{formatMinutes(row.daily_balance_minutes,true)}</td><td className="statusCell"><strong>{row.status}</strong>{row.details&&<span>{row.details}</span>}</td></tr>)}</tbody></table></div>
          <div className="employeeSignature"><p>Declaro que conferi os registros de jornada e os saldos apresentados neste relatório mensal.</p><div className="signatureLine"></div><strong>{employeeReport.employee_name}</strong><span>Assinatura do funcionário</span></div>
          <footer className="printReportFooter"><span>Corrente da Vida Treinamentos — CVT</span><span>Documento para conferência mensal do funcionário</span></footer>
        </section>)}</div>
      </>}
    </main>
  </div>;
}
