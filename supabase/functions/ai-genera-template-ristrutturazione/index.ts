/**
 * ai-genera-template-ristrutturazione — genera i TESTI del template preventivo
 * Ristrutturazione (rst_template_pdf) a partire dal profilo azienda + una breve
 * descrizione. Restituisce contenuti pronti da riversare nell'editor:
 * copertina, chi siamo, esigenze, soluzione, USP, garanzie, percorso, FAQ,
 * cronoprogramma e condizioni di pagamento/validità.
 *
 * Obiettivo: rendere SEMPLICE la creazione del template — un click e l'utente ha
 * una bozza professionale italiana da rifinire, invece del foglio bianco.
 *
 * Input:  { company_id: uuid, descrizione?: string, tono?: string }
 * Output: { success, generated: {...}, ai_meta }
 */

import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { gateAiPayment } from "../_shared/requirePaymentMethod.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

const SYSTEM_PROMPT = `Sei un copywriter esperto del settore edile/ristrutturazioni in Italia.
Scrivi i testi del TEMPLATE di un preventivo di ristrutturazione per un'impresa, in italiano,
con tono professionale, concreto e rassicurante (no marketing gonfiato, no superlativi vuoti).
I testi devono valere per QUALSIASI cliente (sono un template riutilizzabile), quindi NON citare
nomi di clienti, indirizzi o importi specifici.

OUTPUT: SOLO JSON valido (niente markdown), con questa struttura ESATTA:
{
  "cover_title": "string (max 60 char, es. 'Il tuo progetto di ristrutturazione')",
  "cover_subtitle": "string (max 90 char, una frase che comunica valore)",
  "chi_siamo_html": "string — 2 brevi paragrafi <p>...</p> sull'impresa (esperienza, valori, approccio)",
  "esigenze": [{ "titolo": "string (max 60)", "descrizione": "string (1 frase)" }],   // 4 voci: problemi tipici del cliente
  "soluzione": [{ "titolo": "string", "descrizione": "string" }],                      // 4 voci: come l'impresa risolve
  "usp": [{ "titolo": "string", "descrizione": "string" }],                            // 5 voci: punti di forza (perché sceglierci)
  "garanzie": [{ "titolo": "string", "descrizione": "string" }],                       // 3 voci: garanzie offerte
  "percorso": [{ "titolo": "string", "descrizione": "string" }],                       // 5 voci: il metodo di lavoro (sopralluogo→consegna)
  "cronoprogramma": [{ "fase": "string", "durata": "string (es. '1 settimana')", "descrizione": "string" }], // 5 fasi cantiere
  "faq": [{ "domanda": "string", "risposta": "string (1-2 frasi)" }],                  // 5 domande frequenti reali
  "payment_terms_html": "string — modalità di pagamento tipiche in <p>/<ul>, es. acconti a SAL",
  "validity_text": "string (1 frase, es. 'Preventivo valido 30 giorni dalla data di emissione.')",
  "footer_text": "string (1 riga sobria per il piè di pagina)"
}
Regole: niente campi extra; rispetta i conteggi indicati; frasi brevi e leggibili da non addetti.`;

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
    const { company_id, descrizione, tono } = body as {
      company_id?: string;
      descrizione?: string;
      tono?: string;
    };

    if (!company_id) return errorResponse("company_id obbligatorio", 400, cors);
    await requireCompanyAccess(supabaseAdmin, userId, company_id, cors);
    const paymentBlock = await gateAiPayment(supabaseAdmin, company_id, cors);
    if (paymentBlock) return paymentBlock;

    // Profilo azienda per radicare i testi (nome → "chi siamo" coerente).
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("name")
      .eq("id", company_id)
      .maybeSingle();
    const companyName = (company?.name as string | undefined) ?? "La nostra impresa";
    const citta = "";

    const userPrompt = [
      `Impresa: "${companyName}"${citta ? ` (zona: ${citta})` : ""}.`,
      descrizione?.trim()
        ? `Descrizione fornita dall'utente: "${descrizione.trim()}".`
        : "Impresa di ristrutturazioni complete chiavi in mano (edili, impianti, finiture).",
      tono?.trim() ? `Tono desiderato: ${tono.trim()}.` : "",
      "Genera i testi del template come da schema.",
    ]
      .filter(Boolean)
      .join("\n");

    const idempotencyKey = await buildStableAiIdempotencyKey("template_ristrutturazione", [
      company_id,
      userId,
      descrizione ?? null,
      tono ?? null,
    ]);

    let aiResult;
    try {
      aiResult = await aiRouterComplete({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabaseAdmin as any,
        taskKey: "template_ristrutturazione",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        params: { temperature: 0.6, max_tokens: 2600 },
        responseFormat: { type: "json_object" },
        companyId: company_id,
        userId,
        idempotencyKey,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return errorResponse(`AI Router error: ${msg}`, 502, cors);
    }

    let generated: AnyObj;
    try {
      generated = JSON.parse(aiResult.content);
    } catch {
      return errorResponse("AI ha restituito JSON non valido", 502, cors);
    }

    // Normalizzazione difensiva: garantisce le forme attese dall'editor.
    const asList = (v: unknown) =>
      Array.isArray(v)
        ? v
            .map((x) => ({
              titolo: String((x as AnyObj)?.titolo ?? "").trim(),
              descrizione: ((x as AnyObj)?.descrizione ?? null) as string | null,
            }))
            .filter((x) => x.titolo)
        : [];
    const asCrono = (v: unknown) =>
      Array.isArray(v)
        ? v
            .map((x) => ({
              fase: String((x as AnyObj)?.fase ?? "").trim(),
              durata: ((x as AnyObj)?.durata ?? null) as string | null,
              descrizione: ((x as AnyObj)?.descrizione ?? null) as string | null,
            }))
            .filter((x) => x.fase)
        : [];
    const asFaq = (v: unknown) =>
      Array.isArray(v)
        ? v
            .map((x) => ({
              domanda: String((x as AnyObj)?.domanda ?? "").trim(),
              risposta: String((x as AnyObj)?.risposta ?? "").trim(),
            }))
            .filter((x) => x.domanda && x.risposta)
        : [];

    const out = {
      cover_title: String(generated.cover_title ?? "").trim() || null,
      cover_subtitle: String(generated.cover_subtitle ?? "").trim() || null,
      chi_siamo: String(generated.chi_siamo_html ?? "").trim() || null,
      esigenze: asList(generated.esigenze),
      soluzione: asList(generated.soluzione),
      usp: asList(generated.usp),
      garanzie: asList(generated.garanzie),
      percorso: asList(generated.percorso),
      cronoprogramma: asCrono(generated.cronoprogramma),
      faq: asFaq(generated.faq),
      payment_terms_text: String(generated.payment_terms_html ?? "").trim() || null,
      validity_text: String(generated.validity_text ?? "").trim() || null,
      footer_text: String(generated.footer_text ?? "").trim() || null,
    };

    return jsonResponse(
      {
        success: true,
        generated: out,
        ai_meta: {
          model_used: aiResult.modelUsed,
          tokens: aiResult.totalTokens,
          cost_billed_eur: aiResult.costBilledEur,
        },
      },
      200,
      cors,
    );
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(
      `Errore interno: ${err instanceof Error ? err.message : String(err)}`,
      500,
      getCorsHeaders(req),
    );
  }
});
