/**
 * Edge Function: ai-prompt-evolution-weekly (MP-05)
 *
 * Sessione 4 / MP-05 — Self-improving prompts loop.
 *
 * Pipeline settimanale (chiamabile via cron pg_cron / Supabase Scheduled Function):
 *   1. Identifica top pain points: persona × categoria rejection negli ultimi
 *      30 giorni con rate >= 30% e almeno 10 rejection assolute.
 *      → RPC ai_top_persona_pain_points()
 *   2. Per ogni pain point, recupera il prompt attuale + esempi rejection.
 *   3. Chiama LLM (aiRouter) per proporre una revisione del prompt che
 *      affronta quella categoria specifica.
 *   4. Inserisce la proposta in ai_persona_prompt_proposals con status='draft'
 *      e generated_by_model. Idempotente: skip se proposta draft esistente
 *      per stessa persona/categoria nelle ultime 24h.
 *
 * Output: { proposed: N, skipped: M, errors: K, details: [...] }
 *
 * Auth: solo super_admin via JWT (check post-auth).
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

interface PainPointRow {
  persona_key: string;
  rejection_category: string;
  total_rejections: number;
  total_messages: number;
  rejection_rate: number;
}

interface PromptRevisionOutput {
  rationale: string;
  proposed_prompt: string;
  diff_summary: string;
  example_rejections_addressed: string[];
}

const SYSTEM_PROMPT_REVISION = `Sei un'esperta di prompt engineering specializzata in agenti AI per gestione aziendale.
Riceverai:
  - Un prompt persona attuale (system_prompt)
  - Una categoria di rejection ricorrente (es. "tono_troppo_formale", "manca_riferimento_dati", "ignora_contesto_cantiere")
  - Esempi di rejection feedback dell'utente

OBIETTIVO: proporre una revisione MIRATA del prompt che indirizza la categoria
problematica, SENZA stravolgere la persona o introdurre regression sui punti
di forza già funzionanti.

REGOLE:
1. La revisione deve essere INCREMENTALE: aggiungi una sezione esplicita
   "## Linee guida specifiche" con 2-4 bullet che indirizzano la categoria.
2. Non riscrivere da zero. Mantieni la voce e il tono della persona.
3. Includi 1-2 esempi concreti di "fai così" / "non fare così" se utile.
4. Non superare il 30% di lunghezza in più rispetto al prompt originale.

OUTPUT JSON OBBLIGATORIO:
{
  "rationale": "Spiegazione 2-3 frasi del cambio",
  "proposed_prompt": "Il nuovo prompt completo, pronto per essere salvato",
  "diff_summary": "Diff descrittivo: cosa è cambiato in 1 frase",
  "example_rejections_addressed": ["esempio rejection 1", "esempio rejection 2"]
}`;

async function fetchExampleRejections(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  personaKey: string,
  category: string,
  limit = 5,
): Promise<string[]> {
  try {
    const { data } = await supabase
      .from("ai_prompt_feedback_log")
      .select("user_feedback_text, situation_summary")
      .eq("persona_key", personaKey)
      .eq("rejection_category", category)
      .not("user_feedback_text", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (!Array.isArray(data)) return [];
    return data
      .map((r: { user_feedback_text?: string; situation_summary?: string }) =>
        r.user_feedback_text ?? r.situation_summary ?? "",
      )
      .filter((s: string) => s.length > 0)
      .slice(0, limit);
  } catch (e) {
    console.warn("[ai-prompt-evolution] example_rejections fetch:", e instanceof Error ? e.message : e);
    return [];
  }
}

async function existsRecentDraft(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  personaKey: string,
  category: string,
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("ai_persona_prompt_proposals")
      .select("id")
      .eq("persona_key", personaKey)
      .eq("status", "draft")
      .gte("generated_at", since)
      .ilike("rationale", `%${category}%`)
      .limit(1);
    if (error) return false;
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("POST only", 405, cors);

  const t0 = Date.now();
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, cors);

    // Solo super_admin può triggerare manualmente. Cron usa service role bypass.
    const { data: rolesRaw } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isSuper = (rolesRaw ?? []).some((r: { role?: string }) => r.role === "super_admin");
    if (!isSuper) return errorResponse("super_admin required", 403, cors);

    // ── 1) Pain points ────────────────────────────────────────────────────
    const { data: painsRaw, error: painsErr } = await supabaseAdmin.rpc(
      "ai_top_persona_pain_points",
      { p_min_rejections: 10, p_min_rate: 0.3, p_limit: 8 },
    );
    if (painsErr) return errorResponse(`pain_points: ${painsErr.message}`, 500, cors);
    const pains = (painsRaw ?? []) as PainPointRow[];

    if (pains.length === 0) {
      return jsonResponse({ proposed: 0, skipped: 0, errors: 0, details: [], note: "Nessun pain point sopra soglia." }, 200, cors);
    }

    let proposed = 0;
    let skipped = 0;
    let errors = 0;
    const details: Array<{ persona: string; category: string; status: string; proposal_id?: string; error?: string }> = [];

    for (const pp of pains) {
      try {
        // Skip se già esiste draft recente per stessa persona/categoria
        if (await existsRecentDraft(supabaseAdmin, pp.persona_key, pp.rejection_category)) {
          skipped++;
          details.push({ persona: pp.persona_key, category: pp.rejection_category, status: "skipped_recent_draft" });
          continue;
        }

        // ── 2) Carica persona corrente ───────────────────────────────────
        const { data: persona, error: pErr } = await supabaseAdmin
          .from("ai_personas")
          .select("persona_key, system_prompt, system_prompt_version")
          .eq("persona_key", pp.persona_key)
          .single();
        if (pErr || !persona) {
          errors++;
          details.push({ persona: pp.persona_key, category: pp.rejection_category, status: "error", error: `persona load: ${pErr?.message}` });
          continue;
        }

        // ── 3) Esempi rejection ─────────────────────────────────────────
        const examples = await fetchExampleRejections(supabaseAdmin, pp.persona_key, pp.rejection_category, 5);

        // ── 4) Chiama LLM per proposta ──────────────────────────────────
        const userMsg = `## Persona
- Chiave: ${pp.persona_key}

## Categoria rejection ricorrente
- ${pp.rejection_category} (${pp.total_rejections}/${pp.total_messages} = ${(pp.rejection_rate * 100).toFixed(1)}%)

## Esempi rejection (max 5)
${examples.length > 0 ? examples.map((e, i) => `${i + 1}. ${e.slice(0, 200)}`).join("\n") : "(nessun feedback testuale disponibile)"}

## Prompt attuale
\`\`\`
${persona.system_prompt}
\`\`\`

Genera ora la revisione (JSON valid).`;

        let llmOut: PromptRevisionOutput | null = null;
        let modelUsed = "unknown";
        let costEur = 0;
        try {
          const res = await aiRouterComplete({
            supabase: supabaseAdmin,
            taskKey: "prompt_evolution_revision",
            messages: [
              { role: "system", content: SYSTEM_PROMPT_REVISION },
              { role: "user", content: userMsg },
            ],
            params: { temperature: 0.4, max_tokens: 3000 },
            companyId: null,
            userId,
            personaKey: "system",
            idempotencyKey: `prompt_evolution_${pp.persona_key}_${pp.rejection_category}_${Date.now()}`,
          });
          modelUsed = res.modelUsed ?? "unknown";
          costEur = res.costBilledEur ?? 0;

          // Parse JSON tollerante
          const raw = (res.content ?? "").trim();
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            llmOut = JSON.parse(jsonMatch[0]) as PromptRevisionOutput;
          }
        } catch (e) {
          errors++;
          details.push({ persona: pp.persona_key, category: pp.rejection_category, status: "error", error: `llm: ${e instanceof Error ? e.message : e}` });
          continue;
        }

        if (!llmOut || !llmOut.proposed_prompt || llmOut.proposed_prompt.length < 200) {
          errors++;
          details.push({ persona: pp.persona_key, category: pp.rejection_category, status: "error", error: "llm output non valido o troppo corto" });
          continue;
        }

        // ── 5) Insert proposal ──────────────────────────────────────────
        const { data: insRow, error: insErr } = await supabaseAdmin
          .from("ai_persona_prompt_proposals")
          .insert({
            persona_key: pp.persona_key,
            company_id: null, // tenant-agnostic
            current_prompt: persona.system_prompt,
            current_version: persona.system_prompt_version ?? 1,
            proposed_prompt: llmOut.proposed_prompt,
            proposed_diff_summary: llmOut.diff_summary,
            rationale: `[${pp.rejection_category}] ${llmOut.rationale}`,
            example_rejections: examples,
            generated_by_model: modelUsed,
            status: "draft",
          })
          .select("id")
          .single();
        if (insErr || !insRow) {
          errors++;
          details.push({ persona: pp.persona_key, category: pp.rejection_category, status: "error", error: `insert: ${insErr?.message}` });
          continue;
        }
        proposed++;
        details.push({
          persona: pp.persona_key,
          category: pp.rejection_category,
          status: "proposed",
          proposal_id: insRow.id,
        });
      } catch (e) {
        errors++;
        details.push({ persona: pp.persona_key, category: pp.rejection_category, status: "error", error: e instanceof Error ? e.message : String(e) });
      }
    }

    return jsonResponse({
      proposed, skipped, errors,
      total_pain_points: pains.length,
      duration_ms: Date.now() - t0,
      details,
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(err instanceof Error ? err.message : String(err), 500, getCorsHeaders(req));
  }
});
