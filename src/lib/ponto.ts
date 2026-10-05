import { db } from "@/lib/db";
import { saoPauloNow, weekend, timeMinutes } from "@/lib/time";

export const TYPES = ["ENTRADA","INTERVALO_INICIO","INTERVALO_FIM","SAIDA"] as const;
export type PunchType = typeof TYPES[number];
export type OccurrenceType = "FALTA" | "FOLGA" | "ATESTADO";
export type OccurrencePeriod = "DIA_TODO" | "MANHA" | "TARDE";

export type DayOccurrence = {
  id?: number;
  occurrence_type: OccurrenceType;
  period: OccurrencePeriod;
  note: string | null;
};

export type DaySummary = {
  date: string;
  entrada: string | null;
  intervalo_inicio: string | null;
  intervalo_fim: string | null;
  saida: string | null;
  worked_minutes: number | null;
  expected_minutes: number | null;
  balance_minutes: number | null;
  bank_debit_minutes: number;
  status: string;
  punch_count: number;
  occurrence_type: OccurrenceType | null;
  occurrence_period: OccurrencePeriod | null;
  note: string | null;
  holiday_description: string | null;
};

async function companyDailyMinutes() {
  const company = await db.query(`SELECT daily_minutes FROM company WHERE id=1`);
  return Number(company.rows[0]?.daily_minutes ?? 480);
}

async function regularWeekdayExpected(date: string, suppliedDailyMinutes?: number) {
  if (weekend(date)) return 0;
  return suppliedDailyMinutes ?? companyDailyMinutes();
}

export async function baseExpected(date: string) {
  if (weekend(date)) return 0;
  const holiday = await db.query(`SELECT 1 FROM holidays WHERE holiday_date=$1`, [date]);
  if (holiday.rowCount) return 0;
  return regularWeekdayExpected(date);
}

export async function getOccurrence(employeeId: number, date: string): Promise<DayOccurrence | null> {
  const result = await db.query(
    `SELECT id,occurrence_type,period,note
     FROM attendance_occurrences
     WHERE employee_id=$1 AND work_date=$2`,
    [employeeId, date],
  );
  if (!result.rows[0]) return null;
  return {
    id: Number(result.rows[0].id),
    occurrence_type: result.rows[0].occurrence_type,
    period: result.rows[0].period,
    note: result.rows[0].note ?? null,
  };
}

export async function dailyExpected(date: string, occurrence?: DayOccurrence | null) {
  const base = await baseExpected(date);
  if (!occurrence) return base;
  if (occurrence.occurrence_type === "ATESTADO") return 0;
  if (occurrence.occurrence_type === "FOLGA") {
    if (occurrence.period === "DIA_TODO") return 0;
    return Math.round(base / 2);
  }
  return base;
}

export async function bankDebitMinutes(date: string, occurrence?: DayOccurrence | null) {
  if (occurrence?.occurrence_type !== "FOLGA") return 0;
  const base = await baseExpected(date);
  if (occurrence.period === "DIA_TODO") return base;
  return Math.round(base / 2);
}

export function expectedPunchTypes(occurrence?: DayOccurrence | null): PunchType[] {
  if (occurrence?.occurrence_type === "FALTA" || occurrence?.occurrence_type === "ATESTADO") return [];
  if (occurrence?.occurrence_type === "FOLGA") {
    if (occurrence.period === "DIA_TODO") return [];
    return ["ENTRADA", "SAIDA"];
  }
  return [...TYPES];
}

function labelOccurrence(occurrence: DayOccurrence | null) {
  if (!occurrence) return "";
  if (occurrence.occurrence_type === "FALTA") return "FALTA";
  if (occurrence.occurrence_type === "ATESTADO") return "ATESTADO";
  if (occurrence.period === "MANHA") return "FOLGA MANHÃ";
  if (occurrence.period === "TARDE") return "FOLGA TARDE";
  return "FOLGA";
}

