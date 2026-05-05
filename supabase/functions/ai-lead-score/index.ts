/**
 * ai-lead-score — FASE D
 *
 * Analizza un contatto marketing e attribuisce:
 *   - score 0-100
 *   - tier: hot|warm|cold|dormant
 *   - reasoning (max 2 frasi)
 *   - next_action (suggerimento concreto)
 *   - intent_signals (tag rilevati)
 *
 * Input:
 *   { contact_id: uuid, company_id: uuid }
 *   OR
 *   { contact_ids: uuid[], company_id: uuid }   // batch fino a 50
 *
 * Output:
 *   { success, scored: [{contact_id, score, tier, ...}], ai_meta }
 */

import { requireAuth } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

const SYSTEM_PROMPT = `Sei un analista commerciale esperto in lead scoring per aziende italiane di edilizia.
Analizza il contatto e attribuisci uno score 0-100 + classificazione + next action.

REGOLE PUNTEGGIO:
- 90-100 (HOT): contatto pronto a comprare, ha lasciato richiesta esplicita / preventivo recente / messaggi insistenti
- 70-89 (WARM): interesse chiaro ma non urgente, attività recente, info parziali ma promettenti
- 40-69 (COLD): scarsa attività, dati base, source debole (es. lead form generico)
- 0-39 (DORMANT): nessuna attività >180gg, optout, dati incompleti gravi

OBBLIGHI:
- score = numero intero
- tier deve coincidere con range score
- reasoning max 200 char, italiano, concreto
- next_action: 1 azione specifica concreta (es. "Chiama entro 24h", "Invia preventivo personalizzato", "Newsletter mensile")
- intent_signals: array stringhe brevi che hai dedotto (es. "interessato ristrutturazione", "tempi stretti", "budget alto")
- predicted_value_eur: stima conservativa valore primo ordine, 0 se non deducibile

OUTPUT JSON ESATTO (no markdown):
{
  "score": int,
  "tier": "hot"|"warm"|"cold"|"dormant",
  "reasoning": "string",
  "next_action": "string",
  "intent_signals": ["string"],
  "predicted_value_eur": number
}`;

interface ScoredContact {
  contact_id: string;
  score: number;
  tier: string;
  reasoning: string;
  next_action: string;
  intent_signals: string[];
  predicted_value_eur: number;
  error?: string;
}

