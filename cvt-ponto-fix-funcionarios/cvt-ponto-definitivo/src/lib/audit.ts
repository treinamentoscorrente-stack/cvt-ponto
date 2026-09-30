import { db } from "@/lib/db";
export async function audit(actorRole:string, actorId:number|null, action:string, details:Record<string,unknown>, ip:string) {
  await db.query(`INSERT INTO audit_log(actor_role,actor_id,action,details,ip_address) VALUES($1,$2,$3,$4::jsonb,$5)`, [actorRole, actorId, action, JSON.stringify(details), ip]);
}