function outcome(balance: number) {
  return balance > 0 ? "POSITIVO" : balance < 0 ? "NEGATIVO" : "CUMPRIDA";
}

function calcWorked(by: Record<string,string>) {
  if (by.ENTRADA && by.SAIDA && !by.INTERVALO_INICIO && !by.INTERVALO_FIM) {
    return timeMinutes(by.SAIDA) - timeMinutes(by.ENTRADA);
  }
  if (by.ENTRADA && by.INTERVALO_INICIO && by.INTERVALO_FIM && by.SAIDA) {
    return (timeMinutes(by.INTERVALO_INICIO) - timeMinutes(by.ENTRADA))
      + (timeMinutes(by.SAIDA) - timeMinutes(by.INTERVALO_FIM));
  }
  return null;
}

function expectedForOccurrence(base: number, occurrence: DayOccurrence | null) {
  if (!occurrence) return base;
  if (occurrence.occurrence_type === "ATESTADO") return 0;
  if (occurrence.occurrence_type === "FOLGA") {
    return occurrence.period === "DIA_TODO" ? 0 : Math.round(base / 2);
  }
  return base;
}

function debitForOccurrence(base: number, occurrence: DayOccurrence | null) {
  if (occurrence?.occurrence_type !== "FOLGA") return 0;
  return occurrence.period === "DIA_TODO" ? base : Math.round(base / 2);
}

export async function summarizeRows(
  employeeId: number,
  date: string,
  rows: Array<{punch_type:string;punch_time:string}>,
  suppliedOccurrence?: DayOccurrence | null,
  suppliedHoliday?: string | null,
  suppliedDailyMinutes?: number,
): Promise<DaySummary> {
  const occurrence = suppliedOccurrence === undefined ? await getOccurrence(employeeId, date) : suppliedOccurrence;
  let holidayDescription = suppliedHoliday ?? null;
  if (suppliedHoliday === undefined) {
    const h = await db.query(`SELECT description FROM holidays WHERE holiday_date=$1`, [date]);
    holidayDescription = h.rows[0]?.description ?? null;
  }

  const regularExpected = await regularWeekdayExpected(date, suppliedDailyMinutes);
  const base = holidayDescription ? 0 : regularExpected;
  const by = Object.fromEntries(rows.map(r => [r.punch_type, String(r.punch_time).slice(0,8)]));
  const nowDate = saoPauloNow().date;
  const future = date > nowDate;
  const occurrenceLabel = labelOccurrence(occurrence);
  let expected = expectedForOccurrence(base, occurrence);
  const bankDebit = debitForOccurrence(base, occurrence);

  // Em feriado de dia útil com jornada registrada, a carga normal do dia é
  // usada como referência para não transformar toda a jornada em saldo positivo.
  if (holidayDescription && rows.length > 0 && !occurrence) {
    expected = regularExpected;
  }

  let worked: number | null = null;
  let balance: number | null = null;
  let status = "SEM REGISTRO";

  if (future) {
    if (occurrence?.occurrence_type === "FOLGA") {
      worked = 0;
      balance = -bankDebit;
      status = `${occurrenceLabel} — PROGRAMADA — DÉBITO ${Math.round(bankDebit/60)}H`;
    } else if (occurrenceLabel) status = `${occurrenceLabel} — PROGRAMADA`;
    else if (holidayDescription) status = "FERIADO";
  } else if (occurrence?.occurrence_type === "FALTA" && rows.length === 0) {
    worked = 0;
    balance = -expected;
    status = "FALTA";
  } else if (occurrence?.occurrence_type === "ATESTADO" && rows.length === 0) {
    worked = 0;
    balance = 0;
    status = "ATESTADO";
  } else if (occurrence?.occurrence_type === "FOLGA" && occurrence.period === "DIA_TODO" && rows.length === 0) {
    worked = 0;
    balance = -bankDebit;
    status = `FOLGA — DÉBITO ${Math.round(bankDebit/60)}H`;
  } else if (holidayDescription && rows.length === 0 && !occurrence) {
    worked = 0;
    balance = 0;
    status = "FERIADO";
  } else if (weekend(date) && rows.length === 0 && !occurrence) {
    worked = 0;
    balance = 0;
    status = "FIM DE SEMANA";
  } else {
    worked = calcWorked(by);
    if (worked !== null) {
      balance = worked - expected - bankDebit;
      const result = outcome(balance);
      status = occurrenceLabel
        ? `${occurrenceLabel} — ${result}`
        : holidayDescription
          ? `FERIADO — ${result}`
          : result;
    } else if (rows.length > 0) {
      const partial = date === nowDate ? "EM ANDAMENTO" : "JORNADA INCOMPLETA";
      if (occurrence?.occurrence_type === "FOLGA") balance = -bankDebit;
      status = occurrenceLabel ? `${occurrenceLabel} — ${partial}` : partial;
    } else if (occurrence?.occurrence_type === "FOLGA" && occurrence.period !== "DIA_TODO") {
      worked = 0;
      balance = -bankDebit;
      status = `${occurrenceLabel} — DÉBITO ${Math.round(bankDebit/60)}H`;
    }
  }

  return {
    date,
    entrada: by.ENTRADA ?? null,
    intervalo_inicio: by.INTERVALO_INICIO ?? null,
    intervalo_fim: by.INTERVALO_FIM ?? null,
    saida: by.SAIDA ?? null,
    worked_minutes: worked,
    expected_minutes: worked === null && !["FALTA","ATESTADO","FOLGA","FERIADO"].includes(status) && !status.includes("FOLGA ") ? null : expected,
    balance_minutes: balance,
    bank_debit_minutes: bankDebit,
    status,
    punch_count: rows.length,
    occurrence_type: occurrence?.occurrence_type ?? null,
    occurrence_period: occurrence?.period ?? null,
    note: occurrence?.note ?? null,
    holiday_description: holidayDescription,
  };
}

