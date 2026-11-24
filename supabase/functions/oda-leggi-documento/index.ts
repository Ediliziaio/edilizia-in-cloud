/**
 * oda-leggi-documento — legge un ordine d'acquisto su carta (24/11/2026).
 *
 * Il popup «Nuovo ordine d'acquisto», con «Su documento», manda il PDF o la foto del
 * modulo del fornitore o dell'ordine firmato; qui il modello trascrive fornitore,
 * numero, date, righe, prezzi e IVA (`_shared/estrazioneOrdineFornitore.ts`) e l'app
 * precompila il popup. Non scrive niente: l'ordine lo crea chi controlla la lettura.
 *
 * Stessa strada di `ddt-ai-extract`: router AI (`pdf_vision_extract`), addebito
 * all'azienda, allarme sul credito dentro il router, rimborso se la risposta non si legge.
 *
 * Input:  { company_id, document_base64, file_name, mime_type }
 * Output: { success, ordine: OrdineFornitoreLetto, ai_meta }
 */
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { rimborsaAddebitoAi } from "../_shared/rimborsoAi.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";
import { conRegoleDocumento } from "../_shared/documentoNonFidato.ts";
import { leggiJsonDalModello } from "../_shared/rispostaModello.ts";
import { erroreAiPerUtente, letturaNonRiuscita } from "../_shared/erroriAi.ts";
import { ORDINE_FORNITORE_PROMPT, normalizzaOrdineFornitore } from "../_shared/estrazioneOrdineFornitore.ts";

const MIME_AMMESSI = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/bmp"]);

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("POST only", 405, cors);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, cors);
    const body = await req.json().catch(() => ({}));
    const { company_id, document_base64, file_name, mime_type } = body as {
      company_id?: string; document_base64?: string; file_name?: string; mime_type?: string;
    };
    if (!company_id) return errorResponse("company_id required", 400, cors);
    await requireCompanyAccess(supabaseAdmin, userId, company_id, cors);
    if (!document_base64 || typeof document_base64 !== "string") return errorResponse("Documento mancante", 400, cors);
    // ~18 MB di file diventano ~24 MB di base64.
    if (document_base64.length > 24 * 1024 * 1024) return errorResponse("Documento troppo grande: massimo 18 MB.", 413, cors);
    const mime = String(mime_type || "application/pdf").toLowerCase();
    if (!MIME_AMMESSI.has(mime)) return errorResponse("Formato non supportato: PDF o immagine.", 400, cors);
    const nome = String(file_name || "ordine").replace(/[\r\n"]/g, " ").slice(0, 120);

    const dataUrl = `data:${mime};base64,${document_base64}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contenuto: any[] = [{ type: "text", text: `Trascrivi questo ordine d'acquisto nel JSON richiesto. Nome file: "${nome}".` }];
    if (mime.startsWith("image/")) contenuto.push({ type: "image_url", image_url: { url: dataUrl } });
    else contenuto.push({ type: "file", file: { filename: nome, file_data: dataUrl } });

    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(document_base64));
    const impronta = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    const t0 = Date.now();
    const ai = await aiRouterComplete({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabaseAdmin as any,
      taskKey: "pdf_vision_extract",
      messages: [
        { role: "system", content: conRegoleDocumento(ORDINE_FORNITORE_PROMPT) },
        { role: "user", content: contenuto },
      ],
      params: { temperature: 0.0, max_tokens: 8000 },
      responseFormat: { type: "json_object" },
      companyId: company_id,
      userId,
      idempotencyKey: await buildStableAiIdempotencyKey("oda_leggi_documento", [company_id, userId, impronta, mime]),
    });

    const letto = leggiJsonDalModello(ai.content);
    if (!letto) {
      console.error("[oda-leggi-documento] risposta del modello non leggibile:", String(ai.content ?? "").slice(0, 200));
      // Il provider ha lavorato ma la lettura non serve: errore nostro, si rimborsa.
      // deno-lint-ignore no-explicit-any
      await rimborsaAddebitoAi(supabaseAdmin as any, { ledgerId: ai.ledgerId, motivo: "risposta JSON non leggibile" });
      const e = letturaNonRiuscita();
      return jsonResponse(e.body, e.status, cors);
    }

    return jsonResponse({
      success: true,
      ordine: normalizzaOrdineFornitore(letto),
      ai_meta: { model_used: ai.modelUsed, tokens: ai.totalTokens, cost_billed_eur: ai.costBilledEur, elapsed_ms: Date.now() - t0 },
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    const e = erroreAiPerUtente(err);
    if (e) return jsonResponse(e.body, e.status, getCorsHeaders(req));
    return errorResponse(err instanceof Error ? err.message : String(err), 500, getCorsHeaders(req));
  }
});
