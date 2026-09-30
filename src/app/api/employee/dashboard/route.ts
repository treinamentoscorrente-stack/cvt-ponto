import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { summariesForEmployee, aggregate, summaryForDate, nextPunchType } from "@/lib/ponto";
import { extraMinutesForEmployee, extraSessionsForEmployee, totalsWithExtra } from "@/lib/extra-work";
import { saoPauloNow } from "@/lib/time";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireSession("employee");
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const emp = (await db.query(
    "SELECT id,name,login FROM employees WHERE id=$1",
    [auth.session.userId],
  )).rows[0];

  const now = saoPauloNow();
  const currentMonth = now.date.slice(0,7);
  const [summaries, recentSummaries, extraSessions, extraMinutes] = await Promise.all([
    summariesForEmployee(auth.session.userId, currentMonth),
    summariesForEmployee(auth.session.userId),
    extraSessionsForEmployee(auth.session.userId, currentMonth),
    extraMinutesForEmployee(auth.session.userId, currentMonth),
  ]);
  const today = await summaryForDate(auth.session.userId, now.date);
  const nextType = await nextPunchType(auth.session.userId, now.date);
  return NextResponse.json({
    employee: { id: Number(emp.id), name: emp.name, login: emp.login },
    server_time: new Date().toISOString(),
    today,
    next_type: nextType,
    recent_extra: extraSessions.slice(0,10),
    totals: totalsWithExtra(aggregate(summaries), extraMinutes),
    recent: recentSummaries.slice(0,10),
  }, { headers: { "cache-control": "no-store" } });
}
