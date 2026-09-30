import { NextResponse } from "next/server";
export function jsonError(error:string,status=400){return NextResponse.json({error},{status,headers:{"cache-control":"no-store"}})}
export async function jsonBody(request:Request,max=16_384){const len=Number(request.headers.get("content-length")||0);if(len>max)throw new Error("BODY");const data=await request.json();if(!data||typeof data!=="object"||Array.isArray(data))throw new Error("BODY");return data as Record<string,unknown>}
