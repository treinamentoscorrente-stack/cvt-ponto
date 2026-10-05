"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, clearCsrf } from "@/lib/client-api";
import { formatDateBR, formatMinutes, todaySaoPaulo } from "@/lib/client-utils";

const PUNCH_LABEL:Record<string,string>={
  ENTRADA:"Entrada",
  INTERVALO_INICIO:"Início do intervalo",
  INTERVALO_FIM:"Fim do intervalo",
  SAIDA:"Saída",
};

const statusLabel=(status:string)=>status==="PENDENTE"?"Pendente":status==="APROVADO"?"Aprovado":"Rejeitado";

function manualMinutes(startDate:string,startTime:string,endDate:string,endTime:string){
  if(!startDate||!startTime||!endDate||!endTime)return NaN;
  const parse=(date:string,time:string)=>{
    const [year,month,day]=date.split("-").map(Number);
    const [hour,minute]=time.split(":").map(Number);
    return Date.UTC(year,month-1,day,hour,minute);
  };
  return Math.round((parse(endDate,endTime)-parse(startDate,startTime))/60000);
}

export default function Ponto(){
  const router=useRouter();
  const [data,setData]=useState<any>(null);
  const [requests,setRequests]=useState<any[]>([]);
  const [extraRequests,setExtraRequests]=useState<any[]>([]);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [clock,setClock]=useState("00:00:00");
  const timer=useRef<ReturnType<typeof setInterval>|null>(null);

  const [extraStartDate,setExtraStartDate]=useState(todaySaoPaulo());
  const [extraStartTime,setExtraStartTime]=useState("");
  const [extraEndDate,setExtraEndDate]=useState(todaySaoPaulo());
  const [extraEndTime,setExtraEndTime]=useState("");
  const [extraDescription,setExtraDescription]=useState("");
  const [extraBusy,setExtraBusy]=useState(false);

  const [adjustDate,setAdjustDate]=useState(todaySaoPaulo());
  const [adjustLoaded,setAdjustLoaded]=useState(false);
  const [pendingForDate,setPendingForDate]=useState<any>(null);
  const [adjustTimes,setAdjustTimes]=useState({entrada:"",intervalo_inicio:"",intervalo_fim:"",saida:""});
  const [adjustReason,setAdjustReason]=useState("");

  const api=useCallback(
    (url:string,options:RequestInit={})=>apiRequest(url,options,()=>router.replace("/")),
    [router],
  );

  const loadRequests=useCallback(async()=>{
    const result:any=await api("/api/employee/adjustments");
    setRequests(result.requests||[]);
  },[api]);

  const loadExtraRequests=useCallback(async()=>{
    const result:any=await api("/api/employee/extra-work");
    setExtraRequests(result.requests||[]);
  },[api]);

  const load=useCallback(async()=>{
    try{
      const [dashboard]:any[]=await Promise.all([
        api("/api/employee/dashboard"),
        loadRequests(),
        loadExtraRequests(),
      ]);
      setData(dashboard);

      const serverStart=new Date(dashboard.server_time).getTime();
      const localStart=Date.now();
      if(timer.current)clearInterval(timer.current);
      const tick=()=>setClock(new Intl.DateTimeFormat("pt-BR",{
        timeZone:"America/Sao_Paulo",
        hour:"2-digit",
        minute:"2-digit",
        second:"2-digit",
        hour12:false,
      }).format(new Date(serverStart+(Date.now()-localStart))));
      tick();
      timer.current=setInterval(tick,1000);
    }catch(e){
      setError(e instanceof Error?e.message:"Erro");
    }
  },[api,loadRequests,loadExtraRequests]);

  useEffect(()=>{
    void load();
    return()=>{if(timer.current)clearInterval(timer.current);};
  },[load]);

  async function punch(){
    try{
      setError("");setNotice("");
      await api("/api/employee/punch",{method:"POST",body:"{}"});
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Erro");}
  }

  async function requestExtra(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(extraBusy)return;
    setError("");setNotice("");

    const minutes=manualMinutes(extraStartDate,extraStartTime,extraEndDate,extraEndTime);
    if(!Number.isFinite(minutes)||minutes<=0){setError("A saída deve ser posterior à entrada.");return;}
    if(minutes>1440){setError("O crédito de banco não pode ultrapassar 24 horas.");return;}

    const confirmed=window.confirm(
      `CONFIRMAR CRÉDITO NO BANCO DE HORAS\n\nEntrada: ${formatDateBR(extraStartDate)} ${extraStartTime}\nSaída: ${formatDateBR(extraEndDate)} ${extraEndTime}\nCrédito: +${formatMinutes(minutes)}\nReferência: ${extraDescription.trim()}\n\nApós confirmar, este período será lançado imediatamente nas horas positivas do banco. Confirma os dados?`,
    );
    if(!confirmed)return;

    setExtraBusy(true);
    try{
      const result:any=await api("/api/employee/extra-work",{method:"POST",body:JSON.stringify({
        start_date:extraStartDate,
        start_time:extraStartTime,
        end_date:extraEndDate,
        end_time:extraEndTime,
        description:extraDescription,
      })});
      setNotice(`Crédito lançado no banco de horas: +${formatMinutes(result.minutes)}.`);
      setExtraStartTime("");setExtraEndTime("");setExtraDescription("");
      await load();
    }catch(e){
      setError(e instanceof Error?e.message:"Erro ao registrar crédito no banco de horas.");
    }finally{
      setExtraBusy(false);
    }
  }

  async function logout(){
    await api("/api/auth/logout",{method:"POST",body:"{}"});
    clearCsrf();
    router.replace("/");
  }

  async function loadAdjustment(){
    try{
      setError("");setNotice("");
      const result:any=await api(`/api/employee/adjustments?date=${encodeURIComponent(adjustDate)}`);
      const summary=result.summary;
      setPendingForDate(result.pending);
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

  async function requestAdjustment(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    try{
      setError("");setNotice("");
      await api("/api/employee/adjustments",{method:"POST",body:JSON.stringify({
        date:adjustDate,
        reason:adjustReason,
        ...adjustTimes,
      })});
      setNotice("Solicitação enviada para aprovação da CVT.");
      setAdjustReason("");
      await Promise.all([loadRequests(),loadAdjustment()]);
    }catch(e){setError(e instanceof Error?e.message:"Erro ao enviar solicitação.");}
  }

  const blocked=["FALTA","ATESTADO"].includes(data?.today?.occurrence_type)
    ||(data?.today?.occurrence_type==="FOLGA"&&data?.today?.occurrence_period==="DIA_TODO");

  return <main className="employeeScreen">
    <div className="employeePage">
      <header className="employeeHeader">
        <div><p className="eyebrow">REGISTRO DE PONTO</p><h1>{data?.employee.name??"Funcionário"}</h1></div>
        <button className="secondary employeeLogout" onClick={logout}>Sair</button>
      </header>

      <section className="clockPanel">
        <p className="dateLine">Hora oficial do servidor</p>
        <div className="liveClock">{clock}</div>
        <p className="serverNote">America/Sao_Paulo</p>
        <div className="nextPunch">{blocked?`Ocorrência do dia: ${data?.today?.status}`:data?.next_type?`Próxima batida: ${PUNCH_LABEL[data.next_type]}`:"Jornada do dia concluída."}</div>
        <button className="punchButton" onClick={punch} disabled={!data?.next_type}>{blocked?"REGISTRO BLOQUEADO":data?.next_type?`REGISTRAR ${PUNCH_LABEL[data.next_type].toUpperCase()}`:"JORNADA CONCLUÍDA"}</button>
        {error&&<div className="alert error employeeAlert" onClick={()=>setError("")}>{error}</div>}
        {notice&&<div className="alert employeeNotice" onClick={()=>setNotice("")}>{notice}</div>}
      </section>

      <section className="employeeMetrics">
        {[
          ["Horas trabalhadas",formatMinutes(data?.totals.worked_minutes)],
          ["Horas positivas",formatMinutes(data?.totals.positive_minutes)],
          ["Horas negativas",formatMinutes(data?.totals.negative_minutes)],
          ["Saldo",formatMinutes(data?.totals.balance_minutes,true)],
        ].map(([label,value])=><article className="metric employeeMetricCard" key={String(label)}><span>{label}</span><strong>{value}</strong></article>)}
      </section>

      <section className="panel employeeTodayPanel">
        <div className="sectionHead"><div><p className="eyebrow">HOJE</p><h2>{data?.today.status??"SEM REGISTRO"}</h2></div></div>
        {data?.today?.note&&<p className="serverNote">{data.today.note}</p>}
        <div className="punchGrid">{[["Entrada",data?.today.entrada],["Início intervalo",data?.today.intervalo_inicio],["Fim intervalo",data?.today.intervalo_fim],["Saída",data?.today.saida]].map(([label,value])=><div key={String(label)}><span>{label}</span><strong>{value?String(value).slice(0,5):"—"}</strong></div>)}</div>
      </section>

      <section className="panel employeeAdjustPanel">
        <div className="sectionHead"><div><p className="eyebrow">CORREÇÃO DE PONTO</p><h2>Solicitar ajuste manual</h2></div><span className="badge">Sujeito à aprovação</span></div>
        <div className="reportTools">
          <label>Data<input type="date" value={adjustDate} max={todaySaoPaulo()} onChange={e=>{setAdjustDate(e.target.value);setAdjustLoaded(false);setPendingForDate(null);}} /></label>
          <div className="reportActions"><button className="secondary employeeSecondaryButton" type="button" onClick={loadAdjustment}>CARREGAR PONTO</button></div>
        </div>
        {adjustLoaded&&<form className="formGrid" onSubmit={requestAdjustment}>
          <label>Entrada<input type="time" value={adjustTimes.entrada} onChange={e=>setAdjustTimes(v=>({...v,entrada:e.target.value}))} /></label>
          <label>Início intervalo<input type="time" value={adjustTimes.intervalo_inicio} onChange={e=>setAdjustTimes(v=>({...v,intervalo_inicio:e.target.value}))} /></label>
          <label>Fim intervalo<input type="time" value={adjustTimes.intervalo_fim} onChange={e=>setAdjustTimes(v=>({...v,intervalo_fim:e.target.value}))} /></label>
          <label>Saída<input type="time" value={adjustTimes.saida} onChange={e=>setAdjustTimes(v=>({...v,saida:e.target.value}))} /></label>
          <label>Motivo<input value={adjustReason} onChange={e=>setAdjustReason(e.target.value)} minLength={3} maxLength={240} placeholder="Ex.: esqueci de registrar a saída" required /></label>
          <div className="formAction"><button className="primary employeePrimaryButton" disabled={!!pendingForDate}>{pendingForDate?"SOLICITAÇÃO JÁ PENDENTE":"ENVIAR PARA APROVAÇÃO"}</button></div>
        </form>}
        {adjustLoaded&&<p className="serverNote">O ponto atual não será alterado até a solicitação ser aprovada pelo administrador.</p>}
      </section>

      <section className="panel employeeExtraPanel">
        <div className="sectionHead"><div><p className="eyebrow">HORAS ADICIONAIS</p><h2>Lançar horas adicionais</h2></div><span className="badge">Confirmação obrigatória</span></div>
        <form className="formGrid" onSubmit={requestExtra}>
          <label>Data da entrada<input type="date" value={extraStartDate} max={todaySaoPaulo()} onChange={e=>setExtraStartDate(e.target.value)} required /></label>
          <label>Hora da entrada<input type="time" value={extraStartTime} onChange={e=>setExtraStartTime(e.target.value)} required /></label>
          <label>Data da saída<input type="date" value={extraEndDate} max={todaySaoPaulo()} onChange={e=>setExtraEndDate(e.target.value)} required /></label>
          <label>Hora da saída<input type="time" value={extraEndTime} onChange={e=>setExtraEndTime(e.target.value)} required /></label>
          <label>Referência / motivo<input value={extraDescription} onChange={e=>setExtraDescription(e.target.value)} minLength={3} maxLength={160} placeholder="Ex.: Treinamento Karsten" required /></label>
          <div className="formAction"><button className="primary employeePrimaryButton" disabled={extraBusy}>{extraBusy?"LANÇANDO...":"VALIDAR E LANÇAR NO BANCO"}</button></div>
        </form>
        <p className="serverNote">Antes de gravar, o sistema mostra uma confirmação com entrada, saída e duração. Após confirmar, o período entra imediatamente nas horas positivas do banco.</p>
      </section>

      <section className="panel tableWrap employeeTablePanel">
        <div className="sectionHead"><div><p className="eyebrow">HISTÓRICO</p><h2>Minhas solicitações de ajuste</h2></div></div>
        <table><thead><tr><th>Data</th><th>Entrada</th><th>Início intervalo</th><th>Fim intervalo</th><th>Saída</th><th>Motivo</th><th>Status</th></tr></thead>
          <tbody>{requests.length?requests.map((request:any)=><tr key={request.id}><td>{formatDateBR(request.work_date)}</td><td>{request.requested_entrada?String(request.requested_entrada).slice(0,5):"—"}</td><td>{request.requested_intervalo_inicio?String(request.requested_intervalo_inicio).slice(0,5):"—"}</td><td>{request.requested_intervalo_fim?String(request.requested_intervalo_fim).slice(0,5):"—"}</td><td>{request.requested_saida?String(request.requested_saida).slice(0,5):"—"}</td><td>{request.reason}</td><td>{statusLabel(request.status)}</td></tr>):<tr><td colSpan={7}>Nenhuma solicitação enviada.</td></tr>}</tbody>
        </table>
      </section>

      <section className="panel tableWrap employeeTablePanel employeeExtraHistory">
        <div className="sectionHead"><div><p className="eyebrow">BANCO DE HORAS</p><h2>Registros de horas adicionais</h2></div></div>
        <table><thead><tr><th>Entrada</th><th>Saída</th><th>Crédito</th><th>Referência</th></tr></thead>
          <tbody>{extraRequests.length?extraRequests.map((item:any)=><tr key={item.id}><td>{formatDateBR(item.start_date)} {String(item.start_time).slice(0,5)}</td><td>{formatDateBR(item.end_date)} {String(item.end_time).slice(0,5)}</td><td>+{formatMinutes(Number(item.minutes))}</td><td>{item.description}</td></tr>):<tr><td colSpan={4}>Nenhuma hora adicional lançada.</td></tr>}</tbody>
        </table>
      </section>

      <section className="panel tableWrap employeeTablePanel employeeRecentPanel">
        <div className="sectionHead"><div><p className="eyebrow">RESUMO</p><h2>Últimos registros</h2></div></div>
        <table><thead><tr><th>Data</th><th>Trabalhado</th><th>Saldo</th><th>Status</th></tr></thead><tbody>{data?.recent?.map((row:any)=><tr key={row.date}><td>{formatDateBR(row.date)}</td><td>{formatMinutes(row.worked_minutes)}</td><td>{formatMinutes(row.balance_minutes,true)}</td><td>{row.status}</td></tr>)}</tbody></table>
      </section>
    </div>
  </main>;
}
