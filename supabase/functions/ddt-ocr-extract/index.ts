/**
 * ddt-ocr-extract — FASE B.4
 *
 * Estrae dati strutturati da un DDT (Documento di Trasporto) caricato come
 * immagine o PDF. Usa GPT-4o-mini (vision) via aiRouter task `vision_cantiere`.
 *
 * Input:
 *   { image_base64: string, mime: string, company_id: string }
 *   OR
 *   { image_url: string, company_id: string }
 *
 * Output:
 *   {
 *     success,
 *     extracted: {
 *       numero_ddt, data_ddt, fornitore_nome, fornitore_piva,
 *       destinatario_nome, corriere, targa, autista,
 *       articoli: [{descrizione, codice?, quantita, um, peso_kg?}],
 *       causale_trasporto, porto, totale_colli, peso_totale_kg
 *     },
 *     ai_meta: {...}
 *   }
 */

import { requireAuth } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

const OCR_PROMPT = `Sei un esperto nell'estrazione dati da Documenti di Trasporto (DDT) italiani conformi al D.P.R. 472/96.
Analizza il DDT in immagine e ESTRAI i dati in JSON strutturato.

Campi attesi (tutti opzionali, lascia null se non leggibile):
{
  "numero_ddt": "string es. '2025/00128'",
  "data_ddt": "YYYY-MM-DD",
  "fornitore_nome": "string (mittente)",
  "fornitore_piva": "string IT12345678901",
  "fornitore_indirizzo": "string",
  "destinatario_nome": "string",
  "destinatario_indirizzo": "string",
  "luogo_destinazione": "string (se diverso da destinatario)",
  "causale_trasporto": "vendita|conto visione|reso|prestito|altro",
  "porto": "franco|assegnato|porto franco|altro",
  "corriere": "string",
  "targa_mezzo": "string formato AA000AA",
  "autista_nome": "string",
  "data_inizio_trasporto": "YYYY-MM-DD",
  "ora_inizio_trasporto": "HH:MM",
  "totale_colli": number,
  "peso_totale_kg": number,
  "aspetto_esteriore": "string",
  "articoli": [
    {
      "codice": "string opzionale",
      "descrizione": "string",
      "quantita": number,
      "unita_misura": "PZ|KG|MT|MQ|MC|LT|altro",
      "peso_kg": number opzionale,
      "note": "string opzionale"
    }
  ],
  "note_documento": "string opzionale",
  "confidenza_estrazione": "alta|media|bassa",
  "campi_illeggibili": ["array di nomi campo non leggibili"]
}

REGOLE:
- Non inventare dati. Se un campo non è chiaro → null
- Quantità decimali con punto (1.500 → 1500.0 se è "millequindici" italiano: ATTENZIONE alla virgola europea)
- Date sempre ISO YYYY-MM-DD
- Articoli: ESTRAI TUTTE le righe della tabella materiali
- Rispondi SOLO con JSON valido, niente markdown wrapper`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  const cors = getCorsHeaders(req);

  try {
    if (req.method !== "POST") {
      return errorResponse("Metodo non consentito", 405, cors);
    }

    const { userId, supabaseAdmin } = await requireAuth(req, cors);

    const body = await req.json().catch(() => ({}));
    const { image_base64, mime, image_url, company_id } = body as {
      image_base64?: string;
      mime?: string;
      image_url?: string;
      company_id?: string;
    };

    if (!company_id) {
      return errorResponse("company_id obbligatorio", 400, cors);
    }
    if (!image_base64 && !image_url) {
      return errorResponse("Fornire image_base64 o image_url", 400, cors);
    }

    // Compose vision message
    const imageContent = image_base64
      ? `data:${mime || "image/jpeg"};base64,${image_base64}`
      : image_url!;

    let aiResult;
    try {
      aiResult = await aiRouterComplete({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabaseAdmin as any,
        taskKey: "vision_cantiere",
        messages: [
          { role: "system", content: OCR_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Estrai tutti i dati strutturati da questo DDT in formato JSON.",
              },
              {
                type: "image_url",
                image_url: { url: imageContent },
              },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ] as any,
          },
        ],
        params: { temperature: 0.1, max_tokens: 3000 },
        responseFormat: { type: "json_object" },
        companyId: company_id,
        userId,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return errorResponse(`AI Router error: ${msg}`, 502, cors);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let extracted: Record<string, any> = {};
    try {
      extracted = JSON.parse(aiResult.content);
    } catch {
      return errorResponse("AI ha restituito JSON non valido", 502, cors);
    }

    return jsonResponse({
      success: true,
      extracted,
      ai_meta: {
        model_used: aiResult.modelUsed,
        tokens: aiResult.totalTokens,
        cost_eur: aiResult.costRealEur,
        cost_billed_eur: aiResult.costBilledEur,
      },
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(`Errore interno: ${err instanceof Error ? err.message : String(err)}`, 500, getCorsHeaders(req));
  }
});
