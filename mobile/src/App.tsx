import { FormEvent, useEffect, useMemo, useState } from "react";
import { BiometricAuth } from "@aparajita/capacitor-biometric-auth";
import { accessToken, biometricEnabled, setBiometricEnabled } from "./auth";
import { api, login, logout } from "./api";

const labels:Record<string,string>={
  ENTRADA:"Entrada",
  INTERVALO_INICIO:"Início do intervalo",
  INTERVALO_FIM:"Fim do intervalo",
  SAIDA:"Saída",
};

function hours(value:number|null|undefined,sign=false){
  if(value==null)return "—";
  const prefix=value<0?"-":sign&&value>0?"+":"";
  const abs=Math.abs(value);
  return `${prefix}${String(Math.floor(abs/60)).padStart(2,"0")}h${String(abs%60).padStart(2,"0")}`;
}

function todaySP(){
  return new Intl.DateTimeFormat("sv-SE",{
    timeZone:"America/Sao_Paulo",
    year:"numeric",month:"2-digit",day:"2-digit",
  }).format(new Date());
}

function formatDate(value:string|null|undefined){
  if(!value)return "—";
  const raw=String(value).slice(0,10);
  const match=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match?`${match[3]}/${match[2]}/${match[1]}`:raw;
}

function statusLabel(value:string){
  if(value==="PENDENTE")return "Pendente";
  if(value==="APROVADO")return "Aprovado";
  if(value==="REJEITADO")return "Rejeitado";
  return value;
}

type AdjustTimes={
  entrada:string;
  intervalo_inicio:string;
  intervalo_fim:string;
  saida:string;
};

const emptyTimes:AdjustTimes={
  entrada:"",
  intervalo_inicio:"",
  intervalo_fim:"",
  saida:"",
};

