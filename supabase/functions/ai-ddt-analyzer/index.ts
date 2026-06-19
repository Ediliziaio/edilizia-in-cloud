/**
 * ai-ddt-analyzer — Analisi AI di un DDT (Documento Di Trasporto) in entrata merce.
 *
 * Estrae da una foto/PDF del DDT: fornitore, numero/data documento e le righe
 * prodotto (descrizione, quantità, unità, prezzo, codice/barcode). Se viene passato
 * `warehouse_id`, fa anche il match server-side delle righe contro la giacenza
 * esistente (barcode → codice interno → nome) così il frontend pre-compila il carico.
 *
 * Pensato per essere RIUSABILE: la stessa funzione potrà essere chiamata in futuro
 * da WhatsApp Bot o da Silvio AI (basta passare file_base64 + company_id) per
 * registrare un arrivo merce inviando semplicemente la foto del DDT.
 *
 * Input:
 *   { file_base64: string, mime: string, company_id: uuid, warehouse_id?: uuid }
 *
 * Output:
 *   { success, extracted: { supplier_name, supplier_vat, ddt_number, ddt_date,
 *     items: [{ description, quantity, unit, unit_price, code, barcode }],
 *     confidenza_estrazione }, matches: [{ index, stock_item_id, matched_name,
 *     match_type }], ai_meta }
 */

import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { gateAiPayment } from "../_shared/requirePaymentMethod.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

const SYSTEM_PROMPT = `Sei un assistente esperto di logistica edile che legge i Documenti Di Trasporto (DDT) italiani.
Estrai i dati in JSON STRUTTURATO. Non inventare: se un dato non è leggibile metti null.

REGOLE:
- "quantity": numero (usa il punto come separatore decimale). Se non c'è, null.
- "unit": unità di misura (es. "pz", "mq", "ml", "kg", "cf", "bancale"). Se assente "pz".
- "unit_price": prezzo unitario in euro come numero (punto decimale, niente simbolo €). null se il DDT non riporta prezzi (spesso i DDT non hanno prezzi).
- "code": codice articolo/fornitore se presente, altrimenti null.
- "barcode": codice a barre/EAN se presente, altrimenti null.
- "ddt_date": formato ISO "YYYY-MM-DD".
- Includi UNA riga per ogni articolo elencato nel documento. Ignora righe di intestazione, totali, note di trasporto.

OUTPUT JSON ESATTO (no markdown):
{
  "supplier_name": "string | null",
  "supplier_vat": "string | null (P.IVA fornitore)",
  "ddt_number": "string | null",
  "ddt_date": "string | null (YYYY-MM-DD)",
  "items": [
    { "description": "string", "quantity": number|null, "unit": "string", "unit_price": number|null, "code": "string|null", "barcode": "string|null" }
  ],
  "confidenza_estrazione": "alta" | "media" | "bassa"
}`;

