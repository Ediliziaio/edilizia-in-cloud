/**
 * document-ai-linker — Cervello che collega.
 *
 * Riceve dati estratti da un documento (output di ddt-ai-extract o
 * generic-doc-ai-extract) + doc_type + company_id, e produce suggerimenti
 * ranked di "a chi appartiene":
 *   - Layer 1 (deterministic): match P.IVA esatto, codice fiscale, numero univoco
 *   - Layer 2 (fuzzy): match ragione sociale via pg_trgm
 *   - Layer 3 (AI): ranking finale con reasoning
 *
 * Per ora copre il caso DDT (Sprint A). Architettura estendibile a fattura,
 * polizza, collaudo, ecc.
 *
 * Output:
 *   {
 *     success: true,
 *     doc_type: "ddt",
 *     suggestions: [
 *       {
 *         entity_table: "purchase_orders",
 *         entity_id: "uuid",
 *         label: "OdA #PO-2026-0042 — IV Group, €1.220",
 *         summary: { ... },
 *         scores: { layer1, layer2, layer3, combined },
 *         reasoning: "...",
 *         rank: 1,
 *       },
 *       ...
 *     ],
 *     policy: { auto_execute_threshold, always_confirm, show_alternatives },
 *     auto_executable: bool,    // true se top.combined >= threshold && !always_confirm
 *     ai_meta: { model_used, tokens, cost_eur, elapsed_ms }
 *   }
 */
import { requireAuth } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

interface DdtExtracted {
  intestazione?: { numero_ddt?: string; data_ddt?: string };
  mittente?: { ragione_sociale?: string; partita_iva?: string };
  destinatario?: { ragione_sociale?: string };
  righe_merce?: Array<{ descrizione?: string; quantita?: number; unita_misura?: string }>;
  totali?: { totale_documento_eur?: number };
}

const RANKING_PROMPT = `Sei l'assistente di un'impresa edile italiana. Devi assegnare un Documento di Trasporto (DDT) ricevuto al giusto Ordine d'Acquisto (OdA) aperto.

Ricevi:
1. I dati del DDT estratti (mittente, righe merce, totale, data)
2. Una lista di OdA candidati pre-filtrati per fornitore (con importo, data attesa consegna, stato, descrizione commessa)

Devi:
- Confrontare le righe merce del DDT con la descrizione/oggetto della commessa associata all'OdA
- Confrontare il totale DDT con totale OdA (margine ±15% accettabile)
- Confrontare la data DDT con la data attesa consegna OdA
- Dare un punteggio 0-1 (layer3_ai_score) per CIASCUN candidato
- Spiegare in 1-2 frasi italiane il MOTIVO del ranking (per il candidato top)

REGOLE:
1. Se il DDT chiaramente NON corrisponde a NESSUN OdA, ritorna lista vuota.
2. Se più OdA combaciano molto, ordina per data_attesa più vicina al DDT.
3. Mai inventare match: se incerto, score basso (0.3-0.5).

Ritorna SOLO JSON:
{
  "rankings": [
    { "purchase_order_id": "uuid", "ai_score": 0.X, "reasoning": "..." }
  ],
  "best_reasoning": "Frase complessiva che spiega il top match",
  "no_match_reason": "se rankings vuoto: perché"
}`;

