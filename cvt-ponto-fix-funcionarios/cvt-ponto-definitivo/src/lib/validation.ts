export const LOGIN_RE = /^[A-Za-z0-9._-]{3,40}$/;

export function cleanCpf(value: string) { return value.replace(/\D/g, ""); }
export function validCpf(value: string) {
  const cpf = cleanCpf(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (base: number[], start: number) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) sum += base[i] * (start - i);
    const n = (sum * 10) % 11;
    return n === 10 ? 0 : n;
  };
  const nums = cpf.split("").map(Number);
  const d1 = digit(nums.slice(0, 9), 10);
  const d2 = digit([...nums.slice(0, 9), d1], 11);
  return nums[9] === d1 && nums[10] === d2;
}
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y,m,d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m-1 && date.getUTCDate() === d;
}
export function validMonth(value: string) { return /^\d{4}-\d{2}$/.test(value); }
