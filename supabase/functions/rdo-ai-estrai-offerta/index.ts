/**
 * rdo-ai-estrai-offerta — legge il preventivo del fornitore (PDF o foto) e
 * PROPONE i prezzi per la griglia di confronto della richiesta d'offerta.
 *
 * Propone, non scrive: il risultato torna al browser, una persona lo guarda
 * riga per riga e decide cosa applicare. La regola dell'area RDO resta:
 * l'AI non mette mai un prezzo nel database da sola, perche' un preventivo
 * letto male vale piu' danni di dieci minuti di digitazione — ma dieci minuti
 * di digitazione per tre fornitori a settimana sono ore, e QUELLE le puo'
 * fare la macchina, con l'umano a controllare.
 *
 * Le voci della richiesta viaggiano numerate (1..N), mai con gli UUID: il
 * modello abbina numeri, il server ritraduce in id. Un numero inventato cade
 * nel vuoto; un UUID inventato sembrerebbe vero.
 */
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { chargeAndLogDirect, estimateTokenCostUsd } from "../_shared/ai-provider/directApi.ts";
import { precallCheck } from "../_shared/ai-provider/billing.ts";
import type { TaskKind } from "../_shared/ai-provider/types.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";
import { claudeMessages, hasClaudeProvider, type ClaudeMessagesBody } from "../_shared/claudeProxy.ts";

const AI_MODEL = "claude-sonnet-4-20250514";
const MAX_DOC_BYTES = 10 * 1024 * 1024;
const LIMITE_GIORNALIERO = 20;

interface RigaProposta {
  voce_numero: number | null;
  voce_documento: string;
  prezzo_unitario: number | null;
  sconto_percentuale: number;
  aliquota_iva: number;
  disponibile: boolean;
  confidenza: number;
  nota: string | null;
}

interface Proposta {
  righe: RigaProposta[];
  totale_documento: number | null;
  giorni_consegna: number | null;
  validita_offerta: string | null;
  condizioni_pagamento: string | null;
  note_generali: string | null;
}

const SYSTEM_PROMPT = `Sei un impiegato dell'ufficio acquisti di un'impresa edile italiana.
Leggi preventivi dei fornitori (PDF o foto) e ne estrai i prezzi, abbinandoli alle voci di una richiesta d'offerta.
Regole:
- Abbina ogni voce del documento alla voce della richiesta piu' vicina per significato (misure, materiale, dimensioni). Se nessuna corrisponde, voce_numero = null.
- I prezzi sono UNITARI e SENZA IVA, in euro. Se il documento mostra solo totali di riga, dividi per la quantita'.
- Se il fornitore scrive che un articolo non e' disponibile, disponibile = false e prezzo_unitario = null.
- confidenza (0-100): quanto sei sicuro DELL'ABBINAMENTO e della lettura del prezzo. Sotto 60 se hai dovuto interpretare.
- Non inventare MAI un prezzo: se non si legge, prezzo_unitario = null e nota che spiega.
- Date in formato YYYY-MM-DD. Numeri con il punto decimale.
Rispondi SOLO con il JSON richiesto, nessun altro testo.`;

