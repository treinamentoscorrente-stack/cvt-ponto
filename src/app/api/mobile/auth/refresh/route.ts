import { NextResponse } from "next/server";
import { refreshMobileSession } from "@/lib/auth";
import { jsonBody, jsonError } from "@/lib/http";

export const runtime="nodejs";

export async function POST(request:Request){
  try{
    const body=await jsonBody(request);
    const token=String(body.refresh_token||"");
    if(token.length<20)return jsonError("Sessão móvel inválida.",401);

    const session=await refreshMobileSession(token);
    if(!session)return jsonError("Sessão móvel expirada.",401);

    return NextResponse.json({
      ok:true,
      role:session.role,
      accessToken:session.accessToken,
      refreshToken:session.refreshToken,
      accessExpiresAt:session.accessExpiresAt,
      refreshExpiresAt:session.refreshExpiresAt,
    },{headers:{"cache-control":"no-store"}});
  }catch{
    return jsonError("Não foi possível renovar a sessão.",400);
  }
}
