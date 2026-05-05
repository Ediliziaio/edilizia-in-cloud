/**
 * ddt-ai-extract — Estrazione strutturata di un Documento di Trasporto (DDT)
 *
 * Riceve un PDF/immagine di un DDT, lo invia a Gemini Flash 2.5 (PDF native via
 * OpenRouter task `pdf_vision_extract`) con prompt dedicato, e ritorna struttura
 * con: intestazione, mittente, destinatario, vettore, righe merce, totali.
 *
 * Input:
 *   { storage_bucket, storage_path, file_name, mime_type, company_id }
 *
 * Output:
 *   { success, ddt: {...}, ai_meta: {...} }
 */
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";

const DDT_EXTRACTION_PROMPT = `Sei un esperto di logistica e amministrazione edilizia italiana ed europea.
Analizza il PDF/immagine allegato (Documento di Trasporto / DDT o CMR internazionale) ed estrai TUTTI i dati strutturati.

REGOLE GENERALI:
1. Numeri italiani: punto = migliaia, virgola = decimali. "1.234,56" → 1234.56
2. Date in ISO: YYYY-MM-DD (anche da formato 07.02.2026 → 2026-02-07)
3. NON inventare. Se manca o è illeggibile, ritorna null + warning specifico.
4. Per le righe merce: una riga per ogni item (anche se compatte sul DDT).
5. Riconosci codice articolo + descrizione + UM + quantità + (eventuale) prezzo.
6. Causale tipica: "Vendita", "Reso", "Conto lavorazione", "Trasferimento", "Trasporto internazionale".

REGOLE MITTENTE/DESTINATARIO (CRITICHE):
7. **DDT italiano standard**: Mittente (Cedente) sempre PRIMO box in alto, Destinatario (Cessionario) sempre SECONDO box.
8. **CMR internazionale** (Lettera di Vettura "Convention Merchandises Routiers"):
   - Box numerato "1 / Expediteur / Absender / Sender / Mittente" = MITTENTE
   - Box numerato "2 / Destinataire / Empfänger / Consignee / Destinatario" = DESTINATARIO
   - Spesso compilati a mano nei riquadri appositi del modulo prestampato
   - NON confondere con il "16 Trasportatore/Carrier/Frachtführer" che è il VETTORE
9. **Anti-pattern frequenti da evitare**:
   - NON leggere l'IBAN/dati bancari come ragione sociale del vettore
   - NON considerare la banca (es. "Banca Transylvania") come vettore
   - NON copiare lo stesso ragione sociale in mittente E destinatario senza essere certo
   - Se il box destinatario è scritto a mano e illeggibile, cerca anche nel campo "luogo di consegna" (box 3 del CMR) e nelle note

REGOLE VETTORE:
10. Vettore = solo chi materialmente trasporta (riga 16 del CMR oppure "Vettore/Trasportatore" del DDT IT).
11. Tipo vettore: "mittente" se coincide col mittente, "destinatario" se coincide col destinatario, "terzi" altrimenti.
12. Targa veicolo (campo "Autoveicolo") va in vettore.note se non c'è campo dedicato.

Restituisci SOLO JSON valido (no markdown):
{
  "intestazione": {
    "numero_ddt": "string",
    "data_ddt": "YYYY-MM-DD",
    "data_inizio_trasporto": "YYYY-MM-DD o null",
    "ora_inizio_trasporto": "HH:MM o null",
    "causale": "string",
    "n_pagine": numero
  },
  "mittente": {
    "ragione_sociale": "string",
    "partita_iva": "string o null",
    "codice_fiscale": "string o null",
    "indirizzo": "string",
    "comune": "string",
    "provincia": "string",
    "cap": "string"
  },
  "destinatario": {
    "ragione_sociale": "string",
    "partita_iva": "string o null",
    "indirizzo": "string",
    "comune": "string",
    "provincia": "string",
    "cap": "string"
  },
  "luogo_destinazione": {
    "indirizzo": "string o null",
    "comune": "string o null",
    "note": "string o null"
  },
  "vettore": {
    "ragione_sociale": "string o null",
    "tipo": "mittente|destinatario|terzi|null"
  },
  "trasporto": {
    "porto": "franco|assegnato|null",
    "aspetto_esteriore_beni": "string o null",
    "n_colli": numero o null,
    "peso_lordo_kg": numero o null,
    "peso_netto_kg": numero o null,
    "volume_mc": numero o null,
    "tipo_imballaggio": "string o null"
  },
  "righe_merce": [
    {
      "codice_articolo": "string o null",
      "descrizione": "string",
      "unita_misura": "pz|kg|mc|ml|...",
      "quantita": numero,
      "prezzo_unitario_eur": numero o null,
      "importo_eur": numero o null,
      "iva_percentuale": numero o null
    }
  ],
  "totali": {
    "imponibile_eur": numero o null,
    "iva_eur": numero o null,
    "totale_documento_eur": numero o null
  },
  "riferimenti": {
    "ordine_acquisto": "string o null",
    "commessa": "string o null",
    "note_libere": "string o null"
  },
  "confidence": 0.0-1.0,
  "warnings": ["string"]
}`;

