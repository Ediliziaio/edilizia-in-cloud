/**
 * Edge Function: silvio-daily-briefing
 *
 * Genera un briefing mattutino personalizzato per un utente o per tutti gli
 * admin di un'azienda, e lo posta come messaggio Silvio nel canale silvio-ai.
 *
 * Modalità:
 *   1. POST { user_id, company_id, force? } → briefing per utente specifico
 *   2. POST { company_id } → briefing per tutti gli admin azienda
 *   3. POST { mode: "all_companies" } → batch (chiamato da cron)
 *
 * Per ogni utente:
 *   1. Se last_briefing_at è oggi e !force → skip
 *   2. Run silvio_detect_alerts (idempotente)
 *   3. Get briefing alerts via silvio_get_briefing_alerts
 *   4. Se 0 alert → manda comunque "Tutto sotto controllo" (1x al dì max)
 *   5. LLM compone messaggio breve in tono Silvio
 *   6. Posta nel canale silvio-ai dell'utente
 *   7. Marca alerts come notified + update last_briefing_at
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess, requireInternalSecret } from "../_shared/auth.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// 🛡️ Anti chain-of-thought leak — strip tool names + opener narrativi dal
// briefing quotidiano mostrato all'utente.
import { sanitizeAnswer } from "../_shared/structuredOutput.ts";

const SILVIO_SENDER_ID = "00000000-0000-0000-0000-000000000002";
const SILVIO_PERSONA_KEY = "silvio";

interface BriefingPayload {
  mode?: "user" | "company" | "all_companies";
  user_id?: string;
  company_id?: string;
  force?: boolean;
}

interface BriefingPreferenceRow {
  user_id: string;
  company_id: string | null;
  last_briefing_at: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = any;

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsHeaders);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin: SupabaseAdmin = createClient(supabaseUrl, serviceKey);

    const body = (await req.json().catch(() => ({}))) as BriefingPayload;
    const mode = body.mode ?? (body.user_id ? "user" : body.company_id ? "company" : "all_companies");

    let targets: Array<{ user_id: string; company_id: string }> = [];

    if (mode === "user" && body.user_id) {
      const { data: profile } = await supabaseAdmin
        .from("profiles").select("id, company_id").eq("id", body.user_id).maybeSingle();
      if (!profile?.company_id) return errorResponse("Utente target senza azienda", 404, corsHeaders);
      const auth = await requireAuth(req, corsHeaders);
      await requireCompanyAccess(supabaseAdmin, auth.userId, profile.company_id, corsHeaders, {
        allowedRoles: ["super_admin", "company_admin"],
      });
      if (profile?.company_id) targets.push({ user_id: profile.id, company_id: profile.company_id });
    } else if (mode === "company" && body.company_id) {
      const auth = await requireAuth(req, corsHeaders);
      await requireCompanyAccess(supabaseAdmin, auth.userId, body.company_id, corsHeaders, {
        allowedRoles: ["super_admin", "company_admin"],
      });
      // Tutti gli admin della company
      const { data: roles } = await supabaseAdmin
        .from("user_roles").select("user_id, role")
        .in("role", ["super_admin", "company_admin"]);
      const adminIds = (roles ?? []).map((r: { user_id: string }) => r.user_id);
      const { data: profiles } = await supabaseAdmin
        .from("profiles").select("id, company_id")
        .eq("company_id", body.company_id).in("id", adminIds);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targets = (profiles ?? []).map((p: any) => ({ user_id: p.id, company_id: p.company_id }));
    } else if (mode === "all_companies") {
      requireInternalSecret(req, corsHeaders);
      // Cron mode: tutti gli utenti con preferences enabled = true
      const { data: prefs } = await supabaseAdmin
        .from("silvio_user_preferences")
        .select("user_id, company_id, last_briefing_at, daily_briefing_time, daily_briefing_enabled, min_severity")
        .eq("daily_briefing_enabled", true);
      targets = ((prefs ?? []) as BriefingPreferenceRow[])
        .filter((p) => {
          if (!p.company_id) return false;
          // Only run if not already sent today
          if (p.last_briefing_at) {
            const last = new Date(p.last_briefing_at);
            const today = new Date();
            if (last.toDateString() === today.toDateString()) return false;
          }
          return true;
        })
        .map((p) => ({ user_id: p.user_id, company_id: p.company_id as string }));
    }

    if (targets.length === 0) {
      return jsonResponse({ ok: true, sent: 0, message: "Nessun target" }, 200, corsHeaders);
    }

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const t of targets) {
      try {
        const result = await processBriefing(supabaseAdmin, t.user_id, t.company_id, !!body.force);
        if (result.sent) sent++;
        else skipped++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${t.user_id}: ${msg}`);
        console.error(`[silvio-briefing] error for ${t.user_id}:`, msg);
      }
    }

    return jsonResponse({
      ok: true,
      total_targets: targets.length,
      sent,
      skipped,
      errors_count: errors.length,
      errors: errors.slice(0, 5),
    }, 200, corsHeaders);
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[silvio-daily-briefing] error:", msg);
    return errorResponse(msg, 500, corsHeaders);
  }
});

// ─────────────────────────────────────────────────────────────────────────────

async function processBriefing(
  supabaseAdmin: SupabaseAdmin,
  userId: string,
  companyId: string,
  force: boolean,
): Promise<{ sent: boolean; reason?: string }> {
  // 1) Check user prefs
  const { data: prefs } = await supabaseAdmin
    .from("silvio_user_preferences")
    .select("daily_briefing_enabled, last_briefing_at, min_severity")
    .eq("user_id", userId).maybeSingle();

  // Auto-create default prefs if missing
  if (!prefs) {
    await supabaseAdmin.from("silvio_user_preferences").insert({
      user_id: userId,
      company_id: companyId,
    });
  }

  if (prefs && !prefs.daily_briefing_enabled && !force) {
    return { sent: false, reason: "briefing disabled" };
  }

  if (prefs?.last_briefing_at && !force) {
    const last = new Date(prefs.last_briefing_at);
    const today = new Date();
    if (last.toDateString() === today.toDateString()) {
      return { sent: false, reason: "already sent today" };
    }
  }

  const minSeverity = prefs?.min_severity ?? "warning";

  // 2) Run detection (idempotente)
  await supabaseAdmin.rpc("silvio_detect_alerts", { p_company_id: companyId });

  // 3) Get briefing alerts
  const { data: briefingData } = await supabaseAdmin.rpc("silvio_get_briefing_alerts", {
    p_company_id: companyId,
    p_user_id: userId,
    p_min_severity: minSeverity,
    p_limit: 8,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = briefingData as any;
  const alerts: Array<Record<string, unknown>> = data?.alerts ?? [];
  const totalCritical: number = data?.count_critical ?? 0;
  const totalWarning: number = data?.count_warning ?? 0;

  // 4) Get user name
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("first_name").eq("id", userId).maybeSingle();
  const firstName = profile?.first_name ?? "";

  // 5) Find Silvio channel for this user
  const SILVIO_VIRTUAL = SILVIO_SENDER_ID;
  const { data: channel } = await supabaseAdmin
    .from("internal_chat_channels")
    .select("id, company_id")
    .eq("name", "silvio-ai")
    .eq("is_dm", true)
    .contains("dm_user_ids", [userId, SILVIO_VIRTUAL])
    .maybeSingle();

  let channelId = channel?.id;
  if (!channelId) {
    // Lazy-create channel
    const { data: newChannelId } = await supabaseAdmin.rpc("ensure_user_silvio_channel", {
      p_user_id: userId,
    });
    channelId = newChannelId as string;
  }
  if (!channelId) return { sent: false, reason: "no channel" };

  // 6) Compose briefing message via LLM
  const briefingMessage = await composeBriefingMessage(
    supabaseAdmin, companyId, userId, firstName, alerts, totalCritical, totalWarning,
  );

  // 7) Post in Silvio channel
  await supabaseAdmin.from("internal_chat_messages").insert({
    channel_id: channelId,
    sender_id: SILVIO_SENDER_ID,
    company_id: companyId,
    content: briefingMessage,
    message_type: "text",
  });

  // 8) Mark alerts as notified
  if (alerts.length > 0) {
    const ids = alerts.map((a) => a.id as string);
    await supabaseAdmin.from("silvio_alerts")
      .update({ notified_at: new Date().toISOString() })
      .in("id", ids);
  }

  // 9) Update last_briefing_at
  await supabaseAdmin.from("silvio_user_preferences")
    .upsert({
      user_id: userId,
      company_id: companyId,
      last_briefing_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

  return { sent: true };
}

// ─────────────────────────────────────────────────────────────────────────────

async function composeBriefingMessage(
  supabaseAdmin: SupabaseAdmin,
  companyId: string,
  userId: string,
  firstName: string,
  alerts: Array<Record<string, unknown>>,
  countCritical: number,
  countWarning: number,
): Promise<string> {
  const greeting = firstName ? `Buongiorno ${firstName}` : "Buongiorno";

  if (alerts.length === 0) {
    return `🌅 **${greeting}!**\n\nNessuna criticità rilevata oggi. Tutto sotto controllo. ✨\n\nSe vuoi che approfondisca qualcosa, dimmelo.`;
  }

  // System prompt per il briefing
  const systemPrompt = `Sei Silvio, l'assistente AI dell'impresa edile. Stai componendo il BRIEFING MATTUTINO per ${firstName || "l'utente"}.

REGOLE:
- Apri con saluto cordiale (es. "🌅 Buongiorno ${firstName || ""}!")
- Sintesi numerica iniziale (X criticità, Y avvisi)
- Lista alert raggruppati per severity (🔴 Critici, 🟡 Importanti, 🔵 Info)
- Per ogni alert: titolo bold + 1 riga conciso. NIENTE markdown bold sulla CTA.
- Se c'è una CTA: includi "[Azione: nome_azione]" alla fine della riga
- Massimo 200 parole totali
- Italiano professionale, formato numeri € 1.234,56 e date dd/mm/yyyy
- Concludi con: "Vuoi che mi occupi di qualcosa?"
- NON ripetere informazioni già contenute nei titoli alert`;

  const alertsForPrompt = alerts.slice(0, 8).map((a) => ({
    severity: a.severity,
    title: a.title,
    message: a.message,
    cta: a.cta_action,
  }));

  const userPrompt = `Componi il briefing mattutino con questi alert:

CONTEGGIO: ${countCritical} critici, ${countWarning} avvisi.

ALERT:
${JSON.stringify(alertsForPrompt, null, 2)}

Genera il messaggio briefing seguendo le regole del system prompt.`;

  try {
    const result = await aiRouterComplete({
      supabase: supabaseAdmin,
      taskKey: "persona_silvio",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      params: { temperature: 0.4, max_tokens: 800 },
      companyId,
      userId,
      personaKey: SILVIO_PERSONA_KEY,
      idempotencyKey: `briefing_${userId}_${new Date().toISOString().slice(0, 10)}`,
    });
    const rawContent = result.content || "";
    if (!rawContent) return fallbackBriefing(greeting, alerts, countCritical, countWarning);

    // 🛡️ Sanitize: strip CoT leak prima di mostrare il briefing.
    const sanitized = sanitizeAnswer(rawContent);
    if (sanitized.wasModified) {
      console.warn("[silvio-briefing] chain-of-thought leak rimosso dal briefing");
    }
    if (sanitized.isFullyChainOfThought) {
      console.error("[silvio-briefing] briefing era TUTTO CoT, fallback statico");
      return fallbackBriefing(greeting, alerts, countCritical, countWarning);
    }
    return sanitized.cleaned || rawContent;
  } catch (e) {
    console.error("[silvio-briefing] LLM compose error, using fallback:", e);
    return fallbackBriefing(greeting, alerts, countCritical, countWarning);
  }
}

function fallbackBriefing(
  greeting: string,
  alerts: Array<Record<string, unknown>>,
  countCritical: number,
  countWarning: number,
): string {
  const lines: string[] = [];
  lines.push(`🌅 **${greeting}!**`);
  lines.push("");
  lines.push(`Hai **${countCritical} criticità** e **${countWarning} avvisi** da gestire.`);
  lines.push("");

  const critical = alerts.filter((a) => a.severity === "critical");
  const warning = alerts.filter((a) => a.severity === "warning");
  const info = alerts.filter((a) => a.severity === "info");

  if (critical.length > 0) {
    lines.push("🔴 **Critici**");
    critical.forEach((a, i) => {
      lines.push(`${i + 1}. **${a.title}** — ${a.message}`);
    });
    lines.push("");
  }
  if (warning.length > 0) {
    lines.push("🟡 **Importanti**");
    warning.forEach((a, i) => {
      lines.push(`${i + 1}. **${a.title}** — ${a.message}`);
    });
    lines.push("");
  }
  if (info.length > 0) {
    lines.push("🔵 **Info**");
    info.slice(0, 3).forEach((a, i) => {
      lines.push(`${i + 1}. **${a.title}** — ${a.message}`);
    });
    lines.push("");
  }

  lines.push("Vuoi che mi occupi di qualcosa?");
  return lines.join("\n");
}
