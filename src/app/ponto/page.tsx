"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const LABEL:any={ENTRADA:"Entrada",INTERVALO_INICIO:"Início do intervalo",INTERVALO_FIM:"Fim do intervalo",SAIDA:"Saída"};
const fmt=(n:number|null|undefined,s=false)=>{if(n==null)return"—";const sign=n<0?"-":s&&n>0?"+":"";const a=Math.abs(n);return`${sign}${String(Math.floor(a/60)).padStart(2,"0")}h${String(a%60).padStart(2,"0")}`};
const formatDate=(value:string|null|undefined)=>{if(!value)return"—";const raw=String(value).slice(0,10);const m=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:value};
const todaySP=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const statusLabel=(s:string)=>s==="PENDENTE"?"Pendente":s==="APROVADO"?"Aprovado":"Rejeitado";
const extraEnd=(x:any)=>x.end_date&&x.end_date!==x.start_date?`${String(x.end_time).slice(0,5)} (${formatDate(x.end_date)})`:String(x.end_time).slice(0,5);

export default function Ponto(){
  const router=useRouter();
  const [data,setData]=useState<any>(null);
  const [requests,setRequests]=useState<any[]>([]);
  const [extraRequests,setExtraRequests]=useState<any[]>([]);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [clock,setClock]=useState("00:00:00");
  const timer=useRef<any>(null);

  const [extraStartDate,setExtraStartDate]=useState(todaySP());
  const [extraStartTime,setExtraStartTime]=useState("");
  const [extraEndDate,setExtraEndDate]=useState(todaySP());
  const [extraEndTime,setExtraEndTime]=useState("");
  const [extraDescription,setExtraDescription]=useState("");
  const [extraBusy,setExtraBusy]=useState(false);

  const [adjustDate,setAdjustDate]=useState(todaySP());
  const [adjustLoaded,setAdjustLoaded]=useState(false);
  const [pendingForDate,setPendingForDate]=useState<any>(null);
  const [adjustTimes,setAdjustTimes]=useState({entrada:"",intervalo_inicio:"",intervalo_fim:"",saida:""});
  const [adjustReason,setAdjustReason]=useState("");

  const csrf=()=>sessionStorage.getItem("cvt_csrf")||"";
  const api=useCallback(async(url:string,opt:RequestInit={})=>{
    const h=new Headers(opt.headers);
    if(opt.body)h.set("content-type","application/json");
    if(opt.method&&opt.method!=="GET")h.set("x-csrf-token",csrf());
    const r=await fetch(url,{...opt,headers:h});
    if(r.status===401){router.replace("/");throw new Error("Sessão expirada");}
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||"Erro");
    return d;
  },[router]);

  const loadRequests=useCallback(async()=>{
    const d=await api("/api/employee/adjustments");
    setRequests(d.requests||[]);
  },[api]);

  const loadExtraRequests=useCallback(async()=>{
    const d=await api("/api/employee/extra-work");
    setExtraRequests(d.requests||[]);
  },[api]);

  const load=useCallback(async()=>{
    try{
      const [d]=await Promise.all([
        api("/api/employee/dashboard"),
        loadRequests(),
        loadExtraRequests(),
      ]);
      setData(d);
      const start=new Date(d.server_time).getTime(),local=Date.now();
      if(timer.current)clearInterval(timer.current);
      const tick=()=>setClock(new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(new Date(start+(Date.now()-local))));
      tick();timer.current=setInterval(tick,1000);
    }catch(e){setError(e instanceof Error?e.message:"Erro");}
  },[api,loadRequests,loadExtraRequests]);

  useEffect(()=>{void load();return()=>{if(timer.current)clearInterval(timer.current)}},[load]);

  async function punch(){
    try{setError("");setNotice("");await api("/api/employee/punch",{method:"POST",body:"{}"});await load();}
    catch(e){setError(e instanceof Error?e.message:"Erro");}
  }

  async function requestExtra(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(extraBusy)return;
    setExtraBusy(true);setError("");setNotice("");
    try{
      const result=await api("/api/employee/extra-work",{method:"POST",body:JSON.stringify({
        start_date:extraStartDate,start_time:extraStartTime,
        end_date:extraEndDate,end_time:extraEndTime,
        description:extraDescription,
      })});
      setNotice(`Jornada extra enviada para aprovação: ${fmt(result.minutes)}. Após aprovação, entra como saldo positivo no banco.`);
      setExtraStartTime("");setExtraEndTime("");setExtraDescription("");
      await loadExtraRequests();
    }catch(e){setError(e instanceof Error?e.message:"Erro ao enviar jornada extra.");}
    finally{setExtraBusy(false);}
  }

  async function logout(){
    await api("/api/auth/logout",{method:"POST",body:"{}"});
    sessionStorage.removeItem("cvt_csrf");
    router.replace("/");
  }

  async function loadAdjustment(){
    try{
      setError("");setNotice("");
      const d=await api(`/api/employee/adjustments?date=${encodeURIComponent(adjustDate)}`);
      const s=d.summary;
      setPendingForDate(d.pending);
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

  async function requestAdjustment(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    try{
      setError("");setNotice("");
      await api("/api/employee/adjustments",{method:"POST",body:JSON.stringify({
        date:adjustDate,reason:adjustReason,...adjustTimes
      })});
      setNotice("Solicitação enviada para aprovação da CVT.");
      setAdjustReason("");
      await Promise.all([loadRequests(),loadAdjustment()]);
    }catch(e){setError(e instanceof Error?e.message:"Erro ao enviar solicitação.");}
  }

  const blocked=["FALTA","ATESTADO"].includes(data?.today?.occurrence_type)||(data?.today?.occurrence_type==="FOLGA"&&data?.today?.occurrence_period==="DIA_TODO");

  return <main className="employeePage">
    <header className="employeeHeader">
      <div><p className="eyebrow">REGISTRO DE PONTO</p><h1>{data?.employee.name??"Funcionário"}</h1></div>
      <button className="secondary" onClick={logout}>Sair</button>
    </header>

    <section className="clockPanel">
      <p className="dateLine">Hora oficial do servidor</p>
      <div className="liveClock">{clock}</div>
      <p className="serverNote">America/Sao_Paulo</p>
      <div className="nextPunch">{blocked?`Ocorrência do dia: ${data?.today?.status}`:data?.next_type?`Próxima batida: ${LABEL[data.next_type]}`:"Jornada do dia concluída."}</div>
      <button className="punchButton" onClick={punch} disabled={!data?.next_type}>{blocked?"REGISTRO BLOQUEADO":data?.next_type?`REGISTRAR ${LABEL[data.next_type].toUpperCase()}`:"JORNADA CONCLUÍDA"}</button>
      {error&&<div className="alert error" onClick={()=>setError("")}>{error}</div>}
      {notice&&<div className="alert" onClick={()=>setNotice("")}>{notice}</div>}
    </section>

    <section className="employeeMetrics">
      {[
        ["Horas trabalhadas",fmt(data?.totals.worked_minutes)],
        ["Horas positivas",fmt(data?.totals.positive_minutes)],
        ["Horas negativas",fmt(data?.totals.negative_minutes)],
        ["Saldo",fmt(data?.totals.balance_minutes,true)]
      ].map(([l,v])=><article className="metric" key={String(l)}><span>{l}</span><strong>{v}</strong></article>)}
    </section>

    <section className="panel">
      <div className="sectionHead"><div><p className="eyebrow">HOJE</p><h2>{data?.today.status??"SEM REGISTRO"}</h2></div></div>
      {data?.today?.note&&<p className="serverNote">{data.today.note}</p>}
      <div className="punchGrid">{[["Entrada",data?.today.entrada],["Início intervalo",data?.today.intervalo_inicio],["Fim intervalo",data?.today.intervalo_fim],["Saída",data?.today.saida]].map(([l,v])=><div key={String(l)}><span>{l}</span><strong>{v?String(v).slice(0,5):"—"}</strong></div>)}</div>
    </section>

    <section className="panel">
      <div className="sectionHead">
        <div><p className="eyebrow">JORNADA EXTRA</p><h2>Solicitar crédito no banco de horas</h2></div>
        <span className="badge">Sujeito à aprovação</span>
      </div>
      <form className="formGrid" onSubmit={requestExtra}>
        <label>Data da entrada<input type="date" value={extraStartDate} max={todaySP()} onChange={e=>setExtraStartDate(e.target.value)} required /></label>
        <label>Hora da entrada<input type="time" value={extraStartTime} onChange={e=>setExtraStartTime(e.target.value)} required /></label>
        <label>Data da saída<input type="date" value={extraEndDate} max={todaySP()} onChange={e=>setExtraEndDate(e.target.value)} required /></label>
        <label>Hora da saída<input type="time" value={extraEndTime} onChange={e=>setExtraEndTime(e.target.value)} required /></label>
        <label>Referência / motivo<input value={extraDescription} onChange={e=>setExtraDescription(e.target.value)} minLength={3} maxLength={160} placeholder="Ex.: Treinamento Karsten" required /></label>
        <div className="formAction"><button className="primary" disabled={extraBusy}>{extraBusy?"ENVIANDO...":"ENVIAR JORNADA EXTRA PARA APROVAÇÃO"}</button></div>
      </form>
      <p className="serverNote">Exemplo: entrada 22:15 em 29/09 e saída 03:00 em 30/09. O período aprovado entra integralmente como saldo positivo no banco de horas.</p>
    </section>

    <section className="panel tableWrap">
      <h2>Minhas solicitações de jornada extra</h2>
      <table><thead><tr><th>Entrada</th><th>Saída</th><th>Duração</th><th>Referência</th><th>Status</th><th>Retorno</th></tr></thead>
        <tbody>{extraRequests.length?extraRequests.map((x:any)=><tr key={x.id}><td>{formatDate(x.start_date)} {String(x.start_time).slice(0,5)}</td><td>{formatDate(x.end_date)} {String(x.end_time).slice(0,5)}</td><td>{fmt(Number(x.minutes))}</td><td>{x.description}</td><td>{statusLabel(x.status)}</td><td>{x.review_note??"—"}</td></tr>):<tr><td colSpan={6}>Nenhuma solicitação enviada.</td></tr>}</tbody>
      </table>
    </section>

    <section className="panel tableWrap">
      <h2>Jornadas extras aprovadas</h2>
      <table><thead><tr><th>Data</th><th>Entrada</th><th>Saída</th><th>Duração</th><th>Referência</th></tr></thead>
        <tbody>{data?.recent_extra?.length?data.recent_extra.map((x:any)=><tr key={x.id}><td>{formatDate(x.start_date)}</td><td>{String(x.start_time).slice(0,5)}</td><td>{extraEnd(x)}</td><td>{fmt(x.minutes)}</td><td>{x.description??"—"}</td></tr>):<tr><td colSpan={5}>Nenhuma jornada extra aprovada.</td></tr>}</tbody>
      </table>
    </section>

    <section className="panel">
      <div className="sectionHead"><div><p className="eyebrow">CORREÇÃO DE PONTO</p><h2>Solicitar ajuste manual</h2></div><span className="badge">Sujeito à aprovação</span></div>
      <div className="reportTools">
        <label>Data<input type="date" value={adjustDate} max={todaySP()} onChange={e=>{setAdjustDate(e.target.value);setAdjustLoaded(false);setPendingForDate(null);}} /></label>
        <div className="reportActions"><button className="secondary" type="button" onClick={loadAdjustment}>CARREGAR PONTO</button></div>
      </div>
      {adjustLoaded&&<form className="formGrid" onSubmit={requestAdjustment}>
        <label>Entrada<input type="time" value={adjustTimes.entrada} onChange={e=>setAdjustTimes(v=>({...v,entrada:e.target.value}))} /></label>
        <label>Início intervalo<input type="time" value={adjustTimes.intervalo_inicio} onChange={e=>setAdjustTimes(v=>({...v,intervalo_inicio:e.target.value}))} /></label>
        <label>Fim intervalo<input type="time" value={adjustTimes.intervalo_fim} onChange={e=>setAdjustTimes(v=>({...v,intervalo_fim:e.target.value}))} /></label>
        <label>Saída<input type="time" value={adjustTimes.saida} onChange={e=>setAdjustTimes(v=>({...v,saida:e.target.value}))} /></label>
        <label>Motivo<input value={adjustReason} onChange={e=>setAdjustReason(e.target.value)} minLength={3} maxLength={240} placeholder="Ex.: esqueci de registrar a saída" required /></label>
        <div className="formAction"><button className="primary" disabled={!!pendingForDate}>{pendingForDate?"SOLICITAÇÃO JÁ PENDENTE":"ENVIAR PARA APROVAÇÃO"}</button></div>
      </form>}
      {adjustLoaded&&<p className="serverNote">O ponto atual não será alterado até a solicitação ser aprovada pelo administrador.</p>}
    </section>

    <section className="panel tableWrap">
      <h2>Minhas solicitações de ajuste</h2>
      <table><thead><tr><th>Data</th><th>Entrada</th><th>Início intervalo</th><th>Fim intervalo</th><th>Saída</th><th>Motivo</th><th>Status</th></tr></thead>
        <tbody>{requests.length?requests.map((r:any)=><tr key={r.id}><td>{formatDate(r.work_date)}</td><td>{r.requested_entrada?String(r.requested_entrada).slice(0,5):"—"}</td><td>{r.requested_intervalo_inicio?String(r.requested_intervalo_inicio).slice(0,5):"—"}</td><td>{r.requested_intervalo_fim?String(r.requested_intervalo_fim).slice(0,5):"—"}</td><td>{r.requested_saida?String(r.requested_saida).slice(0,5):"—"}</td><td>{r.reason}</td><td>{statusLabel(r.status)}</td></tr>):<tr><td colSpan={7}>Nenhuma solicitação enviada.</td></tr>}</tbody>
      </table>
    </section>

    <section className="panel tableWrap">
      <h2>Últimos registros</h2>
      <table><thead><tr><th>Data</th><th>Trabalhado</th><th>Saldo</th><th>Status</th></tr></thead><tbody>{data?.recent?.map((r:any)=><tr key={r.date}><td>{formatDate(r.date)}</td><td>{fmt(r.worked_minutes)}</td><td>{fmt(r.balance_minutes,true)}</td><td>{r.status}</td></tr>)}</tbody></table>
    </section>
  </main>
}
