"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export default function AdminPendingNotice(){
  const pathname=usePathname();
  const [pending,setPending]=useState(0);
  const [toastVisible,setToastVisible]=useState(false);
  const [panelOpen,setPanelOpen]=useState(false);
  const previousPending=useRef(0);
  const toastTimer=useRef<number|null>(null);

  useEffect(()=>{
    if(pathname!=="/admin"){
      setPending(0);
      setToastVisible(false);
      setPanelOpen(false);
      previousPending.current=0;
      if(toastTimer.current)window.clearTimeout(toastTimer.current);
      return;
    }

    let active=true;
    const load=async()=>{
      try{
        const response=await fetch("/api/admin/adjustment-requests",{cache:"no-store"});
        if(!response.ok)return;
        const data=await response.json();
        if(!active)return;

        const requests=Array.isArray(data.requests)?data.requests:[];
        const nextPending=requests.filter((item:any)=>item.status==="PENDENTE").length;
        const shouldNotify=nextPending>0&&(previousPending.current===0||nextPending>previousPending.current);

        setPending(nextPending);
        if(nextPending===0){
          setToastVisible(false);
          setPanelOpen(false);
        }else if(shouldNotify){
          setToastVisible(true);
          if(toastTimer.current)window.clearTimeout(toastTimer.current);
          toastTimer.current=window.setTimeout(()=>setToastVisible(false),10000);
        }
        previousPending.current=nextPending;
      }catch{
        // Mantém o painel funcionando mesmo se a consulta da notificação falhar.
      }
    };

    void load();
    const interval=window.setInterval(()=>void load(),30000);
    return()=>{
      active=false;
      window.clearInterval(interval);
      if(toastTimer.current)window.clearTimeout(toastTimer.current);
    };
  },[pathname]);

  if(pathname!=="/admin"||pending<=0)return null;

  return <>
    <button
      type="button"
      aria-label={`${pending} ${pending===1?"ajuste pendente":"ajustes pendentes"}`}
      title="Ajustes pendentes"
      onClick={()=>setPanelOpen(v=>!v)}
      style={{
        position:"fixed",
        top:18,
        right:18,
        zIndex:1002,
        width:46,
        height:46,
        borderRadius:14,
        border:"1px solid #cbd5e1",
        background:"#ffffff",
        boxShadow:"0 8px 22px rgba(15,23,42,.13)",
        cursor:"pointer",
        display:"grid",
        placeItems:"center",
        fontSize:21,
        color:"#334155",
      }}
    >
      <span aria-hidden="true">🔔</span>
      <span style={{
        position:"absolute",
        top:-6,
        right:-6,
        minWidth:21,
        height:21,
        padding:"0 5px",
        borderRadius:999,
        background:"#ea580c",
        color:"#fff",
        fontSize:11,
        fontWeight:800,
        display:"grid",
        placeItems:"center",
        border:"2px solid #fff",
      }}>{pending>99?"99+":pending}</span>
    </button>

    {panelOpen&&<div style={{
      position:"fixed",
      top:72,
      right:18,
      zIndex:1001,
      width:"min(340px, calc(100vw - 36px))",
      background:"#fff",
      border:"1px solid #e2e8f0",
      borderRadius:14,
      padding:"14px 16px",
      boxShadow:"0 12px 30px rgba(15,23,42,.14)",
      color:"#334155",
      fontFamily:"inherit",
    }}>
      <strong style={{display:"block",fontSize:14,marginBottom:4,color:"#0f172a"}}>
        {pending===1?"1 ajuste pendente":`${pending} ajustes pendentes`}
      </strong>
      <span style={{fontSize:13,lineHeight:1.45}}>
        Acesse “Solicitações de ajuste” no menu para analisar {pending===1?"a solicitação":"as solicitações"}.
      </span>
    </div>}

    {toastVisible&&<div
      role="status"
      aria-live="polite"
      style={{
        position:"fixed",
        top:78,
        right:18,
        zIndex:1000,
        maxWidth:360,
        background:"#fff7ed",
        border:"1px solid #fdba74",
        borderLeft:"5px solid #f97316",
        borderRadius:12,
        padding:"14px 16px",
        boxShadow:"0 10px 28px rgba(15,23,42,.14)",
        color:"#334155",
        fontFamily:"inherit"
      }}
    >
      <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
        <span aria-hidden="true" style={{fontSize:20,lineHeight:1}}>🔔</span>
        <div>
          <strong style={{display:"block",fontSize:14,color:"#9a3412",marginBottom:3}}>
            {pending===1?"1 ajuste aguardando aprovação":`${pending} ajustes aguardando aprovação`}
          </strong>
          <span style={{fontSize:13,lineHeight:1.4}}>
            Este aviso fecha automaticamente em 10 segundos. A pendência continuará disponível no sino de notificações.
          </span>
        </div>
      </div>
    </div>}
  </>;
}