export async function summaryForDate(employeeId: number, date: string) {
  const punches = await db.query(
    `SELECT punch_time::text AS punch_time,punch_type
     FROM punches WHERE employee_id=$1 AND work_date=$2 ORDER BY punch_time ASC`,
    [employeeId, date],
  );
  return summarizeRows(employeeId, date, punches.rows);
}

export async function nextPunchType(employeeId: number, date: string): Promise<PunchType | null> {
  const occurrence = await getOccurrence(employeeId, date);
  const sequence = expectedPunchTypes(occurrence);
  if (!sequence.length) return null;
  const result = await db.query(
    `SELECT punch_type FROM punches WHERE employee_id=$1 AND work_date=$2 ORDER BY punch_time ASC`,
    [employeeId, date],
  );
  const existing = new Set(result.rows.map(r => String(r.punch_type)));
  return sequence.find(t => !existing.has(t)) ?? null;
}

export async function summariesForEmployee(employeeId: number, month?: string) {
  const values: any[] = [employeeId];
  let punchFilter = "employee_id=$1";
  let occurrenceFilter = "employee_id=$1";

  if (month) {
    const monthStart = `${month}-01`;
    values.push(monthStart);
    punchFilter += " AND work_date >= $2::date AND work_date < ($2::date + interval '1 month')";
    occurrenceFilter += " AND work_date >= $2::date AND work_date < ($2::date + interval '1 month')";
  }

  const [punchResult, occurrenceResult, dailyMinutes] = await Promise.all([
    db.query(
      `SELECT work_date::text AS work_date,punch_time::text AS punch_time,punch_type
       FROM punches WHERE ${punchFilter} ORDER BY work_date DESC,punch_time ASC`,
      values,
    ),
    db.query(
      `SELECT id,work_date::text AS work_date,occurrence_type,period,note
       FROM attendance_occurrences WHERE ${occurrenceFilter} ORDER BY work_date DESC`,
      values,
    ),
    companyDailyMinutes(),
  ]);

  const grouped = new Map<string,Array<{punch_type:string;punch_time:string}>>();
  for (const r of punchResult.rows) {
    const a = grouped.get(r.work_date) ?? [];
    a.push(r);
    grouped.set(r.work_date, a);
  }

  const occurrences = new Map<string,DayOccurrence>();
  for (const r of occurrenceResult.rows) {
    occurrences.set(r.work_date, {
      id: Number(r.id),
      occurrence_type: r.occurrence_type,
      period: r.period,
      note: r.note ?? null,
    });
  }

  const dates = new Set<string>([...grouped.keys(), ...occurrences.keys()]);
  const holidays = new Map<string,string>();

  if (month) {
    const employee = await db.query(`SELECT admission_date::text AS admission_date FROM employees WHERE id=$1`, [employeeId]);
    const admission = employee.rows[0]?.admission_date ?? "9999-12-31";

    const [year,monthNumber] = month.split("-").map(Number);
    const monthStart = `${month}-01`;
    const nextMonthStart = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0,10);
    const monthEnd = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0,10);
    const today = saoPauloNow().date;
    const effectiveEnd = month < today.slice(0,7) ? monthEnd : month === today.slice(0,7) ? today : "";
    const effectiveStart = admission > monthStart ? admission : monthStart;

    if (effectiveEnd && effectiveStart <= effectiveEnd) {
      const cursor = new Date(`${effectiveStart}T00:00:00Z`);
      const end = new Date(`${effectiveEnd}T00:00:00Z`);
      while (cursor <= end) {
        dates.add(cursor.toISOString().slice(0,10));
        cursor.setUTCDate(cursor.getUTCDate()+1);
      }
    }

    const h = await db.query(
      `SELECT holiday_date::text AS holiday_date,description
       FROM holidays
       WHERE holiday_date >= $1::date AND holiday_date < $2::date AND holiday_date >= $3::date`,
      [monthStart, nextMonthStart, admission],
    );
    for (const row of h.rows) {
      if (!effectiveEnd || row.holiday_date <= effectiveEnd) {
        dates.add(row.holiday_date);
        holidays.set(row.holiday_date, row.description);
      }
    }
  } else if (dates.size) {
    const h = await db.query(
      `SELECT holiday_date::text AS holiday_date,description
       FROM holidays WHERE holiday_date::text = ANY($1::text[])`,
      [Array.from(dates)],
    );
    for (const row of h.rows) holidays.set(row.holiday_date, row.description);
  }

  const out: DaySummary[] = [];
  for (const date of dates) {
    out.push(await summarizeRows(
      employeeId,
      date,
      grouped.get(date) ?? [],
      occurrences.get(date) ?? null,
      holidays.get(date) ?? null,
      dailyMinutes,
    ));
  }
  out.sort((a,b) => b.date.localeCompare(a.date));
  return out;
}

export function aggregate(items: DaySummary[]) {
  let worked = 0, positive = 0, negative = 0, pending = 0;
  const today = saoPauloNow().date;
  const currentMonth = today.slice(0,7);

  for (const s of items) {
    const isFutureFolgaOutsideCurrentMonth =
      s.occurrence_type === "FOLGA"
      && s.date > today
      && s.date.slice(0,7) !== currentMonth;

    if (isFutureFolgaOutsideCurrentMonth) continue;

    worked += s.worked_minutes ?? 0;
    if ((s.balance_minutes ?? 0) > 0) positive += s.balance_minutes!;
    if ((s.balance_minutes ?? 0) < 0) negative += Math.abs(s.balance_minutes!);
    if (s.status.includes("JORNADA INCOMPLETA")) pending++;
  }
  return {
    worked_minutes: worked,
    positive_minutes: positive,
    negative_minutes: negative,
    balance_minutes: positive - negative,
    pending,
  };
}
