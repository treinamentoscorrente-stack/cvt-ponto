"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export default function AdminPendingNotice(){
  const pathname=usePathname();
  const [pending,setPending]=useState(0);

  useEffect(()=>{
    if(pathname!=="/admin"){
      setPending(0);
      return;
    }

    let active=true;
    const load=async()=>{
      try{
        const response=await fetch("/api/admin/adjustment-requests",{cache:"no-store"});
        if(!response.ok)return;
        const data=await response.json();
        if(active){
          const requests=Array.isArray(data.requests)?data.requests:[];
          setPending(requests.filter((item:any)=>item.status==="PENDENTE").length);
        }
      }catch{
        // Mantém o painel funcionando mesmo se a consulta da notificação falhar.
      }
    };

    void load();
    const interval=window.setInterval(()=>void load(),30000);
    return()=>{
      active=false;
      window.clearInterval(interval);
    };
  },[pathname]);

  if(pathname!=="/admin"||pending<=0)return null;

  return <div
    role="status"
    aria-live="polite"
    style={{
      position:"fixed",
      top:18,
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
          Acesse “Solicitações de ajuste” no menu para analisar {pending===1?"a solicitação":"as solicitações"}.
        </span>
      </div>
    </div>
  </div>;
}
