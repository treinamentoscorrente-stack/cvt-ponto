import { FormEvent, useEffect, useMemo, useState } from "react";
import { accessToken } from "./auth";
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

export default function App(){
  const [ready,setReady]=useState(false);
  const [authenticated,setAuthenticated]=useState(false);
  const [loginName,setLoginName]=useState("");
  const [password,setPassword]=useState("");
  const [data,setData]=useState<any>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);

  async function load(){
    try{
      const dashboard=await api("/api/employee/dashboard");
      setData(dashboard);
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

  useEffect(()=>{void (async()=>{
    const token=await accessToken();
    if(token)await load();
    else setReady(true);
  })();},[]);

  async function submit(event:FormEvent){
    event.preventDefault();
    setBusy(true);setError("");
    try{
      await login(loginName,password);
      setPassword("");
      await load();
    }catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  }

  async function punch(){
    setBusy(true);setError("");
    try{
      await api("/api/employee/punch",{method:"POST",body:"{}"});
      await load();
    }catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  }

  async function exit(){
    setBusy(true);
    await logout();
    setAuthenticated(false);
    setData(null);
    setBusy(false);
  }

  const blocked=useMemo(()=>["FALTA","ATESTADO"].includes(data?.today?.occurrence_type)
    ||(data?.today?.occurrence_type==="FOLGA"&&data?.today?.occurrence_period==="DIA_TODO"),[data]);

  if(!ready)return <main className="center"><div className="loader">CVT</div></main>;

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

    {error&&<div className="error">{error}</div>}

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
        ].map(([label,value])=><div key={label}><span>{label}</span><strong>{value?String(value).slice(0,5):"—"}</strong></div>)}
      </div>
    </section>
  </main>;
}
