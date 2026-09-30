"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Emp = { id:number; name:string; cpf:string; admission_date:string; status:"ATIVO"|"INATIVO"; login:string };
type Totals = { worked_minutes:number; positive_minutes:number; negative_minutes:number; balance_minutes:number; pending:number; extra_minutes:number };
type Dash = { total:number; active:number; inactive:number; totals:Totals; employees:Array<{id:number;name:string;login:string;status:string;totals:Totals;today_status:string}> };
type EmployeeReport = { employee_id:number; employee_name:string; employee_cpf:string; admission_date:string; totals:Totals; rows:Array<any> };
type Report = { month:string; employee_label:string; totals:Totals; rows:Array<any>; extra_rows:Array<any>; employee_reports:Array<EmployeeReport> };
type Occurrence = { id:number; employee_id:number; employee_name:string; work_date:string; occurrence_type:"FALTA"|"FOLGA"|"ATESTADO"; period:"DIA_TODO"|"MANHA"|"TARDE"; note:string|null };
type Holiday = { id:number; holiday_date:string; description:string };
type AdjustmentRequest = { id:number; employee_id:number; employee_name:string; work_date:string; requested_entrada:string|null; requested_intervalo_inicio:string|null; requested_intervalo_fim:string|null; requested_saida:string|null; reason:string; original_punches:Array<{punch_type:string;punch_time:string}>; status:"PENDENTE"|"APROVADO"|"REJEITADO"; review_note:string|null; created_at:string; reviewed_at:string|null };
type ExtraWorkRequest = { id:number; employee_id:number; employee_name:string; start_date:string; start_time:string; end_date:string; end_time:string; minutes:number; description:string; status:"PENDENTE"|"APROVADO"|"REJEITADO"; review_note:string|null; created_at:string; reviewed_at:string|null };
type View = "dashboard"|"employees"|"occurrences"|"adjustments"|"requests"|"extraRequests"|"holidays"|"report";

const emptyTotals:Totals = {worked_minutes:0,positive_minutes:0,negative_minutes:0,balance_minutes:0,pending:0,extra_minutes:0};
const fmt=(n:number|null|undefined,s=false)=>{
  if(n==null)return "—";
  const sign=n<0?"-":s&&n>0?"+":"";
  const a=Math.abs(n);
  return `${sign}${String(Math.floor(a/60)).padStart(2,"0")}h${String(a%60).padStart(2,"0")}`;
};
const todaySP=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const formatDate=(value:string|null|undefined)=>{
  if(!value)return "—";
  const raw=String(value).slice(0,10);
  const match=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match?`${match[3]}/${match[2]}/${match[1]}`:value;
};
const formatMonth=(value:string|null|undefined)=>{
  if(!value)return "Selecione um período";
  const match=String(value).match(/^(\d{4})-(\d{2})$/);
  return match?`${match[2]}/${match[1]}`:value;
};
const formatCpf=(value:string|null|undefined)=>{
  const digits=String(value??"").replace(/\D/g,"");
  if(digits.length!==11)return value||"—";
  return `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9)}`;
};
const intervalText=(r:any)=>{
  if(r.intervalo_inicio&&r.intervalo_fim)return `${String(r.intervalo_inicio).slice(0,5)} – ${String(r.intervalo_fim).slice(0,5)}`;
  if(r.intervalo_inicio)return `${String(r.intervalo_inicio).slice(0,5)} – ?`;
  if(r.intervalo_fim)return `? – ${String(r.intervalo_fim).slice(0,5)}`;
  return "—";
};
const reportRowClass=(r:any)=>{
  if(Number(r.daily_balance_minutes)<0)return "balanceNegative";
  if(Number(r.daily_balance_minutes)>0)return "balancePositive";
  if(String(r.status||"").includes("CUMPRIDA"))return "balanceFulfilled";
  if(r.status==="FIM DE SEMANA")return "mutedDay";
  return "";
};
const extraEnd=(x:any)=>!x.end_time?"Em andamento":x.end_date&&x.end_date!==x.start_date?`${String(x.end_time).slice(0,5)} (${formatDate(x.end_date)})`:String(x.end_time).slice(0,5);
const occurrenceLabel=(o:Occurrence)=>{
  if(o.occurrence_type==="FALTA")return "Falta";
  if(o.occurrence_type==="ATESTADO")return "Atestado";
  if(o.period==="MANHA")return "Folga manhã";
  if(o.period==="TARDE")return "Folga tarde";
  return "Folga integral";
};
const punchLabel:Record<string,string>={ENTRADA:"E",INTERVALO_INICIO:"I.I.",INTERVALO_FIM:"F.I.",SAIDA:"S"};
const originalText=(rows:Array<{punch_type:string;punch_time:string}>|null|undefined)=>{
  if(!rows?.length)return "Sem registros";
  return rows.map(r=>`${punchLabel[r.punch_type]??r.punch_type} ${String(r.punch_time).slice(0,5)}`).join(" • ");
};
const requestedText=(r:AdjustmentRequest)=>{
  const parts=[
    r.requested_entrada&&`E ${String(r.requested_entrada).slice(0,5)}`,
    r.requested_intervalo_inicio&&`I.I. ${String(r.requested_intervalo_inicio).slice(0,5)}`,
    r.requested_intervalo_fim&&`F.I. ${String(r.requested_intervalo_fim).slice(0,5)}`,
    r.requested_saida&&`S ${String(r.requested_saida).slice(0,5)}`,
  ].filter(Boolean);
  return parts.length?parts.join(" • "):"Remover todas as batidas";
};

