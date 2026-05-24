import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";
import { normalizeOperationalSettings } from "../whatsapp-ai-processor/settings.ts";

interface ReminderRunBody {
  force?: boolean;
  company_id?: string;
}

interface WaNumberRow {
  id: string;
  company_id: string;
  operational_settings: unknown;
}

interface AssignmentRow {
  user_id: string;
  order_id: string;
  orders?: { order_code?: string | null; description?: string | null } | null;
}

interface EmployeeRow {
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  phone_whatsapp: string | null;
}

function extractJwtRole(authHeader: string): string | null {
  if (!authHeader.startsWith("Bearer ")) return null;
  const jwt = authHeader.substring(7);
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

function romeParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  return { date, hour, minute, minutesOfDay: hour * 60 + minute };
}

function parseHHMM(value: string) {
  const [h, m] = value.split(":").map((part) => Number(part));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function shouldRunAtTime(configuredHHMM: string, force: boolean) {
  if (force) return true;
  const configured = parseHHMM(configuredHHMM);
  if (configured == null) return false;
  const now = romeParts();
  return now.minutesOfDay >= configured && now.minutesOfDay < configured + 15;
}

function cleanPhone(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/[^0-9]/g, "");
  if (!digits) return null;
  return digits.startsWith("39") ? digits : `39${digits}`;
}

function employeeName(employee: EmployeeRow) {
  return `${employee.first_name ?? ""} ${employee.last_name ?? ""}`.trim() || "ciao";
}

function orderLabel(order?: AssignmentRow["orders"]) {
  return [order?.order_code, order?.description].filter(Boolean).join(" - ") || "il cantiere assegnato";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  const cronSecret = req.headers.get("x-cron-secret") ?? "";
  const internalSecret = Deno.env.get("INTERNAL_CRON_SECRET") || serviceKey;
  const roleClaim = extractJwtRole(authHeader);
  const authorized =
    authHeader === `Bearer ${serviceKey}` ||
    roleClaim === "service_role" ||
    (cronSecret.length > 0 && cronSecret === internalSecret);

  if (!authorized) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = (await req.json().catch(() => ({}))) as ReminderRunBody;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
  const { date: today } = romeParts();

  let numbersQuery = supabase
    .from("ai_whatsapp_numbers")
    .select("id, company_id, operational_settings")
    .eq("purpose", "bot_operativo")
    .is("deleted_at", null);

  if (body.company_id) {
    numbersQuery = numbersQuery.eq("company_id", body.company_id);
  }

  const { data: numbers, error: numbersError } = await numbersQuery;
  if (numbersError) {
    return new Response(JSON.stringify({ error: numbersError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const details: Array<Record<string, unknown>> = [];

  for (const waNumber of (numbers ?? []) as WaNumberRow[]) {
    const settings = normalizeOperationalSettings(waNumber.operational_settings);
    if (!settings.daily_rapportino_enabled || !shouldRunAtTime(settings.daily_rapportino_time, !!body.force)) {
      skipped++;
      continue;
    }

    const { data: assignments, error: assignmentsError } = await supabase
      .from("order_campo_assignments")
      .select("user_id, order_id, orders(order_code, description)")
      .eq("company_id", waNumber.company_id)
      .or(`data_inizio.is.null,data_inizio.lte.${today}`)
      .or(`data_fine_prevista.is.null,data_fine_prevista.gte.${today}`);

    if (assignmentsError) {
      failed++;
      details.push({ wa_number_id: waNumber.id, error: assignmentsError.message });
      continue;
    }

    const assignmentRows = ((assignments ?? []) as unknown as AssignmentRow[])
      .filter((a) => !!a.user_id && !!a.order_id);
    const userIds = Array.from(new Set(assignmentRows.map((a) => a.user_id)));
    if (userIds.length === 0) {
      skipped++;
      continue;
    }

    const { data: employees } = await supabase
      .from("employees")
      .select("user_id, first_name, last_name, phone, phone_whatsapp")
      .eq("company_id", waNumber.company_id)
      .eq("is_active", true)
      .in("user_id", userIds);

    const employeeByUser = new Map(
      ((employees ?? []) as EmployeeRow[])
        .filter((e) => !!e.user_id)
        .map((e) => [e.user_id as string, e]),
    );

    const { data: existingReports } = await supabase
      .from("campo_rapportini")
      .select("user_id, order_id")
      .eq("company_id", waNumber.company_id)
      .eq("data_lavoro", today)
      .in("user_id", userIds);

    const alreadyDone = new Set(
      ((existingReports ?? []) as Array<{ user_id: string; order_id: string }>)
        .map((r) => `${r.user_id}:${r.order_id}`),
    );

    for (const assignment of assignmentRows) {
      if (alreadyDone.has(`${assignment.user_id}:${assignment.order_id}`)) {
        skipped++;
        continue;
      }

      const employee = employeeByUser.get(assignment.user_id);
      const phone = cleanPhone(employee?.phone_whatsapp || employee?.phone);
      if (!employee || !phone) {
        skipped++;
        continue;
      }

      const { data: logRow, error: logError } = await supabase
        .from("wa_operational_reminder_log")
        .insert({
          company_id: waNumber.company_id,
          wa_number_id: waNumber.id,
          employee_user_id: assignment.user_id,
          order_id: assignment.order_id,
          reminder_date: today,
          reminder_kind: "rapportino_daily",
          phone,
          status: "pending",
        })
        .select("id")
        .maybeSingle();

      if (logError) {
        skipped++;
        continue;
      }

      const message = [
        `Ciao ${employeeName(employee)}, mi mandi il rapportino di oggi per ${orderLabel(assignment.orders)}?`,
        "Puoi rispondere con audio o testo: ore, lavori fatti, materiali usati, problemi e foto.",
        "Silvio lo prepara e lo collega alla commessa.",
      ].join("\n");

      const sendResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          wa_number_id: waNumber.id,
          company_id: waNumber.company_id,
          to: phone,
          text: message,
        }),
      });

      if (sendResp.ok) {
        sent++;
        await supabase
          .from("wa_operational_reminder_log")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", logRow?.id);
      } else {
        failed++;
        const errorDetail = (await sendResp.text()).slice(0, 500);
        await supabase
          .from("wa_operational_reminder_log")
          .update({ status: "failed", error_detail: errorDetail })
          .eq("id", logRow?.id);
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, skipped, failed, details }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
