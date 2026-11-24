/**
 * campo-scontrino-leggi — l'operaio fotografa lo scontrino e la spesa si compila (24/11/2026).
 *
 * Input:  { base64, mime }  (la foto già ridotta dal telefono, al massimo ~6 MB)
 * Output: { importo, giorno, tipo, esercente, ai_meta }  — niente si salva: il modulo si compila e
 *         l'operaio controlla e invia (campo_spese), come se l'avesse scritto lui.
 *
 * L'azienda che paga è quella del profilo di chi chiama, letta dal database: mai dal corpo.
 * Una sola chiamata al router (`campo_scontrino`), idempotente sull'impronta della foto: la stessa foto
 * mandata due volte non si paga due volte.
 */
import { requireAuth } from "../_shared/auth.ts";
import { gateAiPayment } from "../_shared/requirePaymentMethod.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";
import { conRegoleDocumento } from "../_shared/documentoNonFidato.ts";
import { erroreAiPerUtente, letturaNonRiuscita } from "../_shared/erroriAi.ts";
import { leggiJsonDalModello } from "../_shared/rispostaModello.ts";
import { pulisciScontrino } from "../../../src/lib/campo/scontrinoLetto.ts";

const MAX_BASE64 = 8 * 1024 * 1024;

const SYSTEM_PROMPT = `Leggi la foto di uno scontrino o di una ricevuta italiana (carburante, pedaggio, parcheggio, bar/ristorante, ferramenta…).
Rispondi SOLO con questo JSON:
{
  "importo": number | null,      // il TOTALE pagato in euro (non l'imponibile, non l'IVA, non il resto)
  "data": "YYYY-MM-DD" | null,   // la data dello scontrino
  "tipo": "carburante" | "pedaggio" | "parcheggio" | "pasto" | "materiale" | "altro" | null,
  "esercente": string | null     // il nome del negozio o della stazione, breve
}
Se non leggi un valore con sicurezza, metti null. Non inventare.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const cors = getCorsHeaders(req);
  try {
    if (req.method !== "POST") return errorResponse("Metodo non consentito", 405, cors);
    const { userId, supabaseAdmin } = await requireAuth(req, cors);
    const body = await req.json().catch(() => ({})) as { base64?: string; mime?: string };
    const base64 = String(body.base64 ?? "");
    const mime = String(body.mime ?? "image/jpeg");
    if (!base64 || !mime.startsWith("image/")) return errorResponse("Manca la foto dello scontrino", 400, cors);
    if (base64.length > MAX_BASE64) return errorResponse("Foto troppo grande", 413, cors);

    const { data: profilo } = await supabaseAdmin.from("profiles").select("company_id").eq("id", userId).maybeSingle();
    const companyId = (profilo as { company_id?: string | null } | null)?.company_id ?? null;
    if (!companyId) return errorResponse("Azienda non trovata", 403, cors);

    const paymentBlock = await gateAiPayment(supabaseAdmin, companyId, cors);
    if (paymentBlock) return paymentBlock;

    const oggi = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
    const impronta = await buildStableAiIdempotencyKey("campo_scontrino_foto", [base64.slice(0, 6000), String(base64.length)]);
    const aiResult = await aiRouterComplete({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabaseAdmin as any,
      taskKey: "campo_scontrino",
      messages: [
        { role: "system", content: conRegoleDocumento(SYSTEM_PROMPT) },
        {
          role: "user",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: [
            { type: "text", text: `Oggi è il ${oggi}.` },
            { type: "image_url", image_url: { url: `data:${mime};base64,${base64}`, detail: "high" } },
          ] as any,
        },
      ],
      params: { temperature: 0, max_tokens: 300 },
      responseFormat: { type: "json_object" },
      companyId,
      userId,
      idempotencyKey: await buildStableAiIdempotencyKey("campo_scontrino", [companyId, userId, impronta]),
      estimatedCostEur: 0.01,
    });
    const letto = leggiJsonDalModello(aiResult.content);
    if (!letto) {
      const e = letturaNonRiuscita();
      return jsonResponse(e.body, e.status, cors);
    }
    const s = pulisciScontrino(letto, oggi);
    return jsonResponse({
      ...s,
      ai_meta: { model_used: aiResult.modelUsed, tokens: aiResult.totalTokens, cost_billed_eur: aiResult.costBilledEur },
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    const noto = erroreAiPerUtente(err);
    if (noto) return jsonResponse(noto.body, noto.status, getCorsHeaders(req));
    return errorResponse("Non sono riuscito a leggere lo scontrino", 500, getCorsHeaders(req));
  }
});