async function aiRankCandidates(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  ddtExtracted: DdtExtracted,
  candidates: Array<Record<string, unknown>>,
  companyId: string,
  userId: string | null,
): Promise<{ rankings: Array<{ purchase_order_id: string; ai_score: number; reasoning: string }>; best_reasoning: string; ai_meta: Record<string, unknown> }> {
  if (candidates.length === 0) {
    return { rankings: [], best_reasoning: "", ai_meta: {} };
  }

  const userMessage = `DDT estratto:
${JSON.stringify({
  mittente: ddtExtracted.mittente,
  data: ddtExtracted.intestazione?.data_ddt,
  numero: ddtExtracted.intestazione?.numero_ddt,
  totale_eur: ddtExtracted.totali?.totale_documento_eur,
  righe: (ddtExtracted.righe_merce ?? []).slice(0, 20).map(r => ({
    desc: r.descrizione, qta: r.quantita, um: r.unita_misura,
  })),
}, null, 2)}

OdA candidati (pre-filtrati per fornitore, score di base = combined_score):
${JSON.stringify(candidates.map(c => ({
  purchase_order_id: c.purchase_order_id,
  oda_number: c.oda_number,
  status: c.status,
  total_eur: c.total_eur,
  expected_delivery: c.expected_delivery_date,
  amount_match_score: c.amount_match_score,
  date_match_score: c.date_match_score,
  commessa: c.order_description,
})), null, 2)}

Restituisci il ranking JSON come specificato.`;

  const t0 = Date.now();
  const aiResult = await aiRouterComplete({
    supabase: supabaseAdmin,
    taskKey: "computo_extract", // text-only task, basta gpt-4o-mini
    messages: [
      { role: "system", content: RANKING_PROMPT },
      { role: "user", content: userMessage },
    ],
    params: { temperature: 0.0, max_tokens: 2000 },
    responseFormat: { type: "json_object" },
    companyId,
    userId,
  });
  const elapsedMs = Date.now() - t0;

  let parsed: { rankings?: Array<{ purchase_order_id: string; ai_score: number; reasoning: string }>; best_reasoning?: string };
  try {
    const raw = aiResult.content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    parsed = JSON.parse(raw);
  } catch {
    parsed = { rankings: [] };
  }

  return {
    rankings: parsed.rankings ?? [],
    best_reasoning: parsed.best_reasoning ?? "",
    ai_meta: {
      model_used: aiResult.modelUsed,
      tokens: aiResult.totalTokens,
      cost_eur: aiResult.costRealEur,
      cost_billed_eur: aiResult.costBilledEur,
      elapsed_ms: elapsedMs,
    },
  };
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("POST only", 405, cors);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, cors);
    const body = await req.json();
    const { doc_type, extracted, company_id, file_info } = body as {
      doc_type?: string;
      extracted?: Record<string, unknown>;
      company_id?: string;
      file_info?: { storage_bucket: string; storage_path: string; file_name: string };
    };

    if (!doc_type || !extracted || !company_id) {
      return errorResponse("doc_type, extracted, company_id required", 400, cors);
    }

    // Fetch policy
    const { data: policyData } = await supabaseAdmin.rpc("get_link_policy", {
      p_doc_type: doc_type,
    });
    const policy = (policyData ?? {
      auto_execute_threshold: 1.0,
      always_confirm: true,
      show_alternatives: true,
    }) as { auto_execute_threshold: number; always_confirm: boolean; show_alternatives: boolean };

    // ─── DDT specific path ───────────────────────────────────────────────
    if (doc_type === "ddt") {
      const ddt = extracted as DdtExtracted;
      const mittenteVat = ddt?.mittente?.partita_iva ?? null;
      const mittenteName = ddt?.mittente?.ragione_sociale ?? null;
      const ddtTotale = ddt?.totali?.totale_documento_eur ?? null;
      const ddtData = ddt?.intestazione?.data_ddt ?? null;

      // Layer 1+2: trova fornitori candidati
      const { data: supplierCandidates, error: supErr } = await supabaseAdmin.rpc(
        "ddt_find_supplier_candidates",
        {
          p_company_id: company_id,
          p_vat_number: mittenteVat,
          p_name: mittenteName,
        }
      );
      if (supErr) return errorResponse(`supplier match: ${supErr.message}`, 500, cors);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const suppliers = (supplierCandidates ?? []) as any[];
      if (suppliers.length === 0) {
        return jsonResponse({
          success: true,
          doc_type,
          suggestions: [],
          policy,
          auto_executable: false,
          message: `Nessun fornitore trovato per "${mittenteName ?? mittenteVat ?? "—"}". Crea il fornitore prima di importare il DDT.`,
          file_info: file_info ?? null,
        }, 200, cors);
      }

      // Top supplier
      const topSupplier = suppliers[0];

      // Layer 1+2: trova OdA aperti del fornitore
      const { data: odaCandidates, error: odaErr } = await supabaseAdmin.rpc(
        "ddt_find_purchase_order_candidates",
        {
          p_company_id: company_id,
          p_supplier_id: topSupplier.supplier_id,
          p_ddt_total_eur: ddtTotale,
          p_ddt_date: ddtData,
        }
      );
      if (odaErr) return errorResponse(`oda match: ${odaErr.message}`, 500, cors);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const odaList = (odaCandidates ?? []) as any[];

      // Layer 3: AI ranking finale
      const { rankings, best_reasoning, ai_meta } = await aiRankCandidates(
        supabaseAdmin,
        ddt,
        odaList,
        company_id,
        userId,
      );

      // Combine: per ogni OdA, prendi layer1+2 score + layer3 AI score
      const aiScoreMap = new Map<string, { ai_score: number; reasoning: string }>();
      for (const r of rankings) {
        aiScoreMap.set(r.purchase_order_id, { ai_score: r.ai_score, reasoning: r.reasoning });
      }

      const suggestions = odaList.map((oda) => {
        const ai = aiScoreMap.get(oda.purchase_order_id);
        const layer1 = topSupplier.match_kind === "vat_exact" ? 1.0 : 0.7; // herited from supplier match
        const layer2 = Number(oda.combined_score) || 0.5;
        const layer3 = ai?.ai_score ?? 0.5;
        // Combined: pesi 0.4 Layer1 (supplier confidence), 0.3 Layer2 (heuristic OdA), 0.3 Layer3 (AI)
        const combined = (0.4 * layer1) + (0.3 * layer2) + (0.3 * layer3);
        return {
          entity_table: "purchase_orders",
          entity_id: oda.purchase_order_id,
          label: `OdA ${oda.oda_number} · ${topSupplier.supplier_name} · €${(oda.total_eur ?? 0).toLocaleString("it-IT")}`,
          summary: {
            oda_number: oda.oda_number,
            supplier_name: topSupplier.supplier_name,
            supplier_id: topSupplier.supplier_id,
            status: oda.status,
            total_eur: oda.total_eur,
            expected_delivery: oda.expected_delivery_date,
            order_description: oda.order_description,
            order_id: oda.order_id,
            customer_id: oda.customer_id,
          },
          scores: {
            layer1_supplier: layer1,
            layer2_heuristic: layer2,
            layer3_ai: layer3,
            combined,
          },
          reasoning: ai?.reasoning ?? "Score basato su match heuristic (importo + data).",
        };
      });

      // Sort by combined desc + assign rank
      suggestions.sort((a, b) => b.scores.combined - a.scores.combined);
      const ranked = suggestions.map((s, i) => ({ ...s, rank: i + 1 }));

      // Auto-executable?
      const top = ranked[0];
      const autoExecutable = !!(
        top &&
        !policy.always_confirm &&
        top.scores.combined >= policy.auto_execute_threshold
      );

      // Persist suggestions in document_link_suggestions (per audit + UI history)
      if (file_info && ranked.length > 0) {
        const rows = ranked.slice(0, 5).map((s) => ({
          company_id,
          storage_bucket: file_info.storage_bucket,
          storage_path: file_info.storage_path,
          file_name: file_info.file_name,
          doc_type,
          candidate_entity_table: s.entity_table,
          candidate_entity_id: s.entity_id,
          candidate_label: s.label,
          candidate_summary: s.summary,
          layer1_deterministic_match: topSupplier.match_kind === "vat_exact",
          layer2_fuzzy_score: s.scores.layer2_heuristic,
          layer3_ai_score: s.scores.layer3_ai,
          combined_score: s.scores.combined,
          reasoning: s.reasoning,
          rank: s.rank,
        }));
        await supabaseAdmin.from("document_link_suggestions").insert(rows);
      }

      return jsonResponse({
        success: true,
        doc_type,
        supplier_match: {
          id: topSupplier.supplier_id,
          name: topSupplier.supplier_name,
          match_kind: topSupplier.match_kind,
          score: topSupplier.score,
        },
        suggestions: ranked,
        best_reasoning: best_reasoning ?? null,
        policy,
        auto_executable: autoExecutable,
        file_info: file_info ?? null,
        ai_meta,
      }, 200, cors);
    }

    // ─── Altri tipi: per ora solo policy hint, nessun match concreto ────
    return jsonResponse({
      success: true,
      doc_type,
      suggestions: [],
      policy,
      auto_executable: false,
      message: `Linker per tipo "${doc_type}" non ancora implementato. Sarà disponibile nello Sprint B.`,
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(err instanceof Error ? err.message : String(err), 500, getCorsHeaders(req));
  }
});
