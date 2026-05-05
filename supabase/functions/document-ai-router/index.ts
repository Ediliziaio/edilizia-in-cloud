/**
 * document-ai-router — Smart Document Router
 *
 * Riceve UN file qualsiasi, lo classifica via AI (Gemini Flash 2.5 PDF native)
 * e ritorna il tipo doc + i prossimi passi (autoflow per computo, redirect per
 * altri tipi).
 *
 * Input:
 *   FormData: { file: File, hint?: string }
 *   oppure JSON: { storage_bucket, storage_path, file_name, file_size, mime_type, hint? }
 *
 * Output:
 *   {
 *     success: true,
 *     doc_type: "computo_metrico"|"ddt"|"fattura"|"contratto"|"listino_prezzi"|
 *               "biglietto_visita"|"foto_cantiere"|"tabella_finanziamento"|
 *               "documento_identita"|"altro",
 *     confidence: 0..1,
 *     reasoning: string,
 *     key_fields: { ... fields specific to doc_type ... },
 *     next_action: {
 *       kind: "autoflow"|"redirect"|"manual",
 *       autoflow_function?: string,    // edge function da invocare
 *       redirect_url?: string,         // pagina dove portare l'utente
 *       hint?: string,
 *     },
 *     ai_meta: { model_used, tokens, cost_eur }
 *   }
 *
 * Pipeline tipica: 4-8 secondi (1 sola chiamata Gemini con PDF nativo).
 */
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CLASSIFICATION_PROMPT = `Sei un classificatore di documenti per un'azienda edile italiana.
Analizza il PDF/immagine allegato e classifica il tipo di documento.

TIPI DOCUMENTO (usa SOLO queste chiavi):
- "computo_metrico": BoQ/computo metrico estimativo. Tabella voci con codice/descrizione/U.M./quantità/prezzo/importo, capitoli, totale lavori.
- "ddt": Documento di Trasporto. Numero DDT, data, mittente/vettore, destinatario, elenco merce trasportata, peso/colli, NO prezzi (o solo descrittivi).
- "fattura": Fattura emessa o ricevuta. Numero fattura, data, P.IVA cedente+cessionario, righe imponibili, IVA, totale.
- "ricevuta": Ricevuta di pagamento (non fattura). Generalmente più semplice, no P.IVA obbligatoria.
- "contratto": Contratto/scrittura privata firmata, condizioni generali, articoli, firme. Es. contratto d'appalto, subappalto, fornitura.
- "preventivo": Offerta commerciale strutturata, righe con prezzi, validità offerta. Più semplice di un computo, più articolato di una ricevuta.
- "listino_prezzi": Listino fornitore/produttore. Tabella prodotti con codici, descrizioni, prezzi a listino.
- "biglietto_visita": Business card. Nome, ruolo, azienda, telefono, email, indirizzo.
- "foto_cantiere": Foto di un cantiere/lavoro in corso. Immagine documentale di avanzamento, non-conformità, posa, sicurezza.
- "foto_generale": Altra foto NON di cantiere. Es. foto di un prodotto, di un luogo, di una situazione generica.
- "tabella_finanziamento": Piano ammortamento finanziamento (Fiditalia, Compass, Findomestic). Rate, capitale, interessi.
- "documento_identita": CIE, patente, passaporto, codice fiscale, tessera.
- "verbale_collaudo": Verbale di collaudo o certificato di regolare esecuzione. Esito (positivo/con riserve/negativo), opera collaudata, riserve, firme tecniche.
- "polizza_assicurativa": Polizza assicurativa (RC, fideiussione, all-risks cantiere, decennale postuma). Compagnia, contraente, massimali, decorrenza, scadenza.
- "documento_pa": Documento di Pubblica Amministrazione. SCIA, CILA, permesso di costruire, DURC, certificato urbanistico, autorizzazione paesaggistica, abitabilità.
- "scheda_tecnica": Scheda tecnica prodotto/materiale (sicurezza SDS, marcatura CE, prestazioni). Caratteristiche tecniche, codici, certificazioni.
- "documento_generico": Documento testuale o report che non rientra negli altri tipi (verbale riunione, analisi, lettera commerciale, FAQ).
- "altro": Nessuna delle precedenti / non riconoscibile.

REGOLE:
1. confidence 0.95+: il documento corrisponde chiaramente a un tipo
2. confidence 0.7-0.9: corrisponde ma con ambiguità (es. preventivo che assomiglia a contratto)
3. confidence < 0.5: non riesci a classificare con certezza
4. NON inventare. Se non capisci, ritorna "altro" con confidence bassa
5. reasoning: 1-2 frasi italiane che spiegano perché hai scelto quel tipo
6. Distingui "computo_metrico" (BoQ analitico, capitoli) da "preventivo" (offerta commerciale più sintetica).
7. "foto_cantiere" SOLO se vedi cantiere/lavori/operai/strutture in costruzione. Altrimenti "foto_generale".

EXTRA — estrai key_fields rilevanti per il tipo (in italiano, valori veri visti nel doc):
- computo_metrico: { oggetto_lavori, committente, impresa, totale_eur, iva_eur }
- ddt: { numero_ddt, data_ddt, mittente, destinatario, vettore, causale, n_righe, peso_kg, n_colli }
- fattura: { numero_fattura, data_fattura, partita_iva_emittente, ragione_sociale_emittente, partita_iva_cliente, imponibile_eur, iva_eur, totale_eur, scadenza }
- ricevuta: { data, importo_eur, beneficiario, modalita_pagamento }
- contratto: { tipo_contratto, parti, oggetto, importo_eur, data_firma, durata }
- preventivo: { numero_preventivo, data, cliente, oggetto, totale_eur, validita_giorni }
- listino_prezzi: { fornitore, anno_validita, n_prodotti_stimati, categorie }
- biglietto_visita: { nome, cognome, azienda, ruolo, telefono, email, indirizzo, sito_web }
- foto_cantiere: { soggetto, fase_lavoro, eventuali_anomalie, presenza_persone }
- foto_generale: { soggetto_principale, descrizione_libera }
- tabella_finanziamento: { finanziaria, importo_finanziato, n_rate, importo_rata, tan, taeg, decorrenza }
- documento_identita: { tipo_documento, nome_intestatario, numero_documento, scadenza }
- verbale_collaudo: { opera_collaudata, esito, data_collaudo, riserve, collaudatore, importo_lavori }
- polizza_assicurativa: { compagnia, numero_polizza, contraente, tipo_copertura, massimale_eur, decorrenza, scadenza, premio_eur }
- documento_pa: { tipo_documento, numero_protocollo, ente, oggetto, data, scadenza_validita }
- scheda_tecnica: { prodotto, fornitore, codice_articolo, certificazioni, classe_resistenza, anno }
- documento_generico: { titolo, autore, data, sintesi_oggetto }
- altro: { descrizione_libera }

Ritorna SOLO JSON valido (no markdown):
{
  "doc_type": "...",
  "confidence": 0.X,
  "reasoning": "...",
  "key_fields": { ... }
}`;

