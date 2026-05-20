/**
 * silvio-morning-brief — cron 08:00 IT
 *
 * Genera un briefing giornaliero per ogni utente attivo (admin company che
 * ha fatto login negli ultimi 14gg). Il briefing è 3-5 bullet con:
 *   - Crediti scaduti gravi
 *   - Lavori/pose oggi e domani
 *   - Anomalie cassa
 *   - Opportunità (preventivi in scadenza, follow-up)
 *
 * Salvato in silvio_morning_briefings (UNIQUE per user+day).
 * Letto dal SilvioFAB launcher come "Cose da sapere stamattina".
 *
 * Trigger:
 *   - Cron: scheduled function Supabase "0 7 * * *" UTC = 08:00 CET / 09:00 CEST
 *   - Manuale: POST { mode: "user", user_id, company_id } per debug
 *
 * Budget: max 50 utenti per run. Modelli economici (t1_economic) per costo basso.
 */

import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { executeToolWithRouting, type ToolContext } from "../_shared/silvioTools.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_USERS_PER_RUN = 50;

interface BriefingInput {
  user_id: string;
  company_id: string;
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode ?? "all";

    // ── 1. Lista utenti da processare ─────────────────────────────────
    let targets: BriefingInput[] = [];
    if (mode === "user" && body?.user_id && body?.company_id) {
      targets = [{ user_id: body.user_id, company_id: body.company_id }];
    } else {
      const { data } = await supabase.rpc("silvio_users_for_morning_brief", { p_lookback_days: 14 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targets = (data ?? []).slice(0, MAX_USERS_PER_RUN).map((r: any) => ({
        user_id: r.user_id,
        company_id: r.company_id,
      }));
    }

    if (targets.length === 0) {
      return jsonResponse({ ok: true, generated: 0, message: "Nessun utente da processare" }, cors);
    }

    let ok = 0;
    let failed = 0;
    const errors: Array<{ user_id: string; error: string }> = [];

    // ── 2. Per ogni utente, raccogli dati + sintetizza ────────────────
    for (const t of targets) {
      try {
        await generateBriefingForUser(supabase, t);
        ok++;
      } catch (e) {
        failed++;
        errors.push({ user_id: t.user_id, error: e instanceof Error ? e.message : String(e) });
        console.error(`[morning-brief] user ${t.user_id} fail`, e);
      }
    }

    return jsonResponse({ ok: true, generated: ok, failed, errors: errors.slice(0, 5) }, cors);

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[morning-brief] fatal", msg);
    return errorResponse(`Fatal: ${msg}`, 500, cors);
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateBriefingForUser(supabase: any, t: BriefingInput): Promise<void> {
  // Setup tool context — admin con company_admin role per accedere a tutti i tool kpi
  const toolCtx: ToolContext = {
    supabase,
    companyId: t.company_id,
    userId: t.user_id,
    userRole: "company_admin",
    persona: "silvio",
    channel: "internal_chat",
  };

  // ── Raccolta dati ───────────────────────────────────────────────
  // Usiamo 4 tool in parallelo per costruire il context. Errori non bloccanti.
  const [snapshotR, overdueR, cashflowR, lavoriR] = await Promise.allSettled([
    executeToolWithRouting("get_executive_snapshot", {}, toolCtx),
    executeToolWithRouting("get_overdue_payments", { only_grave: true, limit: 10 }, toolCtx),
    executeToolWithRouting("get_cashflow_status", {}, toolCtx),
    executeToolWithRouting("lista_lavori_pose_periodo", { days: 2 }, toolCtx),
  ]);

  // Sintesi compatta dei risultati per il prompt
  const dataParts: string[] = [];
  if (snapshotR.status === "fulfilled") dataParts.push(`Executive snapshot: ${JSON.stringify(snapshotR.value).slice(0, 2000)}`);
  if (overdueR.status === "fulfilled") dataParts.push(`Crediti scaduti gravi: ${JSON.stringify(overdueR.value).slice(0, 1500)}`);
  if (cashflowR.status === "fulfilled") dataParts.push(`Cashflow: ${JSON.stringify(cashflowR.value).slice(0, 1500)}`);
  if (lavoriR.status === "fulfilled") dataParts.push(`Lavori prossime 48h: ${JSON.stringify(lavoriR.value).slice(0, 1500)}`);
  if (dataParts.length === 0) {
    // Nessun dato disponibile: niente briefing per oggi
    return;
  }

  // ── LLM: estrai briefing strutturato ─────────────────────────────
  const sysPrompt = `Sei Silvio, assistente AI di un'impresa edile italiana. Genera il briefing del giorno per l'utente.

INPUT: dati operativi delle ultime 24-48h.

OUTPUT JSON ESATTO (no markdown wrappers):
{
  "content": "stringa markdown 200-400 char con 3-5 bullet su cosa è IMPORTANTE oggi",
  "key_points": [
    {"text": "breve max 80 char", "severity": "info"|"attention"|"urgent", "action_hint": "verbo+oggetto, max 30 char"},
    ...3-5 punti
  ],
  "severity": "info" se tutto regolare, "attention" se ci sono cose da seguire, "urgent" se c'è crediti scaduti gravi/cashflow negativo/pose oggi non assegnate"
}

REGOLE:
- Concentrati su COSE AZIONABILI, non statistiche generiche.
- Se non c'è nulla di urgente, dillo (es. "Nessuna anomalia rilevante stamattina").
- NO emoji. NO saluti. NO "buongiorno".
- Cita numeri reali dai dati, MAI inventare.
- Lingua: italiano, tono diretto da socio (non assistente formale).`;

  const userPrompt = `DATI:\n\n${dataParts.join("\n\n")}\n\nGenera il briefing in JSON.`;

  const aiResult = await aiRouterComplete({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: supabase as any,
    taskKey: "text_summarize",
    messages: [
      { role: "system", content: sysPrompt },
      { role: "user", content: userPrompt },
    ],
    params: { temperature: 0.2, max_tokens: 700 },
    responseFormat: { type: "json_object" },
    companyId: t.company_id,
    userId: t.user_id,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ar = aiResult as any;
  let parsed: { content: string; key_points: Array<{ text: string; severity?: string; action_hint?: string }>; severity?: string };
  try {
    parsed = JSON.parse(ar?.content ?? "{}");
  } catch {
    console.warn(`[morning-brief] JSON parse failed user=${t.user_id}`);
    return;
  }

  if (!parsed.content || parsed.content.length < 20) return;

  // ── Salva (idempotent: UNIQUE user_id + brief_date) ─────────────
  const { error: insErr } = await supabase
    .from("silvio_morning_briefings")
    .insert({
      company_id: t.company_id,
      user_id: t.user_id,
      content: parsed.content.slice(0, 2000),
      key_points: Array.isArray(parsed.key_points) ? parsed.key_points.slice(0, 5) : [],
      severity: ["info", "attention", "urgent"].includes(parsed.severity ?? "") ? parsed.severity : "info",
      tools_used: ["get_executive_snapshot", "get_overdue_payments", "get_cashflow_status", "lista_lavori_pose_periodo"],
      model_used: ar?.model_used ?? null,
      cost_usd: ar?.cost_usd ?? null,
    });

  if (insErr) {
    if (/duplicate key/i.test(insErr.message ?? "")) return; // briefing già esistente
    throw new Error(`insert briefing: ${insErr.message}`);
  }
}
