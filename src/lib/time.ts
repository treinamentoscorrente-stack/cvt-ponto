const TZ = "America/Sao_Paulo";
function parts(date = new Date()) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  }).formatToParts(date).filter(p => p.type !== "literal").map(p => [p.type, p.value]));
}
export function saoPauloNow() {
  const p = parts();
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}:${p.second}`, iso: new Date().toISOString() };
}
export function weekend(date: string) {
  const [y,m,d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y, m-1, d)).getUTCDay();
  return day === 0 || day === 6;
}
export function timeMinutes(value: string) { const [h,m] = value.split(":").map(Number); return h*60+m; }
