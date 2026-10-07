import type { CapacitorConfig } from "@capacitor/cli";

const config:CapacitorConfig={
  appId:"br.com.cvtcursos.ponto",
  appName:"CVT Ponto",
  webDir:"dist",
  server:{
    hostname:"localhost",
    iosScheme:"capacitor",
    androidScheme:"https"
  },
  plugins:{
    CapacitorHttp:{enabled:true}
  },
  ios:{
    contentInset:"automatic"
  }
};

export default config;