export default function Admin(){
  const router=useRouter();
  const [view,setView]=useState<View>("dashboard");
  const [dash,setDash]=useState<Dash|null>(null);
  const [employees,setEmployees]=useState<Emp[]>([]);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [report,setReport]=useState<Report|null>(null);
  const [downloadingPdf,setDownloadingPdf]=useState(false);
  const [reportEmp,setReportEmp]=useState("ALL");
  const [month,setMonth]=useState(()=>todaySP().slice(0,7));
  const [passwordEmp,setPasswordEmp]=useState<Emp|null>(null);
  const [newPassword,setNewPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [savingEmployee,setSavingEmployee]=useState(false);

  const [occurrences,setOccurrences]=useState<Occurrence[]>([]);
  const [occType,setOccType]=useState<"FALTA"|"FOLGA"|"ATESTADO">("FALTA");
  const [occPeriod,setOccPeriod]=useState<"DIA_TODO"|"MANHA"|"TARDE">("DIA_TODO");

  const [holidays,setHolidays]=useState<Holiday[]>([]);
  const [adjustmentRequests,setAdjustmentRequests]=useState<AdjustmentRequest[]>([]);
  const [extraWorkRequests,setExtraWorkRequests]=useState<ExtraWorkRequest[]>([]);

  const [adjustEmployee,setAdjustEmployee]=useState("");
  const [adjustDate,setAdjustDate]=useState(todaySP());
  const [adjustLoaded,setAdjustLoaded]=useState(false);
  const [adjustSummary,setAdjustSummary]=useState<any>(null);
  const [adjustTimes,setAdjustTimes]=useState({entrada:"",intervalo_inicio:"",intervalo_fim:"",saida:""});
  const [adjustReason,setAdjustReason]=useState("");

  const csrf=()=>sessionStorage.getItem("cvt_csrf")||"";
  const api=useCallback(async(url:string,opt:RequestInit={})=>{
    const h=new Headers(opt.headers);
    if(opt.body)h.set("content-type","application/json");
    if(opt.method&&opt.method!=="GET")h.set("x-csrf-token",csrf());
    const r=await fetch(url,{...opt,headers:h});
    if(r.status===401){router.replace("/");throw new Error("Sessão expirada.");}
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||"Erro");
    return d;
  },[router]);

  const loadBase=useCallback(async()=>{
    const [d,e]=await Promise.allSettled([api("/api/admin/dashboard"),api("/api/admin/employees")]);
    if(d.status==="fulfilled")setDash(d.value);
    if(e.status==="fulfilled"){
      setEmployees(e.value.employees);
      if(!adjustEmployee&&e.value.employees[0])setAdjustEmployee(String(e.value.employees[0].id));
    }
    const errors=[d,e].filter((x):x is PromiseRejectedResult=>x.status==="rejected")
      .map(x=>x.reason instanceof Error?x.reason.message:"Erro ao carregar dados.");
    if(errors.length)setError(errors.join(" • "));
  },[api,adjustEmployee]);

  const loadOccurrences=useCallback(async()=>{
    try{const d=await api("/api/admin/occurrences");setOccurrences(d.occurrences);}
    catch(e){setError(e instanceof Error?e.message:"Erro ao carregar ocorrências.");}
  },[api]);

  const loadHolidays=useCallback(async()=>{
    try{const d=await api("/api/admin/holidays");setHolidays(d.holidays);}
    catch(e){setError(e instanceof Error?e.message:"Erro ao carregar feriados.");}
  },[api]);

  const loadAdjustmentRequests=useCallback(async()=>{
    try{const d=await api("/api/admin/adjustment-requests");setAdjustmentRequests(d.requests||[]);}
    catch(e){setError(e instanceof Error?e.message:"Erro ao carregar solicitações.");}
  },[api]);

  const loadExtraWorkRequests=useCallback(async()=>{
    try{const d=await api("/api/admin/extra-work-requests");setExtraWorkRequests(d.requests||[]);}
    catch(e){setError(e instanceof Error?e.message:"Erro ao carregar jornadas extras.");}
  },[api]);

  useEffect(()=>{void loadBase();},[loadBase]);
  useEffect(()=>{
    if(view==="occurrences")void loadOccurrences();
    if(view==="requests")void loadAdjustmentRequests();
    if(view==="extraRequests")void loadExtraWorkRequests();
    if(view==="holidays")void loadHolidays();
  },[view,loadOccurrences,loadAdjustmentRequests,loadExtraWorkRequests,loadHolidays]);

  async function logout(){
    await api("/api/auth/logout",{method:"POST",body:"{}"});
    sessionStorage.removeItem("cvt_csrf");
    router.replace("/");
  }

  async function createEmployee(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(savingEmployee)return;
    setError("");setNotice("");setSavingEmployee(true);
    const form=e.currentTarget;
    const f=new FormData(form);
    try{
      await api("/api/admin/employees",{method:"POST",body:JSON.stringify({
        name:f.get("name"),cpf:f.get("cpf"),admission_date:f.get("admission"),
        status:f.get("status"),login:f.get("login"),password:f.get("password")
      })});
      form.reset();
      await loadBase();
      setNotice("Funcionário cadastrado com sucesso.");
    }catch(err){
      setError(err instanceof Error?err.message:"Erro");
      await loadBase();
    }finally{setSavingEmployee(false);}
  }

  async function toggle(emp:Emp){
    try{
      setNotice("");
      await api(`/api/admin/employees/${emp.id}/status`,{method:"PATCH",body:JSON.stringify({status:emp.status==="ATIVO"?"INATIVO":"ATIVO"})});
      await loadBase();
    }catch(e){setError(e instanceof Error?e.message:"Erro");}
  }

  async function resetPassword(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(!passwordEmp)return;
    setError("");setNotice("");
    if(newPassword.length<8||newPassword.length>128){setError("A senha precisa ter entre 8 e 128 caracteres.");return;}
    if(newPassword!==confirmPassword){setError("As senhas não conferem.");return;}
    try{
      await api(`/api/admin/employees/${passwordEmp.id}/password`,{method:"PATCH",body:JSON.stringify({password:newPassword})});
      setNotice(`Senha de ${passwordEmp.name} redefinida com sucesso.`);
      setPasswordEmp(null);setNewPassword("");setConfirmPassword("");
    }catch(e){setError(e instanceof Error?e.message:"Erro ao redefinir senha.");}
  }

  async function saveOccurrence(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError("");setNotice("");
    const form=e.currentTarget;
    const f=new FormData(form);
    try{
      await api("/api/admin/occurrences",{method:"POST",body:JSON.stringify({
        employeeId:Number(f.get("employeeId")),date:f.get("date"),type:occType,
        period:occType==="FOLGA"?occPeriod:"DIA_TODO",note:f.get("note")
      })});
      form.reset();setOccType("FALTA");setOccPeriod("DIA_TODO");
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

  async function reviewAdjustmentRequest(req:AdjustmentRequest,decision:"APROVADO"|"REJEITADO"){
    const action=decision==="APROVADO"?"aprovar":"rejeitar";
    if(!window.confirm(`Deseja ${action} o ajuste de ${req.employee_name} em ${formatDate(req.work_date)}?`))return;
    let reviewNote="";
    if(decision==="REJEITADO"){
      const typed=window.prompt("Motivo da rejeição (opcional):","");
      if(typed===null)return;
      reviewNote=typed.trim();
    }
    try{
      setError("");setNotice("");
      await api("/api/admin/adjustment-requests",{method:"PATCH",body:JSON.stringify({id:req.id,decision,review_note:reviewNote})});
      await Promise.all([loadAdjustmentRequests(),loadBase()]);
      setNotice(decision==="APROVADO"?"Ajuste aprovado e aplicado ao ponto.":"Solicitação rejeitada; o ponto foi mantido.");
    }catch(e){setError(e instanceof Error?e.message:"Erro ao analisar solicitação.");}
  }

  async function reviewExtraWork(req:ExtraWorkRequest,decision:"APROVADO"|"REJEITADO"){
    const action=decision==="APROVADO"?"aprovar":"rejeitar";
    if(!window.confirm(`Deseja ${action} a jornada extra de ${fmt(req.minutes)} de ${req.employee_name}?`))return;
    let reviewNote="";
    if(decision==="REJEITADO"){
      const typed=window.prompt("Motivo da rejeição (opcional):","");
      if(typed===null)return;
      reviewNote=typed.trim();
    }
    try{
      setError("");setNotice("");
      await api("/api/admin/extra-work-requests",{method:"PATCH",body:JSON.stringify({id:req.id,decision,review_note:reviewNote})});
      await Promise.all([loadExtraWorkRequests(),loadBase()]);
      setNotice(decision==="APROVADO"?"Jornada extra aprovada e adicionada como saldo positivo no banco.":"Solicitação de jornada extra rejeitada.");
    }catch(e){setError(e instanceof Error?e.message:"Erro ao analisar jornada extra.");}
  }

  async function saveHoliday(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError("");setNotice("");
    const form=e.currentTarget;
    const f=new FormData(form);
    try{
      await api("/api/admin/holidays",{method:"POST",body:JSON.stringify({date:f.get("date"),description:f.get("description")})});
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
      const d=await api(`/api/admin/punches?employeeId=${encodeURIComponent(adjustEmployee)}&date=${encodeURIComponent(adjustDate)}`);
      const s=d.summary;
      setAdjustSummary(s);
      setAdjustTimes({
        entrada:s.entrada?String(s.entrada).slice(0,5):"",
        intervalo_inicio:s.intervalo_inicio?String(s.intervalo_inicio).slice(0,5):"",
        intervalo_fim:s.intervalo_fim?String(s.intervalo_fim).slice(0,5):"",
        saida:s.saida?String(s.saida).slice(0,5):"",
      });
      setAdjustReason("");
      setAdjustLoaded(true);
    }catch(e){setError(e instanceof Error?e.message:"Erro ao carregar o dia.");}
  }

  async function saveAdjustment(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError("");setNotice("");
    try{
      const d=await api("/api/admin/punches",{method:"PUT",body:JSON.stringify({
        employeeId:Number(adjustEmployee),date:adjustDate,reason:adjustReason,...adjustTimes
      })});
      setAdjustSummary(d.summary);setAdjustReason("");
      await loadBase();
      setNotice("Ponto ajustado manualmente e registrado na auditoria.");
    }catch(e){setError(e instanceof Error?e.message:"Erro ao ajustar ponto.");}
  }

  async function generate(){
    try{
      setError("");
      setReport(await api(`/api/admin/report?employeeId=${encodeURIComponent(reportEmp)}&month=${encodeURIComponent(month)}`));
    }catch(e){setError(e instanceof Error?e.message:"Erro");}
  }

  function exportCsv(){
    if(!report)return;
    const safe=(v:any)=>{let t=String(v??"");if(/^[=+\-@]/.test(t))t="'"+t;return `"${t.replaceAll('"','""')}"`;};
    const header=["Funcionário","CPF","Data","Dia","Entrada","Intervalo","Saída","Trabalhado","Débito banco","Saldo do dia","Situação","Observação"];
    const lines=[header.map(safe).join(";")];
    for(const r of report.rows)lines.push([
      r.employee_name,formatCpf(r.employee_cpf),formatDate(r.date),r.weekday,r.entrada?String(r.entrada).slice(0,5):"",
      intervalText(r),r.saida?String(r.saida).slice(0,5):"",fmt(r.worked_minutes),
      fmt(r.bank_debit_minutes),fmt(r.daily_balance_minutes,true),r.status,r.details??""
    ].map(safe).join(";"));
    const b=new Blob(["\ufeff"+lines.join("\r\n")],{type:"text/csv;charset=utf-8"});
    const u=URL.createObjectURL(b);const a=document.createElement("a");
    a.href=u;a.download=`espelho-ponto-cvt-${month}.csv`;a.click();URL.revokeObjectURL(u);
  }

  async function downloadPdf(){
    if(!report||downloadingPdf)return;
    setDownloadingPdf(true);setError("");
    try{
      const {downloadMonthlyReportPdf}=await import("@/lib/report-pdf");
      downloadMonthlyReportPdf(report);
    }catch(e){
      setError(e instanceof Error?e.message:"Não foi possível gerar o PDF.");
    }finally{setDownloadingPdf(false);}
  }

  const totals=dash?.totals??emptyTotals;

  return <div className="appShell">
    <aside className="sidebar">
      <div className="sideBrand"><div className="brandMark small">CVT</div><div><strong>Controle de Ponto</strong><small>Área administrativa</small></div></div>
      <nav>
        {[
          ["dashboard","Dashboard"],["employees","Funcionários"],["occurrences","Ocorrências"],
          ["adjustments","Ajuste de ponto"],["requests","Solicitações de ajuste"],["extraRequests","Jornada extra"],["holidays","Feriados"],["report","Relatório mensal"]
        ].map(([k,l])=><button key={k} className={view===k?"active":""} onClick={()=>setView(k as View)}>{l}</button>)}
      </nav>
      <button className="logout" onClick={logout}>Sair</button>
    </aside>

    <main className="content">
      <header className="topbar"><div><p className="eyebrow">CVT</p><h1>Painel Administrativo</h1></div><span className="secureBadge">Sessão protegida</span></header>
      {error&&<div className="alert error" onClick={()=>setError("")}>{error}</div>}
      {notice&&<div className="alert" onClick={()=>setNotice("")}>{notice}</div>}

      {view==="dashboard"&&<>
        <div className="metrics">
          {[
            ["Funcionários",dash?.total??0],["Ativos",dash?.active??0],["Horas trabalhadas",fmt(totals.worked_minutes)],
            ["Horas positivas",fmt(totals.positive_minutes)],["Horas negativas",fmt(totals.negative_minutes)],
            ["Saldo",fmt(totals.balance_minutes,true)]
          ].map(([l,v])=><article className="metric" key={String(l)}><span>{l}</span><strong>{v}</strong></article>)}
        </div>
        <div className="panel tableWrap"><table><thead><tr><th>Funcionário</th><th>Usuário</th><th>Trabalhado</th><th>Positivas</th><th>Negativas</th><th>Saldo</th><th>Status hoje</th></tr></thead>
          <tbody>{dash?.employees.map(e=><tr key={e.id}><td>{e.name}</td><td>{e.login}</td><td>{fmt(e.totals.worked_minutes)}</td><td>{fmt(e.totals.positive_minutes)}</td><td>{fmt(e.totals.negative_minutes)}</td><td>{fmt(e.totals.balance_minutes,true)}</td><td>{e.today_status}</td></tr>)}</tbody>
        </table></div>
      </>}

      {view==="employees"&&<>
        <div className="panel">
          <div className="sectionHead"><div><p className="eyebrow">CADASTRO</p><h2>Novo funcionário</h2></div><span className="badge">{employees.length}/3</span></div>
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
        <div className="panel tableWrap"><table><thead><tr><th>Nome</th><th>Usuário</th><th>CPF</th><th>Admissão</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>{employees.map(e=><tr key={e.id}><td>{e.name}</td><td>{e.login}</td><td>{e.cpf}</td><td>{formatDate(e.admission_date)}</td><td>{e.status}</td><td><div className="reportActions"><button className="secondary" onClick={()=>toggle(e)}>{e.status==="ATIVO"?"Inativar":"Ativar"}</button><button className="dark" onClick={()=>{setPasswordEmp(e);setNewPassword("");setConfirmPassword("");}}>Redefinir senha</button></div></td></tr>)}</tbody>
        </table></div>
        {passwordEmp&&<div className="panel">
          <div className="sectionHead"><div><p className="eyebrow">SEGURANÇA</p><h2>Redefinir senha — {passwordEmp.name}</h2></div><button className="secondary" type="button" onClick={()=>setPasswordEmp(null)}>Cancelar</button></div>
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
            <label>Funcionário<select name="employeeId" required>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
            <label>Data<input name="date" type="date" required /></label>
            <label>Tipo<select value={occType} onChange={e=>{const v=e.target.value as typeof occType;setOccType(v);if(v!=="FOLGA")setOccPeriod("DIA_TODO");}}><option value="FALTA">Falta — desconta 8h</option><option value="FOLGA">Folga — debita banco de horas</option><option value="ATESTADO">Atestado — não desconta</option></select></label>
            {occType==="FOLGA"&&<label>Período<select value={occPeriod} onChange={e=>setOccPeriod(e.target.value as typeof occPeriod)}><option value="DIA_TODO">Dia todo — debita 8h do banco</option><option value="MANHA">Folga de manhã — debita 4h / trabalha à tarde</option><option value="TARDE">Folga à tarde — debita 4h / trabalha de manhã</option></select></label>}
            <label>Observação<input name="note" maxLength={240} placeholder="Opcional" /></label>
            <div className="formAction"><button className="primary">SALVAR OCORRÊNCIA</button></div>
          </form>
        </div>
        <div className="panel tableWrap"><table><thead><tr><th>Data</th><th>Funcionário</th><th>Ocorrência</th><th>Observação</th><th>Ação</th></tr></thead>
          <tbody>{occurrences.map(o=><tr key={o.id}><td>{formatDate(o.work_date)}</td><td>{o.employee_name}</td><td>{occurrenceLabel(o)}</td><td>{o.note??"—"}</td><td><button className="secondary" onClick={()=>removeOccurrence(o.id)}>Remover</button></td></tr>)}</tbody>
        </table></div>
      </>}

      {view==="adjustments"&&<>
        <div className="panel">
          <div className="sectionHead"><div><p className="eyebrow">CORREÇÃO ADMINISTRATIVA</p><h2>Ajuste manual do ponto</h2></div></div>
          <div className="reportTools">
            <label>Funcionário<select value={adjustEmployee} onChange={e=>{setAdjustEmployee(e.target.value);setAdjustLoaded(false);}}>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
            <label>Data<input type="date" value={adjustDate} onChange={e=>{setAdjustDate(e.target.value);setAdjustLoaded(false);}} /></label>
            <div className="reportActions"><button className="primary" type="button" onClick={loadAdjustment}>CARREGAR DIA</button></div>
          </div>
        </div>
        {adjustLoaded&&<div className="panel">
          <div className="sectionHead"><div><p className="eyebrow">REGISTROS DO DIA</p><h2>{adjustSummary?.status??"SEM REGISTRO"}</h2></div><span className="badge">Previsto: {fmt(adjustSummary?.expected_minutes)}</span></div>
          <form className="formGrid" onSubmit={saveAdjustment}>
            <label>Entrada<input type="time" value={adjustTimes.entrada} onChange={e=>setAdjustTimes(v=>({...v,entrada:e.target.value}))} /></label>
            <label>Início intervalo<input type="time" value={adjustTimes.intervalo_inicio} onChange={e=>setAdjustTimes(v=>({...v,intervalo_inicio:e.target.value}))} /></label>
            <label>Fim intervalo<input type="time" value={adjustTimes.intervalo_fim} onChange={e=>setAdjustTimes(v=>({...v,intervalo_fim:e.target.value}))} /></label>
            <label>Saída<input type="time" value={adjustTimes.saida} onChange={e=>setAdjustTimes(v=>({...v,saida:e.target.value}))} /></label>
            <label>Motivo do ajuste<input value={adjustReason} onChange={e=>setAdjustReason(e.target.value)} minLength={3} maxLength={240} placeholder="Ex.: esquecimento de batida" required /></label>
            <div className="formAction"><button className="primary">SALVAR AJUSTE</button></div>
          </form>
          <p className="serverNote">Campos vazios removem aquela batida. Todo ajuste registra antes, depois e motivo na auditoria.</p>
        </div>}
      </>}

      {view==="requests"&&<>
        <div className="panel">
          <div className="sectionHead"><div><p className="eyebrow">APROVAÇÃO</p><h2>Solicitações de ajuste dos funcionários</h2></div><span className="badge">{adjustmentRequests.filter(r=>r.status==="PENDENTE").length} pendente(s)</span></div>
          <p className="serverNote">O ponto só é alterado quando a solicitação é aprovada. Rejeições mantêm os registros originais.</p>
        </div>
        <div className="panel tableWrap"><table><thead><tr><th>Data</th><th>Funcionário</th><th>Ponto original</th><th>Solicitado</th><th>Motivo</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>{adjustmentRequests.length?adjustmentRequests.map(r=><tr key={r.id}><td>{formatDate(r.work_date)}</td><td>{r.employee_name}</td><td>{originalText(r.original_punches)}</td><td>{requestedText(r)}</td><td>{r.reason}</td><td>{r.status}{r.review_note?` — ${r.review_note}`:""}</td><td>{r.status==="PENDENTE"?<div className="reportActions"><button className="primary" onClick={()=>reviewAdjustmentRequest(r,"APROVADO")}>Aprovar</button><button className="secondary" onClick={()=>reviewAdjustmentRequest(r,"REJEITADO")}>Rejeitar</button></div>:"—"}</td></tr>):<tr><td colSpan={7}>Nenhuma solicitação encontrada.</td></tr>}</tbody>
        </table></div>
      </>}

      {view==="extraRequests"&&<>
        <div className="panel">
          <div className="sectionHead"><div><p className="eyebrow">APROVAÇÃO</p><h2>Solicitações de jornada extra</h2></div><span className="badge">{extraWorkRequests.filter(r=>r.status==="PENDENTE").length} pendente(s)</span></div>
          <p className="serverNote">A jornada extra aprovada entra diretamente como saldo positivo no banco de horas. Solicitações pendentes não alteram o saldo.</p>
        </div>
        <div className="panel tableWrap"><table><thead><tr><th>Funcionário</th><th>Entrada</th><th>Saída</th><th>Duração</th><th>Referência</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>{extraWorkRequests.length?extraWorkRequests.map(r=><tr key={r.id}><td>{r.employee_name}</td><td>{formatDate(r.start_date)} {String(r.start_time).slice(0,5)}</td><td>{formatDate(r.end_date)} {String(r.end_time).slice(0,5)}</td><td>{fmt(r.minutes)}</td><td>{r.description}</td><td>{r.status}{r.review_note?` — ${r.review_note}`:""}</td><td>{r.status==="PENDENTE"?<div className="reportActions"><button className="primary" onClick={()=>reviewExtraWork(r,"APROVADO")}>Aprovar</button><button className="secondary" onClick={()=>reviewExtraWork(r,"REJEITADO")}>Rejeitar</button></div>:"—"}</td></tr>):<tr><td colSpan={7}>Nenhuma solicitação de jornada extra.</td></tr>}</tbody>
        </table></div>
      </>}

      {view==="holidays"&&<>
        <div className="panel">
          <div className="sectionHead"><div><p className="eyebrow">CALENDÁRIO</p><h2>Cadastrar feriado</h2></div></div>
          <form className="formGrid" onSubmit={saveHoliday}>
            <label>Data<input name="date" type="date" required /></label>
            <label>Descrição<input name="description" minLength={2} maxLength={120} placeholder="Ex.: Natal" required /></label>
            <div className="formAction"><button className="primary">SALVAR FERIADO</button></div>
          </form>
        </div>
        <div className="panel tableWrap"><table><thead><tr><th>Data</th><th>Feriado</th><th>Ação</th></tr></thead>
          <tbody>{holidays.map(h=><tr key={h.id}><td>{formatDate(h.holiday_date)}</td><td>{h.description}</td><td><button className="secondary" onClick={()=>removeHoliday(h.id)}>Remover</button></td></tr>)}</tbody>
        </table></div>
      </>}

      {view==="report"&&<>
        <div className="panel noPrint">
          <p className="eyebrow">CONFERÊNCIA MENSAL</p>
          <h2>Espelho mensal de ponto</h2>
          <p className="serverNote">O PDF apresenta todos os dias já transcorridos do mês, incluindo jornadas, folgas, faltas, atestados, feriados, fins de semana e horas extras aprovadas.</p>
          <div className="reportTools">
            <label>Funcionário<select value={reportEmp} onChange={e=>setReportEmp(e.target.value)}><option value="ALL">Todos os funcionários</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
            <label>Mês<input type="month" value={month} onChange={e=>setMonth(e.target.value)} /></label>
            <div className="reportActions"><button className="primary" onClick={generate}>GERAR</button><button className="secondary" onClick={exportCsv} disabled={!report}>EXCEL / CSV</button><button className="dark" onClick={downloadPdf} disabled={!report||downloadingPdf}>{downloadingPdf?"GERANDO PDF...":"BAIXAR PDF"}</button></div>
          </div>
        </div>

        <div className="reportPrintRoot">
          {report?.employee_reports?.map((employeeReport,index)=><section className="employeePrintSheet" key={employeeReport.employee_id}>
            <header className="printReportHeader">
              <div className="printBrand">
                <div className="brandMark printLogo">CVT</div>
                <div><strong>Corrente da Vida Treinamentos</strong><span>Espelho Mensal de Ponto</span></div>
              </div>
              <div className="printPeriod"><span>Competência</span><strong>{formatMonth(report.month)}</strong></div>
            </header>

            <div className="employeeIdentity">
              <div><span>Funcionário</span><strong>{employeeReport.employee_name}</strong></div>
              <div><span>CPF</span><strong>{formatCpf(employeeReport.employee_cpf)}</strong></div>
              <div><span>Admissão</span><strong>{formatDate(employeeReport.admission_date)}</strong></div>
            </div>

            <div className="printTotals">
              {[
                ["Trabalhadas",fmt(employeeReport.totals.worked_minutes)],
                ["Positivas",fmt(employeeReport.totals.positive_minutes)],
                ["Negativas",fmt(employeeReport.totals.negative_minutes)],
                ["Saldo do mês",fmt(employeeReport.totals.balance_minutes,true)]
              ].map(([label,value])=><div key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}
            </div>

            <div className="tableWrap printTableWrap">
              <table className="monthlyPunchTable">
                <thead><tr><th>Data</th><th>Dia</th><th>Entrada</th><th>Intervalo</th><th>Saída</th><th>Trabalhado</th><th>Débito</th><th>Saldo dia</th><th>Situação / observação</th></tr></thead>
                <tbody>{employeeReport.rows.map((r:any)=><tr key={r.date} className={reportRowClass(r)}>
                  <td>{formatDate(r.date)}</td>
                  <td>{r.weekday}</td>
                  <td>{r.entrada?String(r.entrada).slice(0,5):"—"}</td>
                  <td>{intervalText(r)}</td>
                  <td>{r.saida?String(r.saida).slice(0,5):"—"}</td>
                  <td>{fmt(r.worked_minutes)}</td>
                  <td>{r.bank_debit_minutes?fmt(r.bank_debit_minutes):"—"}</td>
                  <td>{fmt(r.daily_balance_minutes,true)}</td>
                  <td className="statusCell"><strong>{r.status}</strong>{r.details&&<span>{r.details}</span>}</td>
                </tr>)}</tbody>
              </table>
            </div>

            <div className="employeeSignature">
              <p>Declaro que conferi os registros de jornada e os saldos apresentados neste relatório mensal.</p>
              <div className="signatureLine"></div>
              <strong>{employeeReport.employee_name}</strong>
              <span>Assinatura do funcionário</span>
            </div>

            <footer className="printReportFooter">
              <span>Corrente da Vida Treinamentos — CVT</span>
              <span>Documento para conferência mensal do funcionário</span>
            </footer>
          </section>)}
        </div>
      </>}
    </main>
  </div>;
}
