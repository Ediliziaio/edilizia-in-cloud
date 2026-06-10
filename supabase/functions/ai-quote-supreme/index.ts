/**
 * Edge Function: ai-quote-supreme (MP-08)
 *
 * Sessione 3 / MP-08 — Quote Intelligence Layer.
 * Sopra ad ai-genera-preventivo-v2, aggiunge l'advisor intelligente che
 * arricchisce un preventivo proposto/da-comporre con:
 *
 *   1. Margin history del cliente (da client_margin_history): margine medio
 *      accettato, sconto medio in trattativa, payment terms preferiti, loyalty.
 *   2. Clausole standard pertinenti (quote_clause_templates filtrate per
 *      project size + tipo) — pronte da iniettare nel preventivo.
 *   3. RAG semantico su preventivi storici simili (ai_brain_documents
 *      source_type=quote) con confronto prezzi, accettazione/rifiuto, note.
 *   4. Recommended pricing strategy: prezzo target, sconto suggerito,
 *      markup minimo per non perdere il cliente, banda accettazione.
 *   5. Confidence score finale (0..1) e human-review flag se margine < soglia
 *      o cliente HVI (high-value-impact).
 *
 * Input:
 *   {
 *     mode: "advise" | "compose",
 *     customer_id?: uuid,                  // se cliente esistente
 *     customer_name?: string,              // per clienti unstructured
 *     project_description?: string,        // testo descrittivo
 *     project_estimated_value_eur?: number,
 *     project_type?: string,               // ristrutturazione | nuova_costruzione | ...
 *     proposed_lines?: Array<{descrizione, quantita?, prezzo_unitario, importo}>,
 *     proposed_total?: number,
 *     proposed_margin_pct?: number,
 *   }
 *
 * Output advise:
 *   {
 *     customer_intelligence: { ... margin history + loyalty + payment },
 *     similar_quotes: [{ quote_id, similarity, status, total, margin_pct, notes }],
 *     suggested_clauses: [{ category, title, content }],
 *     pricing_strategy: {
 *       target_total_eur, suggested_discount_pct, min_acceptable_margin_pct,
 *       acceptance_band: { p20, p50, p80 },
 *       reasoning
 *     },
 *     warnings: [],
 *     confidence: 0..1,
 *     requires_human_review: boolean
 *   }
 *
 * Mode "compose" delega a ai-genera-preventivo-v2 con i parametri arricchiti.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { gateAiPayment } from "../_shared/requirePaymentMethod.ts";
import { generateEmbeddingsBatch } from "../_shared/brainEmbed.ts";

interface AdviseRequest {
  mode?: "advise" | "compose";
  customer_id?: string | null;
  customer_name?: string | null;
  project_description?: string;
  project_estimated_value_eur?: number;
  project_type?: string;
  proposed_lines?: Array<{ descrizione?: string; quantita?: number; prezzo_unitario?: number; importo?: number }>;
  proposed_total?: number;
  proposed_margin_pct?: number;
}

interface MarginHistRow {
  customer_id: string | null;
  customer_name: string | null;
  total_quotes: number;
  accepted_quotes: number;
  avg_acceptance_margin_pct: number | null;
  avg_negotiation_discount_pct: number | null;
  preferred_payment_terms: string | null;
  typical_project_size_eur: number | null;
  loyalty_score: number;
  last_quote_at: string | null;
  last_accepted_at: string | null;
}

interface ClauseTemplate {
  category: string;
  title: string;
  content: string;
  applicable_to: Record<string, unknown> | null;
  is_default: boolean;
}

const DEFAULT_MARGIN_FLOOR_PCT = 8;

function pct(n: number | null | undefined): number {
  if (n === null || n === undefined || !Number.isFinite(n)) return 0;
  return Number(n);
}

/**
 * Determina se una clausola è applicabile al progetto corrente in base
 * alla colonna applicable_to (es. {project_min_eur: 10000, project_types: [...]}).
 */
