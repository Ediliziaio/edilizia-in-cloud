/**
 * ai-briefing-per-ruolo — FASE J
 *
 * Genera un briefing personalizzato per il ruolo dell'utente:
 * - company_admin / super_admin → tutto: revenue, alerts, cashflow, ordini critici
 * - salesperson → pipeline, contatti hot, contratti da firmare
 * - employee / worker → cantieri assegnati oggi, rapportini pending, sicurezza
 * - subcontractor → ordini suoi, SAL pending
 * - call_center → leads pending, appuntamenti da confermare
 *
 * Input:  { company_id?: uuid }   (user_id e ruolo presi da JWT/context)
 * Output: { success, briefing: {...}, ai_meta }
 */

import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { gateAiPayment } from "../_shared/requirePaymentMethod.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

const SYSTEM_PROMPT_BASE = `Sei Silvio AI, assistente intelligente per imprese edili italiane.
Genera un briefing personalizzato per l'utente in base al suo RUOLO.

REGOLE:
- Tono adatto al ruolo (tecnico per operai, strategico per admin)
- Cita SEMPRE numeri e dettagli concreti dai dati
- MAX 3 azioni urgenti
- Buongiorno + nome se conosciuto
- Lingua: italiano

OUTPUT JSON ESATTO (no markdown):
{
  "saluto": "string max 100 char (es. 'Buongiorno Marco, ecco il riepilogo')",
  "intro_giornata": "string max 200 char — sintesi situazione",
  "azioni_urgenti": [
    {"icona": "warning"|"task"|"call"|"meeting"|"document", "azione": "string max 150 char", "priorita": "alta"|"media"|"bassa"}
  ],
  "info_chiave": [
    {"label": "string", "valore": "string", "context": "string max 100 char opzionale"}
  ],
  "suggerimenti": ["max 3 string max 120 char"]
}`;