async function bufferToBase64(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
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
    const { storage_bucket, storage_path, file_name, mime_type, company_id } = body as {
      storage_bucket?: string;
      storage_path?: string;
      file_name?: string;
      mime_type?: string;
      company_id?: string;
    };
    if (!storage_bucket || !storage_path || !file_name || !company_id) {
      return errorResponse("storage_bucket, storage_path, file_name, company_id required", 400, cors);
    }
    await requireCompanyAccess(supabaseAdmin, userId, company_id, cors);

    const { data: file, error: dlErr } = await supabaseAdmin.storage
      .from(storage_bucket)
      .download(storage_path);
    if (dlErr || !file) return errorResponse(`Download fallito: ${dlErr?.message ?? "?"}`, 500, cors);

    const buffer = await (file as Blob).arrayBuffer();
    if (buffer.byteLength > 18 * 1024 * 1024) {
      return errorResponse("DDT troppo grande (max 18MB)", 413, cors);
    }
    const base64 = await bufferToBase64(buffer);
    const isImage = (mime_type ?? "").startsWith("image/");
    const dataUrl = `data:${mime_type ?? (isImage ? "image/jpeg" : "application/pdf")};base64,${base64}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userContent: any[] = [
      { type: "text", text: `Estrai i dati di questo DDT come JSON strutturato. Nome file: "${file_name}".` },
    ];
    if (isImage) {
      userContent.push({ type: "image_url", image_url: { url: dataUrl } });
    } else {
      userContent.push({ type: "file", file: { filename: file_name, file_data: dataUrl } });
    }

    const t0 = Date.now();
    const idempotencyKey = await buildStableAiIdempotencyKey("ddt_ai_extract", [
      company_id,
      userId,
      storage_bucket,
      storage_path,
      file_name,
      mime_type ?? null,
    ]);
    const aiResult = await aiRouterComplete({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabaseAdmin as any,
      taskKey: "pdf_vision_extract",
      messages: [
        { role: "system", content: DDT_EXTRACTION_PROMPT },
        { role: "user", content: userContent },
      ],
      params: { temperature: 0.0, max_tokens: 6000 },
      responseFormat: { type: "json_object" },
      companyId: company_id,
      userId,
      idempotencyKey,
    });
    const elapsedMs = Date.now() - t0;

    let ddt;
    try {
      const raw = aiResult.content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      ddt = JSON.parse(raw);
    } catch {
      return errorResponse(`AI returned invalid JSON: ${(aiResult.content ?? "").slice(0, 200)}`, 502, cors);
    }

    return jsonResponse({
      success: true,
      ddt,
      ai_meta: {
        model_used: aiResult.modelUsed,
        tokens: aiResult.totalTokens,
        cost_eur: aiResult.costRealEur,
        cost_billed_eur: aiResult.costBilledEur,
        elapsed_ms: elapsedMs,
      },
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(err instanceof Error ? err.message : String(err), 500, getCorsHeaders(req));
  }
});