function clauseFits(c: ClauseTemplate, projectValue: number | null, projectType: string | null): boolean {
  if (!c.applicable_to || Object.keys(c.applicable_to).length === 0) return true;
  const rule = c.applicable_to as { project_min_eur?: number; project_max_eur?: number; project_types?: string[] };
  if (projectValue !== null) {
    if (typeof rule.project_min_eur === "number" && projectValue < rule.project_min_eur) return false;
    if (typeof rule.project_max_eur === "number" && projectValue > rule.project_max_eur) return false;
  }
  if (projectType && Array.isArray(rule.project_types) && rule.project_types.length > 0) {
    if (!rule.project_types.map((s) => String(s).toLowerCase()).includes(projectType.toLowerCase())) return false;
  }
  return true;
}

/**
 * Calcola la pricing strategy unendo: storico cliente, valore progetto,
 * proposed_total/margin se forniti.
 */
function buildPricingStrategy(
  hist: MarginHistRow | null,
  projectValue: number | null,
  proposedTotal: number | null,
  proposedMarginPct: number | null,
): {
  target_total_eur: number | null;
  suggested_discount_pct: number;
  min_acceptable_margin_pct: number;
  acceptance_band: { p20: number | null; p50: number | null; p80: number | null };
  reasoning: string[];
} {
  const reasoning: string[] = [];
  // Storico cliente
  const histDiscount = hist ? pct(hist.avg_negotiation_discount_pct) : 0;
  const histMargin = hist ? pct(hist.avg_acceptance_margin_pct) : 0;
  const loyalty = hist?.loyalty_score ?? 0;
  const histProjectSize = hist?.typical_project_size_eur ?? null;

  // Sconto suggerito: storico cliente -2pp se loyalty alta (>70), +2pp se low (<30)
  let suggestedDiscount = histDiscount;
  if (loyalty >= 70) {
    suggestedDiscount = Math.max(0, suggestedDiscount - 2);
    reasoning.push(`Cliente loyalty alta (${loyalty}/100) → sconto ridotto di 2pp`);
  } else if (loyalty < 30 && hist) {
    suggestedDiscount = suggestedDiscount + 2;
    reasoning.push(`Cliente loyalty bassa (${loyalty}/100) → sconto aumentato di 2pp per acquisirlo`);
  } else if (hist) {
    reasoning.push(`Storico cliente: sconto medio negoziato ${histDiscount.toFixed(1)}%, margine accettato ${histMargin.toFixed(1)}%`);
  } else {
    reasoning.push("Nessuno storico cliente — uso default conservativi");
  }

  // Margine minimo: max(margine accettato - 3pp, floor 8%)
  const minMargin = Math.max(histMargin - 3, DEFAULT_MARGIN_FLOOR_PCT);
  reasoning.push(`Margine minimo accettabile: ${minMargin.toFixed(1)}% (floor ${DEFAULT_MARGIN_FLOOR_PCT}%)`);

  // Banda accettazione: stima da histProjectSize ± deviazione standard surrogata 30%
  let p20: number | null = null, p50: number | null = null, p80: number | null = null;
  const sizeAnchor = projectValue ?? histProjectSize ?? proposedTotal ?? null;
  if (sizeAnchor !== null) {
    p20 = sizeAnchor * 0.85;
    p50 = sizeAnchor;
    p80 = sizeAnchor * 1.18;
  }

  // Target total: proposed_total - sconto suggerito su valore progetto
  let targetTotal: number | null = null;
  if (proposedTotal !== null) {
    targetTotal = proposedTotal * (1 - suggestedDiscount / 100);
  } else if (projectValue !== null) {
    targetTotal = projectValue * (1 - suggestedDiscount / 100);
  }

  // Warning su proposed_margin troppo basso
  if (proposedMarginPct !== null && proposedMarginPct < minMargin) {
    reasoning.push(`⚠️ Margine proposto ${proposedMarginPct.toFixed(1)}% < minimo ${minMargin.toFixed(1)}%`);
  }

  return {
    target_total_eur: targetTotal,
    suggested_discount_pct: Number(suggestedDiscount.toFixed(2)),
    min_acceptable_margin_pct: Number(minMargin.toFixed(2)),
    acceptance_band: { p20, p50, p80 },
    reasoning,
  };
}

serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("POST only", 405, cors);

  const t0 = Date.now();
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, cors);
    const body = (await req.json()) as AdviseRequest;
    const mode = body.mode ?? "advise";

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();
    const companyId = profile?.company_id;
    if (!companyId) return errorResponse("company_id non risolto", 403, cors);
    await requireCompanyAccess(supabaseAdmin, userId, companyId, cors);

    // Gate carta (audit AI 2026-06): strumento a costo senza controllo pagamento.
    const paymentBlock = await gateAiPayment(supabaseAdmin, companyId, cors);
    if (paymentBlock) return paymentBlock;

    const projectValue = typeof body.project_estimated_value_eur === "number"
      ? body.project_estimated_value_eur
      : (typeof body.proposed_total === "number" ? body.proposed_total : null);
    const projectType = body.project_type ?? null;
    const proposedTotal = typeof body.proposed_total === "number" ? body.proposed_total : null;
    const proposedMarginPct = typeof body.proposed_margin_pct === "number" ? body.proposed_margin_pct : null;

    // ── 1) Customer intelligence (margin history) ──────────────────────
    let custIntel: MarginHistRow | null = null;
    if (body.customer_id || body.customer_name) {
      const { data } = await supabaseAdmin
        .from("client_margin_history")
        .select("customer_id, customer_name, total_quotes, accepted_quotes, avg_acceptance_margin_pct, avg_negotiation_discount_pct, preferred_payment_terms, typical_project_size_eur, loyalty_score, last_quote_at, last_accepted_at")
        .eq("company_id", companyId)
        .or(
          body.customer_id
            ? `customer_id.eq.${body.customer_id}`
            : `customer_name.eq.${body.customer_name}`,
        )
        .limit(1)
        .maybeSingle();
      custIntel = (data as MarginHistRow | null) ?? null;
    }

    // ── 2) Suggested clauses ──────────────────────────────────────────
    const { data: clausesRaw } = await supabaseAdmin
      .from("quote_clause_templates")
      .select("category, title, content, applicable_to, is_default")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("sort_order", { ascending: true });
    const allClauses = (clausesRaw ?? []) as ClauseTemplate[];
    const fittingClauses = allClauses.filter((c) => clauseFits(c, projectValue, projectType));

    // ── 3) RAG su preventivi simili ───────────────────────────────────
    const similarQuotes: Array<{
      brain_doc_id: string;
      similarity: number;
      content_preview: string;
      metadata: Record<string, unknown>;
    }> = [];
    const queryText = [
      body.project_description ?? "",
      body.project_type ?? "",
      body.proposed_lines?.map((l) => l.descrizione).filter(Boolean).join(", ") ?? "",
    ].filter(Boolean).join(" — ").trim();

    if (queryText.length >= 6) {
      try {
        const [embedding] = await generateEmbeddingsBatch([queryText]);
        if (embedding && embedding.length > 0) {
          const { data: matches } = await supabaseAdmin.rpc("match_brain", {
            p_company_id: companyId,
            p_query_embedding: `[${embedding.join(",")}]`,
            p_match_count: 5,
            p_min_similarity: 0.7,
            p_source_types: ["quote"],
            p_include_universal: false,
            p_universal_categories: null,
          });
          if (Array.isArray(matches)) {
            for (const m of matches) {
              similarQuotes.push({
                brain_doc_id: (m as { id?: string }).id ?? "",
                similarity: Number((m as { similarity?: number }).similarity ?? 0),
                content_preview: String((m as { content?: string }).content ?? "").slice(0, 280),
                metadata: ((m as { metadata?: Record<string, unknown> }).metadata) ?? {},
              });
            }
          }
        }
      } catch (e) {
        console.warn("[ai-quote-supreme] RAG quotes simili fallita (graceful):", e instanceof Error ? e.message : e);
      }
    }

    // ── 4) Pricing strategy ────────────────────────────────────────────
    const strategy = buildPricingStrategy(custIntel, projectValue, proposedTotal, proposedMarginPct);

    // ── 5) Confidence + human review flag ──────────────────────────────
    const warnings: string[] = [];
    let confidence = 0.7; // baseline
    if (custIntel) confidence += 0.1;
    if (similarQuotes.length >= 3) confidence += 0.1;
    if (fittingClauses.length >= 2) confidence += 0.05;
    if (proposedMarginPct !== null && proposedMarginPct < strategy.min_acceptable_margin_pct) {
      confidence -= 0.2;
      warnings.push(`Margine proposto sotto soglia minima — rivedere`);
    }
    if (projectValue !== null && projectValue >= 50000 && !custIntel) {
      warnings.push("Progetto > €50k senza storico cliente — caldamente consigliata revisione umana");
    }
    confidence = Math.max(0, Math.min(1, confidence));
    const requiresHumanReview =
      confidence < 0.55 ||
      warnings.length >= 2 ||
      (proposedMarginPct !== null && proposedMarginPct < strategy.min_acceptable_margin_pct) ||
      (projectValue !== null && projectValue >= 100000);

    const adviseResult = {
      customer_intelligence: custIntel,
      similar_quotes: similarQuotes,
      suggested_clauses: fittingClauses.slice(0, 6),
      pricing_strategy: strategy,
      warnings,
      confidence: Number(confidence.toFixed(2)),
      requires_human_review: requiresHumanReview,
      computed_in_ms: Date.now() - t0,
    };

    // Audit trail (best-effort) — usa schema MP-08 quote_generation_audit
    try {
      await supabaseAdmin.from("quote_generation_audit").insert({
        company_id: companyId,
        user_id: userId,
        brief_input: (body.project_description ?? body.customer_name ?? "supreme:advise").slice(0, 2000),
        parsed_brief: {
          mode: `supreme:${mode}`,
          customer_id: body.customer_id ?? null,
          customer_name: body.customer_name ?? null,
          project_type: projectType,
          project_estimated_value_eur: projectValue,
          proposed_total: proposedTotal,
          proposed_margin_pct: proposedMarginPct,
        },
        margin_strategy: {
          suggested_discount_pct: strategy.suggested_discount_pct,
          min_acceptable_margin_pct: strategy.min_acceptable_margin_pct,
          target_total_eur: strategy.target_total_eur,
          acceptance_band: strategy.acceptance_band,
          reasoning: strategy.reasoning,
          customer_intelligence: custIntel,
        },
        feasibility_warnings: warnings,
        benchmark_comparison: { similar_quotes_count: similarQuotes.length, similar_quotes: similarQuotes.slice(0, 3) },
        ai_confidence: confidence >= 0.8 ? "high" : confidence >= 0.55 ? "medium" : "low",
        ai_duration_ms: Date.now() - t0,
      });
    } catch (e) {
      console.warn("[ai-quote-supreme] audit insert (non bloccante):", e instanceof Error ? e.message : e);
    }

    if (mode === "advise") {
      return jsonResponse(adviseResult, 200, cors);
    }

    // mode === "compose": delega a v2 con strategia arricchita (best-effort)
    try {
      const { data: v2Res, error: v2Err } = await supabaseAdmin.functions.invoke(
        "ai-genera-preventivo-v2",
        {
          body: {
            customer_id: body.customer_id,
            customer_name: body.customer_name,
            project_description: body.project_description,
            project_estimated_value_eur: projectValue,
            project_type: projectType,
            proposed_lines: body.proposed_lines,
            proposed_total: proposedTotal,
            // Iniettiamo la strategia come hint
            ai_advisor_strategy: strategy,
            ai_advisor_clauses: fittingClauses.slice(0, 6),
          },
          headers: { Authorization: req.headers.get("Authorization") ?? "" },
        },
      );
      if (v2Err) {
        return jsonResponse({
          mode: "compose",
          advise: adviseResult,
          v2_error: v2Err.message,
        }, 200, cors);
      }
      return jsonResponse({
        mode: "compose",
        advise: adviseResult,
        v2_result: v2Res ?? null,
      }, 200, cors);
    } catch (e) {
      return jsonResponse({
        mode: "compose",
        advise: adviseResult,
        v2_exception: e instanceof Error ? e.message : String(e),
      }, 200, cors);
    }
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(err instanceof Error ? err.message : String(err), 500, getCorsHeaders(req));
  }
});