function buildPrompt(
  fornitoreNome: string,
  rfqNumber: string,
  voci: Array<{ numero: number; descrizione: string; quantita: number; um: string }>,
): string {
  return `Il documento allegato e' il preventivo di "${fornitoreNome}" in risposta alla nostra richiesta d'offerta ${rfqNumber}.

VOCI DELLA NOSTRA RICHIESTA (abbina a queste, usando "voce_numero"):
${JSON.stringify(voci, null, 2)}

FORMATO OUTPUT OBBLIGATORIO (solo JSON):
{
  "righe": [
    {
      "voce_numero": <numero della voce richiesta, o null se la voce del documento non corrisponde a nessuna>,
      "voce_documento": "<descrizione come scritta nel documento>",
      "prezzo_unitario": <numero o null>,
      "sconto_percentuale": <numero, 0 se assente>,
      "aliquota_iva": <numero, 22 se non indicata>,
      "disponibile": <true|false>,
      "confidenza": <0-100>,
      "nota": "<dubbi o particolarita', o null>"
    }
  ],
  "totale_documento": <totale del preventivo se indicato, o null>,
  "giorni_consegna": <numero o null>,
  "validita_offerta": "<YYYY-MM-DD o null>",
  "condizioni_pagamento": "<testo o null>",
  "note_generali": "<condizioni rilevanti (trasporto, minimi d'ordine...), o null>"
}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    const body = await req.json().catch(() => ({}));
    const rfqSupplierId: string | undefined = body?.rfq_supplier_id;
    const documentBase64: string | undefined = body?.document_base64;
    const usaAllegatoEmail: boolean = body?.use_email_attachment === true;

    if (!rfqSupplierId) return errorResponse("rfq_supplier_id richiesto", 400, corsH);

    // ── Riga fornitore + richiesta + voci ─────────────────────────────
    const { data: rs, error: rsErr } = await supabaseAdmin
      .from("supplier_rfq_suppliers")
      .select("id, rfq_id, company_id, email_inbox_id, suppliers(name), supplier_rfqs(rfq_number, titolo)")
      .eq("id", rfqSupplierId)
      .single();
    if (rsErr || !rs) return errorResponse("Fornitore della richiesta non trovato", 404, corsH);

    await requireCompanyAccess(supabaseAdmin, userId, rs.company_id, corsH);

    const { data: items } = await supabaseAdmin
      .from("supplier_rfq_items")
      .select("id, descrizione, quantita, unita_misura, posizione")
      .eq("rfq_id", rs.rfq_id)
      .order("posizione");
    if (!items || items.length === 0) {
      return errorResponse("La richiesta non ha voci: aggiungile prima di leggere il preventivo", 400, corsH);
    }

    // ── Tetto giornaliero per azienda (stessa logica della Verifica AI) ─
    const oggi = new Date().toISOString().slice(0, 10);
    const { count: usiOggi } = await supabaseAdmin
      .from("ai_model_usage_log")
      .select("id", { count: "exact", head: true })
      .eq("company_id", rs.company_id)
      .eq("task_kind", "rdo_estrai_offerta")
      .gte("ts", `${oggi}T00:00:00Z`);
    if ((usiOggi ?? 0) >= LIMITE_GIORNALIERO) {
      return errorResponse(`Limite giornaliero raggiunto (${LIMITE_GIORNALIERO} letture/giorno). Riprova domani.`, 429, corsH);
    }

    // ── Crediti PRIMA della chiamata ──────────────────────────────────
    // Il pattern addebita-dopo lascia un buco: a saldo zero l'AI girerebbe
    // gratis (provato in test: insufficient_credits e la piattaforma paga).
    // Qui si controlla prima, e a saldo zero si dice chiaramente cosa fare.
    const pre = await precallCheck(supabaseAdmin, {
      company_id: rs.company_id,
      task_kind: "rdo_estrai_offerta" as TaskKind,
      estimated_tokens_total: 4000,
    });
    if (!pre.allow) {
      return errorResponse(
        pre.user_message_it || "Crediti AI esauriti: ricarica il borsellino per usare la lettura AI.",
        402,
        corsH,
      );
    }

    // ── Il documento: caricato ora, oppure l'allegato dell'email ──────
    let base64 = documentBase64 ?? "";
    let nomeFile = "documento caricato";

    if (!base64 && usaAllegatoEmail) {
      if (!rs.email_inbox_id) {
        return errorResponse("Nessuna email agganciata a questo fornitore", 400, corsH);
      }
      const { data: allegati } = await supabaseAdmin
        .from("email_attachments")
        .select("filename, mime_type, storage_path, size_bytes")
        .eq("inbox_id", rs.email_inbox_id);
      // Meglio un PDF di una foto: e' il preventivo vero, non la firma in calce.
      const buono = (allegati ?? [])
        .filter((a) => /pdf|image/.test(a.mime_type ?? ""))
        .sort((a, b) => (a.mime_type === "application/pdf" ? -1 : 1) - (b.mime_type === "application/pdf" ? -1 : 1))[0];
      if (!buono) {
        return errorResponse("L'email agganciata non ha allegati leggibili (PDF o immagini)", 400, corsH);
      }
      if ((buono.size_bytes ?? 0) > MAX_DOC_BYTES) {
        return errorResponse("Allegato troppo grande (max 10MB)", 400, corsH);
      }
      const { data: blob, error: dlErr } = await supabaseAdmin.storage
        .from("email-attachments")
        .download(buono.storage_path);
      if (dlErr || !blob) return errorResponse("Allegato non scaricabile dallo storage", 502, corsH);
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < buf.length; i += CHUNK) {
        bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
      }
      base64 = btoa(bin);
      if (buono.mime_type?.startsWith("image/")) base64 = `data:${buono.mime_type};base64,${base64}`;
      nomeFile = buono.filename ?? nomeFile;
    }

    if (!base64) return errorResponse("Nessun documento: carica un file o usa l'allegato email", 400, corsH);
    if (base64.length > MAX_DOC_BYTES * 1.34) {
      return errorResponse("Documento troppo grande (max 10MB)", 400, corsH);
    }

    const isImage = base64.startsWith("data:image/") || base64.startsWith("/9j/") || base64.startsWith("iVBOR");
    const pulito = base64
      .replace(/^data:application\/pdf;base64,/, "")
      .replace(/^data:image\/[^;]+;base64,/, "");

    // ── Prompt ────────────────────────────────────────────────────────
    const voci = items.map((it, idx) => ({
      numero: idx + 1,
      descrizione: String(it.descrizione ?? ""),
      quantita: Number(it.quantita) || 1,
      um: String(it.unita_misura ?? "pz"),
    }));
    const fornitoreNome = (rs.suppliers as { name?: string } | null)?.name ?? "Fornitore";
    const rfqInfo = rs.supplier_rfqs as { rfq_number?: string } | null;

    const messages = [{
      role: "user",
      content: [
        isImage
          ? { type: "image", source: { type: "base64", media_type: "image/jpeg", data: pulito } }
          : { type: "document", source: { type: "base64", media_type: "application/pdf", data: pulito } },
        { type: "text", text: buildPrompt(fornitoreNome, rfqInfo?.rfq_number ?? "", voci) },
      ],
    }];

    if (!hasClaudeProvider()) {
      return errorResponse("AI provider missing (OPENROUTER_API_KEY)", 500, corsH);
    }

    const aiResponse = await claudeMessages({
      model: AI_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages,
    } as ClaudeMessagesBody);

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("[rdo-ai-estrai-offerta] Claude error:", aiResponse.status, errText.slice(0, 300));
      return errorResponse(`Errore nell'analisi AI: ${aiResponse.status}`, 502, corsH);
    }

    const aiData = await aiResponse.json();
    const inputTokens = Number(aiData.usage?.input_tokens ?? 0);
    const outputTokens = Number(aiData.usage?.output_tokens ?? 0);

    // ── Addebito crediti (stesso binario della Verifica AI) ───────────
    const chargeKey = await buildStableAiIdempotencyKey("rdo_estrai_offerta", [{
      company_id: rs.company_id,
      rfq_supplier_id: rfqSupplierId,
      doc_len: pulito.length,
      doc_head: pulito.slice(0, 64),
    }]);
    await chargeAndLogDirect({
      supabase: supabaseAdmin,
      company_id: rs.company_id,
      task_kind: "rdo_estrai_offerta",
      model_used: `anthropic/${AI_MODEL}`,
      cost_usd_real: estimateTokenCostUsd({
        provider: "anthropic",
        model: AI_MODEL,
        inputTokens,
        outputTokens,
        fallbackCostUsd: 0.01,
      }),
      cost_is_estimated: true,
      tokens_prompt: inputTokens,
      tokens_completion: outputTokens,
      metadata: {
        user_id: userId,
        rfq_supplier_id: rfqSupplierId,
        rfq_id: rs.rfq_id,
        idempotency_key: chargeKey,
      },
    });

    // ── Parse + ritraduzione numeri → id ──────────────────────────────
    const testo = aiData.content?.find((c: { type?: string }) => c.type === "text")?.text ?? "";
    const match = testo.match(/\{[\s\S]*\}/);
    if (!match) return errorResponse("Risposta AI non interpretabile", 502, corsH);

    let grezza: Proposta;
    try {
      grezza = JSON.parse(match[0]);
    } catch {
      return errorResponse("JSON della risposta AI non valido", 502, corsH);
    }

    const righe = (Array.isArray(grezza.righe) ? grezza.righe : []).map((r) => {
      const idx = typeof r.voce_numero === "number" ? r.voce_numero - 1 : -1;
      const item = idx >= 0 && idx < items.length ? items[idx] : null;
      return {
        rfq_item_id: item?.id ?? null,
        voce_richiesta: item?.descrizione ?? null,
        voce_documento: String(r.voce_documento ?? ""),
        prezzo_unitario: r.prezzo_unitario == null ? null : Number(r.prezzo_unitario),
        sconto_percentuale: Number(r.sconto_percentuale ?? 0),
        aliquota_iva: Number(r.aliquota_iva ?? 22),
        disponibile: r.disponibile !== false,
        confidenza: Math.max(0, Math.min(100, Number(r.confidenza ?? 0))),
        nota: r.nota ?? null,
      };
    });

    return jsonResponse({
      ok: true,
      file: nomeFile,
      righe,
      totale_documento: grezza.totale_documento == null ? null : Number(grezza.totale_documento),
      giorni_consegna: grezza.giorni_consegna == null ? null : Number(grezza.giorni_consegna),
      validita_offerta: grezza.validita_offerta ?? null,
      condizioni_pagamento: grezza.condizioni_pagamento ?? null,
      note_generali: grezza.note_generali ?? null,
      tokens: inputTokens + outputTokens,
    }, 200, corsH);
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : "Errore interno";
    console.error("[rdo-ai-estrai-offerta]", msg);
    return errorResponse(msg, 500, corsH);
  }
});