export default function App(){
  const [ready,setReady]=useState(false);
  const [authenticated,setAuthenticated]=useState(false);
  const [loginName,setLoginName]=useState("");
  const [password,setPassword]=useState("");
  const [data,setData]=useState<any>(null);
  const [adjustments,setAdjustments]=useState<any[]>([]);
  const [extraRequests,setExtraRequests]=useState<any[]>([]);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [biometricAvailable,setBiometricAvailable]=useState(false);
  const [biometricOn,setBiometricOn]=useState(false);
  const [locked,setLocked]=useState(false);

  const [adjustDate,setAdjustDate]=useState(todaySP());
  const [adjustLoaded,setAdjustLoaded]=useState(false);
  const [adjustTimes,setAdjustTimes]=useState<AdjustTimes>(emptyTimes);
  const [adjustReason,setAdjustReason]=useState("");
  const [pendingAdjustment,setPendingAdjustment]=useState<any>(null);

  const [extraStartDate,setExtraStartDate]=useState(todaySP());
  const [extraStartTime,setExtraStartTime]=useState("");
  const [extraEndDate,setExtraEndDate]=useState(todaySP());
  const [extraEndTime,setExtraEndTime]=useState("");
  const [extraDescription,setExtraDescription]=useState("");

  async function load(){
    try{
      const [dashboard,adjustmentData,extraData]=await Promise.all([
        api<any>("/api/employee/dashboard"),
        api<any>("/api/employee/adjustments"),
        api<any>("/api/employee/extra-work"),
      ]);
      setData(dashboard);
      setAdjustments(adjustmentData.requests||[]);
      setExtraRequests(extraData.requests||[]);
      setAuthenticated(true);
      setError("");
    }catch(e){
      setAuthenticated(false);
      setData(null);
      if((e as Error).message!=="Sessão inválida ou expirada.")setError((e as Error).message);
    }finally{
      setReady(true);
    }
  }

  async function authenticateDevice(){
    await BiometricAuth.authenticate({
      reason:"Desbloquear o CVT Ponto",
      cancelTitle:"Cancelar",
      allowDeviceCredential:true,
      iosFallbackTitle:"Usar código do aparelho",
      androidTitle:"CVT Ponto",
      androidSubtitle:"Confirme sua identidade para acessar o ponto",
      androidConfirmationRequired:false,
    });
  }

  async function unlock(){
    setError("");
    try{
      await authenticateDevice();
      setLocked(false);
      if(!authenticated)await load();
    }catch{
      setLocked(true);
    }
  }

  useEffect(()=>{let listener:{remove:()=>Promise<void>}|undefined;
    void (async()=>{
      const [token,enabled]=await Promise.all([accessToken(),biometricEnabled()]);
      setBiometricOn(enabled);

      try{
        const info=await BiometricAuth.checkBiometry();
        const available=info.isAvailable||info.deviceIsSecure;
        setBiometricAvailable(available);

        listener=await BiometricAuth.addResumeListener(()=>{
          void (async()=>{
            const shouldLock=await biometricEnabled();
            const currentToken=await accessToken();
            if(!shouldLock||!currentToken)return;
            setLocked(true);
            try{
              await authenticateDevice();
              setLocked(false);
            }catch{
              setLocked(true);
            }
          })();
        });

        if(token&&enabled&&available){
          setLocked(true);
          try{
            await authenticateDevice();
            setLocked(false);
            await load();
          }catch{
            setReady(true);
          }
        }else if(token){
          await load();
        }else{
          setReady(true);
        }
      }catch{
        setBiometricAvailable(false);
        if(token)await load();
        else setReady(true);
      }
    })();

    return()=>{void listener?.remove();};
  },[]);

  async function submit(event:FormEvent){
    event.preventDefault();
    setBusy(true);setError("");setNotice("");
    try{
      await login(loginName,password);
      setPassword("");
      await load();
    }catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  }

  async function punch(){
    setBusy(true);setError("");setNotice("");
    try{
      await api("/api/employee/punch",{method:"POST",body:"{}"});
      await load();
      setNotice("Ponto registrado com sucesso.");
    }catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  }

  async function loadAdjustment(){
    setBusy(true);setError("");setNotice("");
    try{
      const result=await api<any>(`/api/employee/adjustments?date=${encodeURIComponent(adjustDate)}`);
      const summary=result.summary||{};
      setAdjustTimes({
        entrada:summary.entrada?String(summary.entrada).slice(0,5):"",
        intervalo_inicio:summary.intervalo_inicio?String(summary.intervalo_inicio).slice(0,5):"",
        intervalo_fim:summary.intervalo_fim?String(summary.intervalo_fim).slice(0,5):"",
        saida:summary.saida?String(summary.saida).slice(0,5):"",
      });
      setPendingAdjustment(result.pending||null);
      setAdjustLoaded(true);
    }catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  }

  async function requestAdjustment(event:FormEvent){
    event.preventDefault();
    if(pendingAdjustment)return;
    setBusy(true);setError("");setNotice("");
    try{
      await api("/api/employee/adjustments",{
        method:"POST",
        body:JSON.stringify({
          date:adjustDate,
          reason:adjustReason,
          ...adjustTimes,
        }),
      });
      setAdjustReason("");
      setAdjustLoaded(false);
      setPendingAdjustment(null);
      await load();
      setNotice("Solicitação de ajuste enviada para aprovação.");
    }catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  }

  async function requestExtra(event:FormEvent){
    event.preventDefault();
    const start=`${formatDate(extraStartDate)} ${extraStartTime}`;
    const end=`${formatDate(extraEndDate)} ${extraEndTime}`;
    if(!window.confirm(`Confirmar crédito de banco?\n\nEntrada: ${start}\nSaída: ${end}\nReferência: ${extraDescription}`))return;

    setBusy(true);setError("");setNotice("");
    try{
      const result=await api<any>("/api/employee/extra-work",{
        method:"POST",
        body:JSON.stringify({
          start_date:extraStartDate,
          start_time:extraStartTime,
          end_date:extraEndDate,
          end_time:extraEndTime,
          description:extraDescription,
        }),
      });
      setExtraStartTime("");
      setExtraEndTime("");
      setExtraDescription("");
      await load();
      setNotice(`Horas adicionais lançadas: +${hours(Number(result.minutes))}.`);
    }catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  }

  async function toggleBiometric(){
    if(!biometricAvailable)return;
    setError("");
    try{
      if(!biometricOn){
        await authenticateDevice();
        await setBiometricEnabled(true);
        setBiometricOn(true);
        setNotice("Proteção do aplicativo ativada neste aparelho.");
      }else{
        await setBiometricEnabled(false);
        setBiometricOn(false);
        setNotice("Proteção do aplicativo desativada neste aparelho.");
      }
    }catch{
      setError("Não foi possível confirmar a identidade no aparelho.");
    }
  }

  async function exit(){
    setBusy(true);
    await logout();
    await setBiometricEnabled(false);
    setBiometricOn(false);
    setAuthenticated(false);
    setData(null);
    setAdjustments([]);
    setExtraRequests([]);
    setBusy(false);
  }

  const blocked=useMemo(()=>["FALTA","ATESTADO"].includes(data?.today?.occurrence_type)
    ||(data?.today?.occurrence_type==="FOLGA"&&data?.today?.occurrence_period==="DIA_TODO"),[data]);

  if(!ready)return <main className="center"><div className="loader">CVT</div></main>;

  if(locked)return <main className="login">
    <section className="loginCard lockCard">
      <div className="brand">CVT</div>
      <p className="eyebrow">ACESSO PROTEGIDO</p>
      <h1>CVT Ponto bloqueado</h1>
      <p className="sub">Confirme sua identidade no aparelho para continuar.</p>
      <button onClick={unlock}>DESBLOQUEAR</button>
    </section>
  </main>;

  if(!authenticated)return <main className="login">
    <section className="loginCard">
      <div className="brand">CVT</div>
      <p className="eyebrow">CORRENTE DA VIDA TREINAMENTOS</p>
      <h1>Cartão Ponto</h1>
      <p className="sub">Acesso seguro do funcionário</p>
      <form onSubmit={submit}>
        <label>Usuário<input value={loginName} onChange={e=>setLoginName(e.target.value)} autoComplete="username" required /></label>
        <label>Senha<input value={password} onChange={e=>setPassword(e.target.value)} type="password" autoComplete="current-password" required /></label>
        {error&&<div className="error">{error}</div>}
        <button disabled={busy}>{busy?"ENTRANDO...":"ENTRAR"}</button>
      </form>
    </section>
  </main>;

  return <main className="app">
    <header>
      <div><p className="eyebrow">CVT PONTO</p><h1>{data?.employee?.name}</h1></div>
      <button className="ghost" onClick={exit} disabled={busy}>Sair</button>
    </header>

    <section className="punchCard">
      <p>Registro de jornada</p>
      <strong>{blocked?data?.today?.status:data?.next_type?labels[data.next_type]:"Jornada concluída"}</strong>
      <button className="punch" onClick={punch} disabled={busy||!data?.next_type}>
        {busy?"PROCESSANDO...":blocked?"REGISTRO BLOQUEADO":data?.next_type?`REGISTRAR ${labels[data.next_type].toUpperCase()}`:"JORNADA CONCLUÍDA"}
      </button>
    </section>

    {error&&<div className="error" onClick={()=>setError("")}>{error}</div>}
    {notice&&<div className="notice" onClick={()=>setNotice("")}>{notice}</div>}

    <section className="metrics">
      <article><span>Trabalhadas</span><strong>{hours(data?.totals?.worked_minutes)}</strong></article>
      <article><span>Positivas</span><strong>{hours(data?.totals?.positive_minutes)}</strong></article>
      <article><span>Negativas</span><strong>{hours(data?.totals?.negative_minutes)}</strong></article>
      <article><span>Banco</span><strong>{hours(data?.totals?.balance_minutes,true)}</strong></article>
    </section>

    <section className="panel">
      <p className="eyebrow">HOJE</p>
      <h2>{data?.today?.status||"SEM REGISTRO"}</h2>
      <div className="times">
        {[
          ["Entrada",data?.today?.entrada],
          ["Início intervalo",data?.today?.intervalo_inicio],
          ["Fim intervalo",data?.today?.intervalo_fim],
          ["Saída",data?.today?.saida],
        ].map(([label,value])=><div key={String(label)}><span>{label}</span><strong>{value?String(value).slice(0,5):"—"}</strong></div>)}
      </div>
    </section>

    <section className="panel actionPanel">
      <div className="sectionTitle">
        <div><p className="eyebrow">CORREÇÃO DE PONTO</p><h2>Solicitar ajuste</h2></div>
        <span className="pill">Aprovação ADM</span>
      </div>
      <div className="compactForm">
        <label>Data
          <input type="date" value={adjustDate} max={todaySP()} onChange={e=>{setAdjustDate(e.target.value);setAdjustLoaded(false);setPendingAdjustment(null);}} />
        </label>
        <button type="button" className="secondary" onClick={loadAdjustment} disabled={busy}>CARREGAR PONTO</button>
      </div>
      {adjustLoaded&&<form className="formGrid" onSubmit={requestAdjustment}>
        <label>Entrada<input type="time" value={adjustTimes.entrada} onChange={e=>setAdjustTimes(v=>({...v,entrada:e.target.value}))} /></label>
        <label>Início intervalo<input type="time" value={adjustTimes.intervalo_inicio} onChange={e=>setAdjustTimes(v=>({...v,intervalo_inicio:e.target.value}))} /></label>
        <label>Fim intervalo<input type="time" value={adjustTimes.intervalo_fim} onChange={e=>setAdjustTimes(v=>({...v,intervalo_fim:e.target.value}))} /></label>
        <label>Saída<input type="time" value={adjustTimes.saida} onChange={e=>setAdjustTimes(v=>({...v,saida:e.target.value}))} /></label>
        <label className="wide">Motivo<input value={adjustReason} onChange={e=>setAdjustReason(e.target.value)} minLength={3} maxLength={240} placeholder="Ex.: esqueci de registrar a saída" required /></label>
        <button className="primary wide" disabled={busy||!!pendingAdjustment}>
          {pendingAdjustment?"SOLICITAÇÃO JÁ PENDENTE":"ENVIAR PARA APROVAÇÃO"}
        </button>
      </form>}
    </section>

    <section className="panel actionPanel extraPanel">
      <div className="sectionTitle">
        <div><p className="eyebrow">BANCO DE HORAS</p><h2>Lançar horas adicionais</h2></div>
        <span className="pill">Confirmação</span>
      </div>
      <form className="formGrid" onSubmit={requestExtra}>
        <label>Data da entrada<input type="date" value={extraStartDate} max={todaySP()} onChange={e=>setExtraStartDate(e.target.value)} required /></label>
        <label>Hora da entrada<input type="time" value={extraStartTime} onChange={e=>setExtraStartTime(e.target.value)} required /></label>
        <label>Data da saída<input type="date" value={extraEndDate} max={todaySP()} onChange={e=>setExtraEndDate(e.target.value)} required /></label>
        <label>Hora da saída<input type="time" value={extraEndTime} onChange={e=>setExtraEndTime(e.target.value)} required /></label>
        <label className="wide">Referência / motivo<input value={extraDescription} onChange={e=>setExtraDescription(e.target.value)} minLength={3} maxLength={160} placeholder="Ex.: Treinamento Karsten" required /></label>
        <button className="primary wide" disabled={busy}>VALIDAR E LANÇAR NO BANCO</button>
      </form>
    </section>

    <section className="panel">
      <p className="eyebrow">HISTÓRICO</p>
      <h2>Solicitações de ajuste</h2>
      <div className="historyList">
        {adjustments.length?adjustments.map(request=><article key={request.id} className="historyItem">
          <div><strong>{formatDate(request.work_date)}</strong><span>{request.reason}</span></div>
          <span className={`status ${String(request.status).toLowerCase()}`}>{statusLabel(request.status)}</span>
        </article>):<p className="empty">Nenhuma solicitação enviada.</p>}
      </div>
    </section>

    <section className="panel">
      <p className="eyebrow">BANCO DE HORAS</p>
      <h2>Horas adicionais</h2>
      <div className="historyList">
        {extraRequests.length?extraRequests.map(request=><article key={request.id} className="historyItem">
          <div>
            <strong>+{hours(Number(request.minutes))}</strong>
            <span>{formatDate(request.start_date)} {String(request.start_time).slice(0,5)} → {formatDate(request.end_date)} {String(request.end_time).slice(0,5)}</span>
            <small>{request.description}</small>
          </div>
        </article>):<p className="empty">Nenhuma hora adicional lançada.</p>}
      </div>
    </section>

    {biometricAvailable&&<section className="panel securityPanel">
      <div className="sectionTitle">
        <div><p className="eyebrow">SEGURANÇA</p><h2>Proteção do aplicativo</h2></div>
        <span className={`status ${biometricOn?"aprovado":"pendente"}`}>{biometricOn?"Ativada":"Opcional"}</span>
      </div>
      <p className="securityText">Use Face ID, impressão digital ou a credencial segura do aparelho para desbloquear o CVT Ponto ao abrir ou retornar ao aplicativo.</p>
      <button className={biometricOn?"secondary securityButton":"primary securityButton"} onClick={toggleBiometric}>
        {biometricOn?"DESATIVAR PROTEÇÃO":"ATIVAR PROTEÇÃO"}
      </button>
    </section>}

    <section className="panel">
      <p className="eyebrow">RESUMO</p>
      <h2>Últimos registros</h2>
      <div className="historyList">
        {data?.recent?.length?data.recent.map((record:any)=><article key={record.date} className="historyItem">
          <div>
            <strong>{formatDate(record.date)}</strong>
            <span>{record.status}</span>
          </div>
          <div className="historyNumbers">
            <small>Trabalhado {hours(record.worked_minutes)}</small>
            <strong>{hours(record.balance_minutes,true)}</strong>
          </div>
        </article>):<p className="empty">Nenhum registro encontrado.</p>}
      </div>
    </section>
  </main>;
}
