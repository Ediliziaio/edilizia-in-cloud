/**
 * ai-importa-condizioni — Le aziende hanno già le loro condizioni contrattuali
 * e i termini legali in un Word o in un PDF. Questa edge le legge (PDF/immagine
 * via modello con visione, oppure testo già estratto lato client per DOCX/TXT)
 * e le riordina nel blocco "Condizioni e termini legali" della libreria
 * Template offerte: markdown con titoli, merge tag al posto di nomi e importi
 * specifici, niente clausole inventate.
 *
 * Input (uno dei due):
 *   { company_id, storage_bucket, storage_path, file_name, mime_type }
 *   { company_id, text, file_name? }
 * Output:
 *   { success, markdown, note: string[], mancanze: string[], ai_meta }
 */
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";
import { BUCKET_IMPORT_CONDIZIONI, valutaFile } from "../_shared/storageAmmesso.ts";
import { conRegoleDocumento, incorniciaTestoDocumento } from "../_shared/documentoNonFidato.ts";
import { leggiJsonDalModello } from "../_shared/rispostaModello.ts";
import { erroreAiPerUtente, letturaNonRiuscita } from "../_shared/erroriAi.ts";

const SYSTEM_PROMPT = `Sei l'assistente di un gestionale per imprese edili italiane. Ricevi un documento (contratto, condizioni di vendita, preventivo con clausole, informativa privacy) e devi produrre il blocco "Condizioni contrattuali e termini legali" da stampare in coda ai preventivi.

REGOLE
- Usa SOLO ciò che c'è nel documento: non inventare clausole, cifre, durate o riferimenti di legge. Se una sezione tipica manca (es. foro competente), non aggiungerla: segnalala in "mancanze".
- Riscrivi in italiano chiaro, mantenendo il significato giuridico. Elimina intestazioni, numeri di pagina, firme, dati di un singolo cliente o cantiere.
- Al posto di nomi, indirizzi, numeri e importi SPECIFICI usa questi merge tag: {{azienda.ragione_sociale}}, {{azienda.partita_iva}}, {{azienda.indirizzo}}, {{cliente.nome_completo}}, {{cliente.indirizzo}}, {{cantiere.indirizzo}}, {{preventivo.numero}}, {{preventivo.data}}, {{preventivo.totale}}, {{preventivo.piano_pagamenti}}, {{data.oggi}}. Percentuali e durate generali (es. "acconto 30%", "garanzia 24 mesi") restano scritte.
- Formato markdown: "# Condizioni contrattuali" con sezioni "## 1. Oggetto", "## 2. Prezzi e pagamenti", ecc. (numerazione progressiva, un titolo per sezione), poi "# Termini legali" con "## Privacy (GDPR)", "## Diritto di recesso", "## Foro competente" se presenti nel documento. Elenchi con "- ". Niente tabelle, niente HTML.

Rispondi SOLO con JSON: {"markdown": "…", "note": ["cosa hai cambiato o unito"], "mancanze": ["sezioni tipiche assenti nel documento"]}`;

