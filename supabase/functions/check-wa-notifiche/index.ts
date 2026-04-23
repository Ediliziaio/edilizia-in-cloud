// MP03 — check-wa-notifiche (cron ogni 15min)
// Valuta i trigger wa_notifiche_triggers enabled e firea notifiche rispettando cooldown.
// MVP supporta solo trigger cron-based: fattura_scaduta, approvazione_pendente.
// Gli event-driven (preventivo_inviato, sal_raggiunto) in MP4.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";

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

interface TriggerRow {
  id: string;
  company_id: string;
  trigger_kind: string;
  enabled: boolean;
  config: Record<string, unknown> | null;
  template_name: string;
  wa_number_id: string | null;
  destinatario_kind: string | null;
  destinatario_custom_phone: string | null;
  fire_count: number | null;
}

interface Subject {
  subject_id: string;
  variables: Record<string, string>;
  destinatario_phone?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const cronSecret = req.headers.get("x-cron-secret") ?? "";
  const internalSecret = Deno.env.get("INTERNAL_CRON_SECRET") ?? "";
  const roleClaim = extractJwtRole(authHeader);
  const authorized =
    roleClaim === "service_role" ||
    (internalSecret.length > 0 && cronSecret === internalSecret);
  if (!authorized) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: triggers } = await supabase
    .from("wa_notifiche_triggers")
    .select("*")
    .eq("enabled", true);

  let fired = 0;
  let skipped = 0;
  const details: Array<Record<string, unknown>> = [];

  for (const t of (triggers ?? []) as TriggerRow[]) {
    try {
      const subjects = await evaluateTrigger(supabase, t);
      for (const subject of subjects) {
        const ok = await checkAndSetCooldown(supabase, t.id, subject.subject_id);
        if (!ok) {
          skipped++;
          continue;
        }
        const destinatario = await resolveDestinatario(supabase, t, subject);
        if (!destinatario) continue;
        await fireNotifica(supabase, t, subject, destinatario);
        fired++;
        details.push({
          trigger: t.trigger_kind,
          subject_id: subject.subject_id,
          destinatario,
        });
      }
    } catch (e) {
      console.error(
        JSON.stringify({
          level: "error",
          fn: "check-wa-notifiche",
          trigger_id: t.id,
          error: String(e),
        }),
      );
    }
  }

  return new Response(
    JSON.stringify({
      fired,
      skipped,
      triggers: triggers?.length ?? 0,
      details: details.slice(0, 20),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

async function evaluateTrigger(
  supabase: SupabaseClient,
  t: TriggerRow,
): Promise<Subject[]> {
  switch (t.trigger_kind) {
    case "fattura_scaduta": {
      const giorni = (t.config?.giorni_soglia as number) ?? 7;
      const soglia = new Date(Date.now() - giorni * 86_400_000).toISOString().substring(0, 10);
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, total_amount, paid_amount, client_company_name, due_date")
        .eq("company_id", t.company_id)
        .neq("payment_status", "pagata")
        .lt("due_date", soglia)
        .limit(10);
      return (data ?? []).map((f) => ({
        subject_id: f.id,
        variables: {
          "1": String(f.invoice_number ?? "N/D"),
          "2": f.client_company_name ?? "N/D",
          "3": Number(f.total_amount ?? 0).toLocaleString("it-IT", {
            minimumFractionDigits: 2,
          }),
          "4": f.due_date ?? "",
        },
      }));
    }

    case "approvazione_pendente": {
      const giorni = (t.config?.giorni_soglia as number) ?? 3;
      const soglia = new Date(Date.now() - giorni * 86_400_000).toISOString();
      const { data } = await supabase
        .from("cantiere_segnalazioni")
        .select("id, descrizione, urgenza, created_at")
        .eq("company_id", t.company_id)
        .eq("stato", "aperta")
        .lt("created_at", soglia)
        .limit(5);
      return (data ?? []).map((s) => ({
        subject_id: s.id,
        variables: {
          "1": "segnalazione",
          "2": (s.descrizione ?? "").substring(0, 50),
          "3": s.urgenza ?? "media",
        },
      }));
    }

    // Altri trigger in MP4
    case "ddt_pendente":
    case "margine_basso":
    case "preventivo_inviato":
    case "sal_raggiunto":
    case "fattura_emessa":
    case "custom":
      return [];
  }
  return [];
}

async function checkAndSetCooldown(
  supabase: SupabaseClient,
  triggerId: string,
  subjectId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("wa_notifiche_cooldown")
    .insert({ trigger_id: triggerId, subject_id: subjectId });
  return !error;
}

async function resolveDestinatario(
  supabase: SupabaseClient,
  t: TriggerRow,
  subject: Subject,
): Promise<string | null> {
  if (subject.destinatario_phone) return subject.destinatario_phone;
  if (t.destinatario_kind === "custom" && t.destinatario_custom_phone) {
    return t.destinatario_custom_phone;
  }
  if (t.destinatario_kind === "titolare") {
    // Cerca il profilo titolare della company
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, phone")
      .eq("company_id", t.company_id)
      .not("phone", "is", null)
      .limit(5);
    const userIds = (profiles ?? []).map((p) => p.id);
    if (userIds.length === 0) return null;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", userIds);
    const titolareUids = new Set(
      (roles ?? [])
        .filter((r) => ["titolare", "admin", "super_admin"].includes(String(r.role).toLowerCase()))
        .map((r) => r.user_id),
    );
    const titolare = (profiles ?? []).find((p) => titolareUids.has(p.id));
    return titolare?.phone ?? null;
  }
  return null;
}

async function fireNotifica(
  supabase: SupabaseClient,
  t: TriggerRow,
  subject: Subject,
  destinatario: string,
): Promise<void> {
  if (!t.wa_number_id) return;

  const baseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const resp = await fetch(`${baseUrl}/functions/v1/whatsapp-send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      wa_number_id: t.wa_number_id,
      company_id: t.company_id,
      to: destinatario,
      template: { name: t.template_name, language: "it", variables: subject.variables },
    }),
  });

  const stato = resp.ok ? "sent" : "failed";
  const errorDetail = resp.ok ? null : (await resp.text()).substring(0, 500);

  await supabase.from("wa_notifiche_log").insert({
    trigger_id: t.id,
    company_id: t.company_id,
    subject_id: subject.subject_id,
    destinatario,
    template_name: t.template_name,
    variables_used: subject.variables,
    stato,
    error_detail: errorDetail,
  });

  if (resp.ok) {
    await supabase
      .from("wa_notifiche_triggers")
      .update({
        last_fired_at: new Date().toISOString(),
        fire_count: (t.fire_count ?? 0) + 1,
      })
      .eq("id", t.id);
  }
}
