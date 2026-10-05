export function formatMinutes(value:number|null|undefined,showPositive=false){
  if(value==null)return "—";
  const sign=value<0?"-":showPositive&&value>0?"+":"";
  const absolute=Math.abs(value);
  return `${sign}${String(Math.floor(absolute/60)).padStart(2,"0")}h${String(absolute%60).padStart(2,"0")}`;
}

export function todaySaoPaulo(){
  return new Intl.DateTimeFormat("sv-SE",{
    timeZone:"America/Sao_Paulo",
    year:"numeric",
    month:"2-digit",
    day:"2-digit",
  }).format(new Date());
}

export function formatDateBR(value:string|null|undefined){
  if(!value)return "—";
  const raw=String(value).slice(0,10);
  const match=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match?`${match[3]}/${match[2]}/${match[1]}`:value;
}

export function formatMonthBR(value:string|null|undefined){
  if(!value)return "Selecione um período";
  const match=String(value).match(/^(\d{4})-(\d{2})$/);
  return match?`${match[2]}/${match[1]}`:value;
}

export function formatCpfBR(value:string|null|undefined){
  const digits=String(value??"").replace(/\D/g,"");
  if(digits.length!==11)return value||"—";
  return `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9)}`;
}
