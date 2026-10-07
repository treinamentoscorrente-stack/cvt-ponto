import { Capacitor } from "@capacitor/core";
import { accessToken, clearTokens, refreshToken, saveTokens } from "./auth";

const configuredBase=String(import.meta.env.VITE_CVT_API_URL||"").replace(/\/$/,"");
const API_BASE=Capacitor.isNativePlatform()?configuredBase:"";

type RequestOptions=RequestInit&{auth?:boolean;retry?:boolean};

function apiUrl(path:string){
  if(Capacitor.isNativePlatform()&&!API_BASE){
    throw new Error("VITE_CVT_API_URL não foi configurada no build do aplicativo.");
  }
  return `${API_BASE}${path}`;
}

async function parse(response:Response){
  try{return await response.json();}
  catch{return {};}
}

async function renew(){
  const token=await refreshToken();
  if(!token)return false;
  const response=await fetch(apiUrl("/api/mobile/auth/refresh"),{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({refresh_token:token}),
  });
  const data=await parse(response);
  if(!response.ok||!data.accessToken||!data.refreshToken){
    await clearTokens();
    return false;
  }
  await saveTokens(String(data.accessToken),String(data.refreshToken));
  return true;
}

export async function api<T=any>(path:string,options:RequestOptions={}):Promise<T>{
  const {auth=true,retry=true,...fetchOptions}=options;
  const headers=new Headers(fetchOptions.headers);
  if(fetchOptions.body&&!headers.has("content-type"))headers.set("content-type","application/json");
  if(auth){
    const token=await accessToken();
    if(token)headers.set("authorization",`Bearer ${token}`);
  }

  const response=await fetch(apiUrl(path),{...fetchOptions,headers});
  const data=await parse(response);

  if(response.status===401&&auth&&retry&&await renew()){
    return api<T>(path,{...options,retry:false});
  }
  if(!response.ok)throw new Error(data?.error||"Não foi possível concluir a operação.");
  return data as T;
}

export async function login(login:string,password:string){
  const data=await api<any>("/api/mobile/auth/login",{
    method:"POST",
    auth:false,
    body:JSON.stringify({
      login,
      password,
      device_name:`${Capacitor.getPlatform()} - CVT Ponto`,
    }),
  });
  await saveTokens(String(data.accessToken),String(data.refreshToken));
  return data;
}

export async function logout(){
  try{await api("/api/mobile/auth/logout",{method:"POST"});}
  finally{await clearTokens();}
}