interface ClassificationResult {
  doc_type: string;
  confidence: number;
  reasoning: string;
  key_fields: Record<string, unknown>;
}

// Mapping doc_type → next action
const NEXT_ACTION_MAP: Record<string, {
  kind: "autoflow" | "redirect" | "manual";
  autoflow_function?: string;
  redirect_url?: string;
  hint?: string;
}> = {
  computo_metrico: {
    kind: "autoflow",
    autoflow_function: "computo-ai-extract",
    hint: "Estrazione voci computo in corso…",
  },
  ddt: {
    kind: "autoflow",
    autoflow_function: "ddt-ai-extract",
    hint: "Estrazione DDT in corso…",
  },
  fattura: {
    kind: "autoflow",
    autoflow_function: "ai-fattura-ricevuta-ocr",
    hint: "OCR fattura in corso…",
  },
  ricevuta: {
    kind: "autoflow",
    autoflow_function: "ai-fattura-ricevuta-ocr",
    hint: "OCR ricevuta in corso…",
  },
  listino_prezzi: {
    kind: "autoflow",
    autoflow_function: "ai-listino-extract",
    hint: "Estrazione listino in corso…",
  },
  tabella_finanziamento: {
    kind: "autoflow",
    autoflow_function: "ai-tabella-finanziamento-extract",
    hint: "Estrazione piano di ammortamento…",
  },
  biglietto_visita: {
    kind: "autoflow",
    autoflow_function: "ai-biz-card-ocr",
    hint: "Estrazione contatto…",
  },
  preventivo: {
    kind: "autoflow",
    autoflow_function: "computo-ai-extract",
    hint: "Provo a estrarre il preventivo come computo. Rivedi le voci.",
  },
  // Nuovi tipi FASE 4 — gestiti da generic-doc-ai-extract
  verbale_collaudo: {
    kind: "autoflow",
    autoflow_function: "generic-doc-ai-extract",
    hint: "Estrazione verbale collaudo (opera, esito, riserve)…",
  },
  polizza_assicurativa: {
    kind: "autoflow",
    autoflow_function: "generic-doc-ai-extract",
    hint: "Estrazione polizza (compagnia, massimale, decorrenza, scadenza)…",
  },
  documento_pa: {
    kind: "autoflow",
    autoflow_function: "generic-doc-ai-extract",
    hint: "Estrazione documento PA (numero protocollo, ente, scadenza)…",
  },
  scheda_tecnica: {
    kind: "autoflow",
    autoflow_function: "generic-doc-ai-extract",
    hint: "Estrazione scheda tecnica (prodotto, certificazioni, classi)…",
  },
  documento_generico: {
    kind: "autoflow",
    autoflow_function: "generic-doc-ai-extract",
    hint: "Estrazione contenuto + sintesi…",
  },
  foto_generale: {
    kind: "autoflow",
    autoflow_function: "generic-doc-ai-extract",
    hint: "Analisi visiva (soggetto, descrizione)…",
  },
  // Esistenti che restano redirect
  contratto: {
    kind: "redirect",
    redirect_url: "/azienda/contratti?tab=review",
    hint: "Per i contratti usa la sezione Contratti — review semantica AI",
  },
  foto_cantiere: {
    kind: "redirect",
    redirect_url: "/azienda/cantieri",
    hint: "Carica la foto direttamente nel cantiere di riferimento",
  },
  documento_identita: {
    kind: "manual",
    hint: "Documento d'identità rilevato — non viene processato automaticamente per privacy",
  },
  altro: {
    kind: "manual",
    hint: "Tipo documento non riconosciuto — verifica manualmente",
  },
};

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

    const body = await req.json().catch(() => ({}));
    const {
      storage_bucket,
      storage_path,
      file_name,
      file_size,
      mime_type,
      company_id,
      hint: _hint,
    } = body as {
      storage_bucket?: string;
      storage_path?: string;
      file_name?: string;
      file_size?: number;
      mime_type?: string;
      company_id?: string;
      hint?: string;
    };

    if (!storage_bucket || !storage_path || !file_name || !company_id) {
      return errorResponse(
        "storage_bucket, storage_path, file_name, company_id required",
        400, cors,
      );
    }
    await requireCompanyAccess(supabaseAdmin, userId, company_id, cors);

    if (file_size && file_size > 18 * 1024 * 1024) {
      return errorResponse("File troppo grande per classifier (max 18MB)", 413, cors);
    }

    // 1. Download file
    const { data: file, error: dlErr } = await supabaseAdmin.storage
      .from(storage_bucket)
      .download(storage_path);
    if (dlErr || !file) {
      return errorResponse(`Download fallito: ${dlErr?.message ?? "?"}`, 500, cors);
    }
    const buffer = await (file as Blob).arrayBuffer();
    const base64 = await bufferToBase64(buffer);

    // 2. Build multimodal message — supportiamo PDF e immagini
    const isImage = (mime_type ?? "").startsWith("image/");
    const dataUrl = `data:${mime_type ?? (isImage ? "image/jpeg" : "application/pdf")};base64,${base64}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userContent: any[] = [
      { type: "text", text: `Classifica questo documento. Nome file originale: "${file_name}". Restituisci JSON come specificato.` },
    ];
    if (isImage) {
      userContent.push({ type: "image_url", image_url: { url: dataUrl } });
    } else {
      userContent.push({
        type: "file",
        file: { filename: file_name, file_data: dataUrl },
      });
    }

    // 3. AI classify
    const t0 = Date.now();
    let aiResult;
    try {
      const idempotencyKey = await buildStableAiIdempotencyKey("document_ai_router", [
        company_id,
        userId,
        storage_bucket,
        storage_path,
        file_name,
        mime_type ?? null,
        file_size ?? buffer.byteLength,
      ]);
      aiResult = await aiRouterComplete({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabaseAdmin as any,
        taskKey: "pdf_vision_extract",
        messages: [
          { role: "system", content: CLASSIFICATION_PROMPT },
          { role: "user", content: userContent },
        ],
        params: { temperature: 0.0, max_tokens: 800 },
        responseFormat: { type: "json_object" },
        companyId: company_id,
        userId,
        idempotencyKey,
      });
    } catch (e) {
      return errorResponse(
        `AI classifier error: ${e instanceof Error ? e.message : String(e)}`,
        502, cors,
      );
    }
    const elapsedMs = Date.now() - t0;

    // 4. Parse
    let parsed: ClassificationResult;
    try {
      const raw = aiResult.content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      parsed = JSON.parse(raw);
    } catch (e) {
      return errorResponse(
        `Classifier returned invalid JSON: ${(aiResult.content ?? "").slice(0, 200)}`,
        502, cors,
      );
    }

    // 5. Sanitize doc_type
    const allowedTypes = Object.keys(NEXT_ACTION_MAP);
    if (!allowedTypes.includes(parsed.doc_type)) parsed.doc_type = "altro";
    parsed.confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));

    const next_action = NEXT_ACTION_MAP[parsed.doc_type];

    return jsonResponse({
      success: true,
      doc_type: parsed.doc_type,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning ?? "",
      key_fields: parsed.key_fields ?? {},
      next_action,
      file: {
        name: file_name,
        size: file_size ?? buffer.byteLength,
        mime_type: mime_type ?? null,
        storage_bucket,
        storage_path,
      },
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
