/**
 * MP-SALES-02 — Preventivo da Foto Orchestrator (LEGACY ASYNC)
 *
 * ⚠️ Flusso async legacy mantenuto per WhatsApp/Telegram/email inbound.
 * Per UI desktop usa invece l'edge SYNC `ai-quote-from-capture` (più moderno,
 * usa retrieval pgvector reale e supporta foto+audio+testo unificati).
 *
 * Triggerato dal tool `crea_preventivo_da_foto` (status='pending'). Esegue
 * pipeline asincrona:
 *   1. Per ogni foto: AI Vision (analyze_image vertical-aware)
 *   2. Compose computo metrico da risultati vision + listino vertical
 *   3. Crea quote con status='draft_ai'
 *   4. Aggiorna run con vision_results + computo_total + quote_id
 *   5. Notifica sales/PM via Silvio FAB (action_proposal yellow)
 *
 * Defensive: vertical_category_templates e tariffe_aziendali possono non
 * esistere → fallback a prezzi medi vertical.
 *
 * TODO refactor: sostituire prezzi hardcoded con la pipeline retrieval
 * pgvector di ai-quote-from-capture (oggi usa solo prezzi medi vertical).
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

interface Payload {
  run_id: string;
  company_id: string;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const { run_id, company_id } = payload;
  if (!run_id || !company_id) {
    return new Response(JSON.stringify({ error: "run_id, company_id required" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // 1. Carica run
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: runRow } = await (supabase as any)
      .from("preventivo_da_foto_runs")
      .select("*")
      .eq("id", run_id)
      .eq("company_id", company_id)
      .maybeSingle();

    if (!runRow) {
      return new Response(JSON.stringify({ error: "Run not found" }), {
        status: 404, headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Marca status=analyzing_images
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("preventivo_da_foto_runs")
      .update({ status: "analyzing_images" })
      .eq("id", run_id);

    // 3. AI Vision: prompt vertical-aware
    const verticalKey = runRow.vertical_key ?? "edili_generaliste";
    const visionPrompt = buildVisionPrompt(verticalKey, runRow.description);

    // Per ogni foto: signed URL, poi multimodale aiRouter
    const imageUrls: string[] = [];
    for (const path of (runRow.image_storage_paths ?? []) as string[]) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: signed } = await (supabase as any).storage
          .from("documenti-smart")
          .createSignedUrl(path, 60 * 60);
        if (signed?.signedUrl) imageUrls.push(signed.signedUrl);
      } catch { /* skip */ }
    }

    if (imageUrls.length === 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("preventivo_da_foto_runs")
        .update({
          status: "failed",
          error_step: "image_signing",
          error_message: "Nessuna foto accessibile (signed URL fallita)",
        })
        .eq("id", run_id);
      return new Response(JSON.stringify({ error: "no images" }), { status: 500 });
    }

    // Multimodale via aiRouter (task vision_cantiere)
    const aiResult = await aiRouterComplete({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      taskKey: "vision_cantiere",
      messages: [
        { role: "system", content: visionPrompt.system },
        {
          role: "user",
          content: [
            { type: "text", text: visionPrompt.userText },
            ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } })),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ] as any,
        },
      ],
      responseFormat: { type: "json_object" },
      params: { temperature: 0.2, max_tokens: 3000 },
      companyId: company_id,
      estimatedCostEur: 0.20,
      idempotencyKey: `preventivo-vision-${run_id}`,
    });

    // 4. Parse vision results
    let visionResults: Record<string, unknown> = {};
    try {
      visionResults = JSON.parse(aiResult.content);
    } catch {
      visionResults = { _raw: aiResult.content, _parse_failed: true };
    }

    // 5. Componi computo metrico da vision results + listino vertical
    const computo = await composeComputo(supabase, company_id, verticalKey, visionResults);

    // 6. Crea quote draft
    let quoteId: string | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: quote } = await (supabase as any)
        .from("quotes")
        .insert({
          company_id,
          customer_id: runRow.customer_id,
          status: "draft",
          is_ai_generated: true,
          ai_pdf_run_id: run_id,
          ai_persona_used: "tecnico",
          ai_cost_billed_eur: aiResult.costBilledEur ?? 0,
          total_amount: computo.total_eur,
          // Altri campi quote: best-effort, quote schema può variare
        })
        .select("id")
        .maybeSingle();
      if (quote?.id) quoteId = quote.id;
    } catch (e) {
      console.warn("[preventivo-foto] quote insert failed:", e instanceof Error ? e.message : String(e));
    }

    // 7. Update run con results + status=draft_ready
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).rpc("silvio_tool_aggiorna_preventivo_da_foto_results", {
      p_run_id: run_id,
      p_company_id: company_id,
      p_vision_results: visionResults,
      p_computo_draft: computo,
      p_computo_total_eur: computo.total_eur,
      p_vision_cost_billed_eur: aiResult.costBilledEur ?? 0,
      p_quote_id: quoteId,
      p_status: "draft_ready",
    });

    return new Response(
      JSON.stringify({
        success: true,
        run_id,
        quote_id: quoteId,
        computo_total_eur: computo.total_eur,
        vision_chars: aiResult.content.length,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[preventivo-da-foto-orchestrator] error:", msg);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("preventivo_da_foto_runs")
        .update({ status: "failed", error_step: "orchestrator", error_message: msg.substring(0, 500) })
        .eq("id", run_id);
    } catch { /* skip */ }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});

