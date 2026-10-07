import { SecureStorage } from "@aparajita/capacitor-secure-storage";

const PREFIX="cvt-ponto_";
const ACCESS="access-token";
const REFRESH="refresh-token";

let initialized=false;

async function init(){
  if(initialized)return;
  await SecureStorage.setKeyPrefix(PREFIX);
  await SecureStorage.setSynchronize(false);
  initialized=true;
}

export async function saveTokens(accessToken:string,refreshToken:string){
  await init();
  await Promise.all([
    SecureStorage.setItem(ACCESS,accessToken),
    SecureStorage.setItem(REFRESH,refreshToken),
  ]);
}

export async function accessToken(){
  await init();
  return SecureStorage.getItem(ACCESS);
}

export async function refreshToken(){
  await init();
  return SecureStorage.getItem(REFRESH);
}

export async function clearTokens(){
  await init();
  await Promise.all([
    SecureStorage.removeItem(ACCESS),
    SecureStorage.removeItem(REFRESH),
  ]);
}
