const CSRF_KEY="cvt_csrf";

function currentCsrf(){
  return typeof window==="undefined"?"":sessionStorage.getItem(CSRF_KEY)||"";
}

async function syncCsrf(){
  const response=await fetch("/api/auth/me",{cache:"no-store"});
  if(!response.ok)return false;
  const data=await response.json();
  if(!data?.csrf)return false;
  sessionStorage.setItem(CSRF_KEY,String(data.csrf));
  return true;
}

async function parseJson(response:Response){
  try{return await response.json();}
  catch{return {};}
}

export async function apiRequest<T=any>(
  url:string,
  options:RequestInit={},
  onUnauthorized?:()=>void,
  retryCsrf=true,
):Promise<T>{
  const headers=new Headers(options.headers);
  if(options.body&&!headers.has("content-type"))headers.set("content-type","application/json");
  const method=(options.method||"GET").toUpperCase();
  if(method!=="GET"&&method!=="HEAD")headers.set("x-csrf-token",currentCsrf());

  const response=await fetch(url,{...options,headers});
  const data=await parseJson(response);

  if(response.status===401){
    onUnauthorized?.();
    throw new Error("Sessão expirada.");
  }

  if(
    response.status===403
    && retryCsrf
    && typeof data?.error==="string"
    && data.error.includes("Token de segurança inválido")
    && await syncCsrf()
  ){
    return apiRequest<T>(url,options,onUnauthorized,false);
  }

  if(!response.ok)throw new Error(data?.error||"Erro");
  return data as T;
}

export function storeCsrf(token:string){
  sessionStorage.setItem(CSRF_KEY,token);
}

export function clearCsrf(){
  sessionStorage.removeItem(CSRF_KEY);
}