// ─── Vision prompt vertical-aware ────────────────────────────────────────────

interface VisionPrompt { system: string; userText: string; }

function buildVisionPrompt(verticalKey: string, description: string | null): VisionPrompt {
  const verticalGuides: Record<string, string> = {
    serramentisti: `Riconosci finestre, porte, persiane. Per ognuna: tipologia (1 anta/2 ante/scorrevole), dimensioni stimate (mm), materiale (PVC/legno/alluminio), vetro (singolo/doppio/triplo), condizioni attuali (buone/da sostituire/danneggiate).`,
    tettisti: `Riconosci tipologia manto (coppi/tegole/lamiera/membrana), pendenza, presenza isolamento, scossaline, lattoneria. Stima superficie mq.`,
    bagnisti: `Riconosci sanitari (lavabo/wc/bidet/doccia/vasca), pavimentazione (mq), rivestimenti (mq), impianti idrici, elettrici. Identifica eventuale necessità barriere architettoniche.`,
    facciatisti: `Riconosci superficie facciata, tipo intonaco esistente, eventuali ammaloramenti, presenza balconi, gronde. Stima superficie mq cappotto/intonaco.`,
    edili_generaliste: `Riconosci ambiente (interno/esterno), elementi strutturali, finiture, impianti visibili. Identifica intervento richiesto.`,
  };

  const guide = verticalGuides[verticalKey] ?? verticalGuides.edili_generaliste;

  return {
    system: `Sei un tecnico edilizio esperto in ${verticalKey}.
Analizza le foto del cantiere e ritorna JSON strutturato con elementi riconosciuti, dimensioni stimate, condizioni attuali.

GUIDA VERTICAL:
${guide}

Output JSON:
{
  "elementi_riconosciuti": [
    {"tipo": "...", "quantita": N, "unita": "pz|mq|ml", "dimensioni_stimate_mm": "Lxh", "condizioni": "...", "note": "..."}
  ],
  "superficie_totale_mq": N,
  "complessita_intervento": "bassa|media|alta",
  "rischi_identificati": ["..."],
  "confidence": 0.0-1.0,
  "note_tecniche": "..."
}`,
    userText: `Descrizione cliente: "${description ?? "(nessuna)"}". Analizza le foto allegate ed estrai computo strutturato.`,
  };
}

// ─── Compose computo (best-effort, listino vertical) ─────────────────────────

interface ComputoDraft {
  righe: Array<{
    descrizione: string;
    quantita: number;
    unita: string;
    prezzo_unitario_eur: number;
    importo_eur: number;
  }>;
  subtotal_eur: number;
  iva_pct: number;
  iva_eur: number;
  total_eur: number;
  vertical_key: string;
}

async function composeComputo(

  _supabase: unknown,
  _companyId: string,
  verticalKey: string,
  visionResults: Record<string, unknown>,
): Promise<ComputoDraft> {
  const computo: ComputoDraft = {
    righe: [],
    subtotal_eur: 0,
    iva_pct: 22,
    iva_eur: 0,
    total_eur: 0,
    vertical_key: verticalKey,
  };

  // Defensive: vision può avere format vario
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elementi: Array<any> = Array.isArray((visionResults as any)?.elementi_riconosciuti)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (visionResults as any).elementi_riconosciuti
    : [];

  // Prezzi medi indicativi per vertical (placeholder: in produzione carica da listino vertical_category_templates)
  const prezziMedi: Record<string, Record<string, number>> = {
    serramentisti: { default: 450, "1 anta": 350, "2 ante": 550, "scorrevole": 800 },
    tettisti: { default: 80, "coppi": 90, "tegole": 75, "lamiera": 60, "membrana": 50 },
    bagnisti: { default: 180, "lavabo": 250, "wc": 350, "doccia": 800, "vasca": 1200, "rivestimento": 80 },
    facciatisti: { default: 75, "cappotto": 95, "intonaco": 35 },
    edili_generaliste: { default: 100 },
  };

  const priceMap = prezziMedi[verticalKey] ?? prezziMedi.edili_generaliste;

  for (const el of elementi) {
    const tipo = String(el.tipo ?? "").toLowerCase();
    const qta = Number(el.quantita ?? 1);
    const unita = String(el.unita ?? "pz");
    if (qta <= 0) continue;

    // Match tipologia → prezzo
    let prezzo = priceMap.default;
    for (const [key, val] of Object.entries(priceMap)) {
      if (key !== "default" && tipo.includes(key)) {
        prezzo = val;
        break;
      }
    }

    const importo = Math.round(qta * prezzo * 100) / 100;
    computo.righe.push({
      descrizione: `${el.tipo}${el.note ? " — " + el.note : ""}`,
      quantita: qta,
      unita,
      prezzo_unitario_eur: prezzo,
      importo_eur: importo,
    });
    computo.subtotal_eur += importo;
  }

  computo.subtotal_eur = Math.round(computo.subtotal_eur * 100) / 100;
  computo.iva_eur = Math.round(computo.subtotal_eur * computo.iva_pct) / 100;
  computo.total_eur = Math.round((computo.subtotal_eur + computo.iva_eur) * 100) / 100;
  return computo;
}