async function scoreOneContact(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, contact: AnyObj, companyId: string, userId: string,
): Promise<{ scored: ScoredContact; modelUsed: string; tokens: number; costEur: number }> {
  // Fetch attività recenti
  const { data: activities } = await supabase
    .from("marketing_contact_activities")
    .select("activity_type, description, created_at")
    .eq("contact_id", contact.id)
    .order("created_at", { ascending: false })
    .limit(10);

  const { data: notes } = await supabase
    .from("marketing_contact_notes")
    .select("note_text, created_at")
    .eq("contact_id", contact.id)
    .order("created_at", { ascending: false })
    .limit(5);

  const payload = {
    contatto: {
      nome: `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim(),
      azienda: contact.company_name,
      city: contact.city,
      source: contact.source,
      contact_type: contact.contact_type,
      tags: contact.tags,
      notes_libere: contact.notes,
      created_at: contact.created_at,
      last_activity_at: contact.last_activity_at,
      score_attuale: contact.score,
      unsubscribed: contact.unsubscribed,
      optout: {
        email: contact.optout_email,
        whatsapp: contact.optout_whatsapp,
        sms: contact.optout_sms,
        call: contact.optout_call,
      },
    },
    attivita_recenti: activities ?? [],
    note_recenti: notes ?? [],
    giorni_dalla_creazione: contact.created_at
      ? Math.round((Date.now() - new Date(contact.created_at).getTime()) / 86400000)
      : null,
    giorni_dall_ultima_attivita: contact.last_activity_at
      ? Math.round((Date.now() - new Date(contact.last_activity_at).getTime()) / 86400000)
      : null,
  };

  const aiResult = await aiRouterComplete({
    supabase,
    taskKey: "lead_score",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(payload, null, 2) },
    ],
    params: { temperature: 0.2, max_tokens: 800 },
    responseFormat: { type: "json_object" },
    companyId,
    userId,
  });

  let parsed: AnyObj;
  try {
    parsed = JSON.parse(aiResult.content);
  } catch {
    throw new Error("AI returned invalid JSON");
  }

  const scoreClamped = Math.max(0, Math.min(100, parseInt(parsed.score, 10) || 0));
  const tier = ["hot", "warm", "cold", "dormant"].includes(parsed.tier) ? parsed.tier : "cold";

  // Persist
  await supabase
    .from("marketing_contacts")
    .update({
      ai_score: scoreClamped,
      ai_score_tier: tier,
      ai_score_reasoning: String(parsed.reasoning ?? "").slice(0, 1000),
      ai_next_action: String(parsed.next_action ?? "").slice(0, 500),
      ai_intent_signals: Array.isArray(parsed.intent_signals) ? parsed.intent_signals : [],
      ai_predicted_value_eur: Number(parsed.predicted_value_eur ?? 0) || 0,
      ai_scored_at: new Date().toISOString(),
      ai_score_model: aiResult.modelUsed,
    })
    .eq("id", contact.id);

  return {
    scored: {
      contact_id: contact.id,
      score: scoreClamped,
      tier,
      reasoning: String(parsed.reasoning ?? ""),
      next_action: String(parsed.next_action ?? ""),
      intent_signals: Array.isArray(parsed.intent_signals) ? parsed.intent_signals : [],
      predicted_value_eur: Number(parsed.predicted_value_eur ?? 0) || 0,
    },
    modelUsed: aiResult.modelUsed,
    tokens: aiResult.totalTokens,
    costEur: aiResult.costRealEur,
  };
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
    const { contact_id, contact_ids, company_id } = body as {
      contact_id?: string;
      contact_ids?: string[];
      company_id?: string;
    };

    if (!company_id) return errorResponse("company_id obbligatorio", 400, cors);

    const ids = contact_ids && contact_ids.length > 0
      ? contact_ids.slice(0, 50)
      : contact_id ? [contact_id] : [];
    if (ids.length === 0) return errorResponse("contact_id o contact_ids obbligatorio", 400, cors);

    // Fetch contacts
    const { data: contacts, error: fetchErr } = await supabaseAdmin
      .from("marketing_contacts")
      .select("*")
      .eq("company_id", company_id)
      .in("id", ids);
    if (fetchErr) return errorResponse(`Fetch contacts error: ${fetchErr.message}`, 500, cors);
    if (!contacts || contacts.length === 0) {
      return errorResponse("Nessun contatto trovato", 404, cors);
    }

    const results: ScoredContact[] = [];
    let totTokens = 0;
    let totCostEur = 0;
    let lastModel = "";

    for (const c of contacts as AnyObj[]) {
      try {
        const r = await scoreOneContact(supabaseAdmin, c, company_id, userId);
        results.push(r.scored);
        totTokens += r.tokens;
        totCostEur += r.costEur;
        lastModel = r.modelUsed;
      } catch (e) {
        results.push({
          contact_id: c.id,
          score: 0,
          tier: "cold",
          reasoning: "",
          next_action: "",
          intent_signals: [],
          predicted_value_eur: 0,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return jsonResponse({
      success: true,
      scored: results,
      ai_meta: {
        contacts_processed: results.length,
        contacts_failed: results.filter((r) => r.error).length,
        model_used: lastModel,
        total_tokens: totTokens,
        total_cost_eur: totCostEur,
      },
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(`Errore interno: ${err instanceof Error ? err.message : String(err)}`, 500, getCorsHeaders(req));
  }
});
