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

// Normalizza l'output AI prima di mostrarlo/salvarlo: l'AI può restituire
// oggetti quasi corretti ma con array mancanti o confidence fuori range.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeDdtPayload(raw: any): Record<string, unknown> {
  const ddt = raw && typeof raw === "object" ? raw : {};
  const warnings = Array.isArray(ddt.warnings) ? ddt.warnings.filter(Boolean) : [];
  const righe = Array.isArray(ddt.righe_merce) ? ddt.righe_merce : [];

  if (righe.length === 0) {
    warnings.push("Nessuna riga merce riconosciuta: verifica manualmente il DDT.");
  }
  if (!ddt.intestazione?.numero_ddt) {
    warnings.push("Numero DDT non riconosciuto con certezza.");
  }
  if (!ddt.mittente?.ragione_sociale || !ddt.destinatario?.ragione_sociale) {
    warnings.push("Mittente o destinatario incompleto: controlla i riquadri del documento.");
  }

  return {
    ...ddt,
    righe_merce: righe.map((row: Record<string, unknown>) => ({
      ...row,
      descrizione: String(row?.descrizione ?? "").trim(),
      quantita: Number(row?.quantita ?? 0) || null,
      unita_misura: row?.unita_misura ? String(row.unita_misura).trim().toLowerCase() : null,
    })),
    confidence: Math.max(0, Math.min(1, Number(ddt.confidence ?? 0.55))),
    warnings: Array.from(new Set(warnings.map(String))),
  };
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("POST only", 405, cors);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, cors);
    const body = await req.json();
    // FIX 14 (A9): accetta sia input "storage_path" (preferred) che "image_base64" (legacy
    // da ddt-ocr-extract) per consolidare le due funzioni.
    const {
      storage_bucket,
      storage_path,
      file_name,
      mime_type,
      company_id,
      image_base64,
      legacy_format,
    } = body as {
      storage_bucket?: string;
      storage_path?: string;
      file_name?: string;
      mime_type?: string;
      company_id?: string;
      image_base64?: string;
      legacy_format?: boolean;
    };
    if (!company_id) {
      return errorResponse("company_id required", 400, cors);
    }
    await requireCompanyAccess(supabaseAdmin, userId, company_id, cors);

    let base64: string;
    let resolvedMimeType: string;
    let resolvedFileName: string;
    let fingerprintInput: string;

    if (image_base64) {
      // Modalità legacy: input diretto base64 (max ~18MB raw equivale a ~24MB base64)
      if (image_base64.length > 24 * 1024 * 1024) {
        return errorResponse("DDT troppo grande (max ~18MB raw)", 413, cors);
      }
      base64 = image_base64;
      resolvedMimeType = mime_type ?? "image/jpeg";
      resolvedFileName = file_name ?? "ddt-upload";
      fingerprintInput = image_base64.substring(0, 256); // primi 256 char come fingerprint
    } else {
      if (!storage_bucket || !storage_path || !file_name) {
        return errorResponse(
          "Fornire (storage_bucket+storage_path+file_name) oppure image_base64",
          400,
          cors,
        );
      }
      const { data: file, error: dlErr } = await supabaseAdmin.storage
        .from(storage_bucket)
        .download(storage_path);
      if (dlErr || !file) return errorResponse(`Download fallito: ${dlErr?.message ?? "?"}`, 500, cors);
      const buffer = await (file as Blob).arrayBuffer();
      if (buffer.byteLength > 18 * 1024 * 1024) {
        return errorResponse("DDT troppo grande (max 18MB)", 413, cors);
      }
      base64 = await bufferToBase64(buffer);
      resolvedMimeType = mime_type ?? "application/pdf";
      resolvedFileName = file_name;
      fingerprintInput = `${storage_bucket}/${storage_path}`;
    }

    const normalizedMimeType = resolvedMimeType || "application/pdf";
    const dataUrl = `data:${normalizedMimeType};base64,${base64}`;
    const isImage = normalizedMimeType.startsWith("image/");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userContent: any[] = [
      { type: "text", text: `Estrai i dati di questo DDT come JSON strutturato. Nome file: "${resolvedFileName}".` },
    ];
    if (isImage) {
      userContent.push({ type: "image_url", image_url: { url: dataUrl } });
    } else {
      userContent.push({ type: "file", file: { filename: resolvedFileName, file_data: dataUrl } });
    }

    const t0 = Date.now();
    const idempotencyKey = await buildStableAiIdempotencyKey("ddt_ai_extract", [
      company_id,
      userId,
      fingerprintInput,
      resolvedFileName,
      resolvedMimeType,
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
      ddt = normalizeDdtPayload(JSON.parse(raw));
    } catch {
      return errorResponse(`AI returned invalid JSON: ${(aiResult.content ?? "").slice(0, 200)}`, 502, cors);
    }

    // FIX 14 (A9): se il client chiede legacy_format, mappiamo il JSON strutturato
    // sullo schema piatto di ddt-ocr-extract per backward compat con NewDDTDialog.tsx
    let extractedLegacy: Record<string, unknown> | undefined;
    if (legacy_format) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d: any = ddt ?? {};
      extractedLegacy = {
        numero_ddt: d.intestazione?.numero_ddt ?? null,
        data_ddt: d.intestazione?.data_ddt ?? null,
        fornitore_nome: d.mittente?.ragione_sociale ?? null,
        fornitore_piva: d.mittente?.partita_iva ?? null,
        fornitore_indirizzo: [
          d.mittente?.indirizzo,
          d.mittente?.cap,
          d.mittente?.comune,
          d.mittente?.provincia,
        ].filter(Boolean).join(", ") || null,
        destinatario_nome: d.destinatario?.ragione_sociale ?? null,
        destinatario_indirizzo: [
          d.destinatario?.indirizzo,
          d.destinatario?.cap,
          d.destinatario?.comune,
          d.destinatario?.provincia,
        ].filter(Boolean).join(", ") || null,
        luogo_destinazione: d.luogo_destinazione?.indirizzo ?? null,
        causale_trasporto: d.intestazione?.causale ?? null,
        porto: d.trasporto?.porto ?? null,
        corriere: d.vettore?.ragione_sociale ?? null,
        targa_mezzo: null, // non sempre presente nel nuovo schema; vettore.note può contenerlo
        autista_nome: null,
        data_inizio_trasporto: d.intestazione?.data_inizio_trasporto ?? null,
        ora_inizio_trasporto: d.intestazione?.ora_inizio_trasporto ?? null,
        totale_colli: d.trasporto?.n_colli ?? null,
        peso_totale_kg: d.trasporto?.peso_lordo_kg ?? d.trasporto?.peso_netto_kg ?? null,
        aspetto_esteriore: d.trasporto?.aspetto_esteriore_beni ?? null,
        articoli: Array.isArray(d.righe_merce)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? d.righe_merce.map((r: any) => ({
              codice: r.codice_articolo ?? null,
              descrizione: r.descrizione ?? "",
              quantita: r.quantita ?? null,
              unita_misura: r.unita_misura ?? null,
              peso_kg: null,
              note: null,
            }))
          : [],
        note_documento: d.riferimenti?.note_libere ?? null,
        confidenza_estrazione: typeof d.confidence === "number"
          ? (d.confidence >= 0.85 ? "alta" : d.confidence >= 0.6 ? "media" : "bassa")
          : "media",
        campi_illeggibili: Array.isArray(d.warnings) ? d.warnings : [],
      };
    }

    return jsonResponse({
      success: true,
      ddt,
      // legacy alias per consumer ddt-ocr-extract:
      ...(extractedLegacy ? { extracted: extractedLegacy } : {}),
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
