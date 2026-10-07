import { NextResponse } from "next/server";
import { revokeMobileSession } from "@/lib/auth";
import { jsonError } from "@/lib/http";

export const runtime="nodejs";

export async function POST(request:Request){
  try{
    const authorization=request.headers.get("authorization")||"";
    const token=authorization.match(/^Bearer\s+(.+)$/i)?.[1]||"";
    if(token)await revokeMobileSession(token);
    return NextResponse.json({ok:true},{headers:{"cache-control":"no-store"}});
  }catch{
    return jsonError("Não foi possível encerrar a sessão.",400);
  }
}