interface RolePayload {
  ruolo: string;
  utente_nome: string | null;
  ordini_assegnati?: AnyObj[];
  alerts_open?: AnyObj[];
  appuntamenti_oggi?: AnyObj[];
  pipeline?: AnyObj;
  cashflow?: AnyObj;
  rapportini_pending?: AnyObj[];
  contatti_hot?: AnyObj[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  const cors = getCorsHeaders(req);

  try {
    if (req.method !== "POST") {
      return errorResponse("Metodo non consentito", 405, cors);
    }

    const { userId, supabaseAdmin } = await requireAuth(req, cors);

    const body = await req.json().catch(() => ({}));
    const { company_id: bodyCompanyId } = body as { company_id?: string };

    // Fetch user profile + roles
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name, company_id")
      .eq("id", userId)
      .maybeSingle();

    if (!profile) return errorResponse("Profilo utente non trovato", 404, cors);

    const companyId = bodyCompanyId ?? profile.company_id;
    if (!companyId) return errorResponse("company_id non determinabile", 400, cors);
    await requireCompanyAccess(supabaseAdmin, userId, companyId, cors);

    // Gate carta (audit AI 2026-06): strumento a costo senza controllo pagamento.
    const paymentBlock = await gateAiPayment(supabaseAdmin, companyId, cors);
    if (paymentBlock) return paymentBlock;

    const { data: rolesData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const roles = ((rolesData ?? []) as AnyObj[]).map((r) => r.role);
    const primaryRole = roles[0] ?? "company_staff";

    const payload: RolePayload = {
      ruolo: primaryRole,
      utente_nome: profile.first_name ?? null,
    };

    // ── Fetch dati pertinenti al ruolo ──────────────────────────
    if (["super_admin", "company_admin"].includes(primaryRole)) {
      const { data: alerts } = await supabaseAdmin
        .from("silvio_alerts")
        .select("severity, title, message, alert_type")
        .eq("company_id", companyId)
        .eq("status", "open")
        .order("severity", { ascending: true })
        .limit(8);
      payload.alerts_open = alerts ?? [];

      const { data: cashflowFull } = await supabaseAdmin.rpc(
        "silvio_cashflow_forecast_90d",
        { p_company_id: companyId, p_weeks: 4, p_apply_delay: true },
      );
      payload.cashflow = {
        saldo_oggi: (cashflowFull as AnyObj)?.saldo_oggi_eur,
        critical_weeks: (cashflowFull as AnyObj)?.critical_weeks_count,
        warning_weeks: (cashflowFull as AnyObj)?.warning_weeks_count,
      };
    }

    if (["salesperson", "company_admin", "super_admin"].includes(primaryRole)) {
      // Top hot contacts
      const { data: hotContacts } = await supabaseAdmin
        .from("marketing_contacts")
        .select("first_name, last_name, company_name, ai_score, ai_score_tier, ai_next_action")
        .eq("company_id", companyId)
        .eq("ai_score_tier", "hot")
        .order("ai_score", { ascending: false })
        .limit(5);
      payload.contatti_hot = hotContacts ?? [];
    }

    if (["employee", "worker", "subcontractor", "company_staff"].includes(primaryRole)) {
      // Cantieri assegnati
      const { data: assignments } = await supabaseAdmin
        .from("order_campo_assignments")
        .select("order_id, role_type, data_inizio, data_fine_prevista, is_capocantiere, orders(order_code, description, work_address, indirizzo_lavori)")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .gte("data_fine_prevista", new Date().toISOString().slice(0, 10))
        .limit(10);
      payload.ordini_assegnati = (assignments ?? []) as AnyObj[];

      // Rapportini pending (stato bozza)
      const { data: rapportini } = await supabaseAdmin
        .from("campo_rapportini")
        .select("id, data_lavoro, descrizione_lavori, stato")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .eq("stato", "bozza")
        .limit(5);
      payload.rapportini_pending = rapportini ?? [];
    }

    // Appuntamenti oggi (per tutti)
    const today = new Date().toISOString().slice(0, 10);
    const { data: apts } = await supabaseAdmin
      .from("appointments")
      .select("title, appointment_date, appointment_time, address_line, address_city, status")
      .eq("company_id", companyId)
      .eq("appointment_date", today)
      .limit(8);
    payload.appuntamenti_oggi = (apts ?? []).map((a: AnyObj) => ({
      title: a.title,
      data: a.appointment_date,
      ora: a.appointment_time,
      luogo: [a.address_line, a.address_city].filter(Boolean).join(", "),
      status: a.status,
    }));
    const idempotencyKey = await buildStableAiIdempotencyKey("briefing_per_ruolo", [
      companyId,
      userId,
      primaryRole,
      today,
      payload,
    ]);

    // ── AI call ──────────────────────────────────────────────
    let aiResult;
    try {
      aiResult = await aiRouterComplete({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabaseAdmin as any,
        taskKey: "report_executive",   // riusa task balanced
        messages: [
          { role: "system", content: SYSTEM_PROMPT_BASE },
          { role: "user", content: `Genera briefing per:\n\n${JSON.stringify(payload, null, 2)}` },
        ],
        params: { temperature: 0.3, max_tokens: 1200 },
        responseFormat: { type: "json_object" },
        companyId,
        userId,
        idempotencyKey,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return errorResponse(`AI Router error: ${msg}`, 502, cors);
    }

    let briefing: AnyObj = {};
    try {
      briefing = JSON.parse(aiResult.content);
    } catch {
      return errorResponse("AI ha restituito JSON non valido", 502, cors);
    }

    return jsonResponse({
      success: true,
      briefing,
      contesto: {
        ruolo: primaryRole,
        utente: profile.first_name + " " + (profile.last_name ?? ""),
        dati_caricati: {
          alerts: (payload.alerts_open ?? []).length,
          ordini_assegnati: (payload.ordini_assegnati ?? []).length,
          rapportini_pending: (payload.rapportini_pending ?? []).length,
          contatti_hot: (payload.contatti_hot ?? []).length,
          appuntamenti_oggi: (payload.appuntamenti_oggi ?? []).length,
        },
      },
      ai_meta: {
        model_used: aiResult.modelUsed,
        tokens: aiResult.totalTokens,
        cost_billed_eur: aiResult.costBilledEur,
      },
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(`Errore interno: ${err instanceof Error ? err.message : String(err)}`, 500, getCorsHeaders(req));
  }
});