function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

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
    const { file_base64, mime, image_url, company_id, warehouse_id } = body as {
      file_base64?: string;
      mime?: string;
      image_url?: string;
      company_id?: string;
      warehouse_id?: string;
    };

    if (!company_id) return errorResponse("company_id obbligatorio", 400, cors);
    await requireCompanyAccess(supabaseAdmin, userId, company_id, cors);
    const paymentBlock = await gateAiPayment(supabaseAdmin, company_id, cors);
    if (paymentBlock) return paymentBlock;
    if (!file_base64 && !image_url) {
      return errorResponse("file_base64 o image_url obbligatorio", 400, cors);
    }

    const fileContent = file_base64
      ? `data:${mime || "image/jpeg"};base64,${file_base64}`
      : image_url!;
    const fingerprint = file_base64
      ? await buildStableAiIdempotencyKey("ddt_file", [file_base64.slice(0, 4000)])
      : image_url!;
    const idempotencyKey = await buildStableAiIdempotencyKey("ddt_ocr", [
      company_id,
      userId,
      mime ?? null,
      fingerprint,
    ]);

    let aiResult;
    try {
      aiResult = await aiRouterComplete({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabaseAdmin as any,
        taskKey: "ddt_ocr",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Estrai fornitore, numero/data DDT e tutte le righe prodotto da questo documento di trasporto." },
              { type: "image_url", image_url: { url: fileContent } },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ] as any,
          },
        ],
        params: { temperature: 0.05, max_tokens: 2500 },
        responseFormat: { type: "json_object" },
        companyId: company_id,
        userId,
        idempotencyKey,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return errorResponse(`AI Router error: ${msg}`, 502, cors);
    }

    let extracted: AnyObj;
    try {
      extracted = JSON.parse(aiResult.content);
    } catch {
      return errorResponse("AI ha restituito JSON non valido", 502, cors);
    }

    const items: AnyObj[] = Array.isArray(extracted.items) ? extracted.items : [];

    // ── Match server-side contro la giacenza del magazzino (se passato) ──
    // Per ogni riga estratta proviamo: barcode → codice interno → nome (fuzzy).
    // Restituiamo stock_item_id quando troviamo, così il frontend collega la riga
    // a un articolo esistente invece di crearne uno nuovo.
    type StockHit = { id: string; name: string | null; tracking_mode: string | null };
    type Match = { index: number; stock_item_id: string | null; matched_name: string | null; tracking_mode: string | null; match_type: string };
    const matches: Match[] = items.map((_, i) => ({ index: i, stock_item_id: null, matched_name: null, tracking_mode: null, match_type: "none" }));

    if (warehouse_id && items.length > 0) {
      const { data: stock } = await supabaseAdmin
        .from("warehouse_stock")
        .select("id, name, internal_code, barcode, tracking_mode")
        .eq("company_id", company_id)
        .eq("warehouse_id", warehouse_id)
        .limit(5000);
      const rows = (stock ?? []) as Array<{ id: string; name: string | null; internal_code: string | null; barcode: string | null; tracking_mode: string | null }>;

      const byBarcode = new Map<string, StockHit>();
      const byCode = new Map<string, StockHit>();
      const byName = new Map<string, StockHit>();
      for (const r of rows) {
        const hit: StockHit = { id: r.id, name: r.name, tracking_mode: r.tracking_mode };
        if (r.barcode) byBarcode.set(String(r.barcode).trim(), hit);
        if (r.internal_code) byCode.set(norm(r.internal_code), hit);
        if (r.name) byName.set(norm(r.name), hit);
      }

      items.forEach((it, i) => {
        const bc = it.barcode ? String(it.barcode).trim() : "";
        const code = norm(it.code);
        const nm = norm(it.description);
        let hit: StockHit | undefined;
        let type = "none";
        if (bc && byBarcode.has(bc)) { hit = byBarcode.get(bc); type = "barcode"; }
        else if (code && byCode.has(code)) { hit = byCode.get(code); type = "code"; }
        else if (nm && byName.has(nm)) { hit = byName.get(nm); type = "name"; }
        else if (nm) {
          // fuzzy: nome giacenza contenuto nella descrizione (o viceversa), min 4 char
          for (const [k, v] of byName) {
            if (k.length >= 4 && (nm.includes(k) || k.includes(nm))) { hit = v; type = "name_fuzzy"; break; }
          }
        }
        if (hit) {
          matches[i] = { index: i, stock_item_id: hit.id, matched_name: hit.name, tracking_mode: hit.tracking_mode, match_type: type };
        }
      });
    }

    return jsonResponse({
      success: true,
      extracted,
      matches,
      ai_meta: {
        model_used: aiResult.modelUsed,
        tokens: aiResult.totalTokens,
        cost_billed_eur: aiResult.costBilledEur,
      },
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(`Errore interno: ${err instanceof Error ? err.message : String(err)}`, 500, getCorsHeaders(req));
  }
});