async function bufferToBase64(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("POST only", 405, cors);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, cors);
    const body = await req.json();
    const { company_id, storage_bucket, storage_path, file_name, mime_type, text } = body as {
      company_id?: string; storage_bucket?: string; storage_path?: string; file_name?: string; mime_type?: string; text?: string;
    };
    if (!company_id) return errorResponse("company_id required", 400, cors);
    const testo = typeof text === "string" ? text.trim().slice(0, 80_000) : "";
    if (!testo && !(storage_bucket && storage_path)) {
      return errorResponse("Serve `text` oppure storage_bucket + storage_path", 400, cors);
    }
    await requireCompanyAccess(supabaseAdmin, userId, company_id, cors);

    // Bucket e percorso li sceglie chi chiama e il download è con la chiave di
    // servizio: solo il file che l'import carica nella cartella dell'azienda
    // (vedi _shared/storageAmmesso.ts; un `%2e%2e` farebbe uscire la richiesta
    // dallo storage).
    if (!testo) {
      const file = valutaFile({ bucket: storage_bucket, path: storage_path }, BUCKET_IMPORT_CONDIZIONI, { companyId: company_id, userId });
      if (!file.ok) return errorResponse("Bucket o percorso del file non validi", 400, cors);
      if (!file.conChiaveDiServizio) return errorResponse("File fuori dalle cartelle ammesse", 403, cors);
    }

    // eslint-disable-next-line no-explicit-any
    const userContent: any[] = [];
    if (testo) {
      userContent.push({ type: "text", text: `Documento "${file_name ?? "testo"}" (testo estratto):\n\n${incorniciaTestoDocumento(testo)}` });
    } else {
      const { data: file, error: dlErr } = await supabaseAdmin.storage.from(storage_bucket!).download(storage_path!);
      if (dlErr || !file) return errorResponse(`Download fallito: ${dlErr?.message ?? "?"}`, 500, cors);
      const buffer = await (file as Blob).arrayBuffer();
      if (buffer.byteLength > 18 * 1024 * 1024) return errorResponse("Documento troppo grande (max 18MB)", 413, cors);
      const base64 = await bufferToBase64(buffer);
      const isImage = (mime_type ?? "").startsWith("image/");
      const dataUrl = `data:${mime_type ?? (isImage ? "image/jpeg" : "application/pdf")};base64,${base64}`;
      userContent.push({ type: "text", text: `Leggi il documento allegato "${file_name ?? "documento"}" e produci il blocco condizioni.` });
      if (isImage) userContent.push({ type: "image_url", image_url: { url: dataUrl } });
      else userContent.push({ type: "file", file: { filename: file_name ?? "documento.pdf", file_data: dataUrl } });
    }

    const t0 = Date.now();
    const idempotencyKey = await buildStableAiIdempotencyKey("ai_importa_condizioni", [
      company_id, userId, storage_bucket ?? null, storage_path ?? null, file_name ?? null, testo ? testo.length : null, testo.slice(0, 200) || null,
    ]);
    const aiResult = await aiRouterComplete({
      // eslint-disable-next-line no-explicit-any
      supabase: supabaseAdmin as any,
      taskKey: "pdf_vision_extract",
      messages: [
        { role: "system", content: conRegoleDocumento(SYSTEM_PROMPT) },
        { role: "user", content: userContent },
      ],
      params: { temperature: 0.1, max_tokens: 8000 },
      responseFormat: { type: "json_object" },
      companyId: company_id,
      userId,
      idempotencyKey,
    });

    const parsed = leggiJsonDalModello(aiResult.content);
    if (!parsed) {
      console.error("[ai-importa-condizioni] risposta del modello non leggibile:", String(aiResult.content ?? "").slice(0, 200));
      const e = letturaNonRiuscita();
      return jsonResponse(e.body, e.status, cors);
    }
    const markdown = String(parsed.markdown ?? "").trim();
    if (!markdown) return errorResponse("Nel documento non ho trovato condizioni o termini da riordinare.", 422, cors);

    return jsonResponse({
      success: true,
      markdown,
      note: Array.isArray(parsed.note) ? parsed.note.map(String).slice(0, 12) : [],
      mancanze: Array.isArray(parsed.mancanze) ? parsed.mancanze.map(String).slice(0, 12) : [],
      ai_meta: { model_used: aiResult.modelUsed, tokens: aiResult.totalTokens, cost_eur: aiResult.costRealEur, elapsed_ms: Date.now() - t0 },
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    const e = erroreAiPerUtente(err);
    if (e) return jsonResponse(e.body, e.status, getCorsHeaders(req));
    return errorResponse(err instanceof Error ? err.message : String(err), 500, getCorsHeaders(req));
  }
});
