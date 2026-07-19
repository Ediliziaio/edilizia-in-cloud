/**
 * ai-bank-statement-parser — Lettura AI di un estratto conto bancario (foto/PDF).
 *
 * Pensata per la TESORERIA MANUALE: le aziende che NON collegano la banca via
 * Open Banking possono caricare la foto/PDF dell'estratto conto e farne estrarre
 * i movimenti dall'AI. I movimenti riconosciuti tornano al frontend che li mostra
 * in anteprima e poi li inserisce in `bank_transactions` sul conto manuale scelto
 * (dedup su external_transaction_id lato client/hook).
 *
 * Riusabile: stesso pattern di ai-ddt-analyzer (vision + aiRouterComplete). Può
 * essere chiamata anche da WhatsApp/Silvio passando file_base64 + account_id.
 *
 * Input:
 *   { file_base64: string, mime_type?: string, mime?: string, account_id: uuid }
 *   (l'azienda viene derivata dall'account: nessun company_id da fidarsi lato client)
 *
 * Output:
 *   { transactions: [{ date: "YYYY-MM-DD", description: string, amount: number }],
 *     confidenza_estrazione, ai_meta }
 *   amount > 0 = entrata/accredito, amount < 0 = uscita/addebito.
 */

import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { gateAiPayment } from "../_shared/requirePaymentMethod.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

const SYSTEM_PROMPT = `Sei un assistente esperto di contabilità italiana che legge gli ESTRATTI CONTO bancari (o liste movimenti) da foto o PDF.
Estrai TUTTI i movimenti in JSON STRUTTURATO. Non inventare: se un dato non è leggibile scarta la riga.

REGOLE FONDAMENTALI:
- "date": data contabile del movimento in formato ISO "YYYY-MM-DD". Gli estratti italiani usano spesso GG/MM/AAAA: convertila. Se manca l'anno usa quello indicato in intestazione.
- "amount": importo del movimento come NUMERO (punto come separatore decimale, niente simbolo €, niente separatore migliaia).
  * SEGNO OBBLIGATORIO: numero POSITIVO per ACCREDITI / ENTRATE / versamenti / bonifici in entrata (colonna "Avere", "Entrate", "Accrediti", "+").
  * numero NEGATIVO per ADDEBITI / USCITE / pagamenti / prelievi / commissioni (colonna "Dare", "Uscite", "Addebiti", "-").
  * Se l'estratto ha due colonne separate (dare/avere o entrate/uscite), deduci il segno dalla colonna in cui compare l'importo.
- "description": la causale/descrizione del movimento (beneficiario, causale, riferimento). Massimo 300 caratteri. Se assente usa "Movimento".
- IGNORA righe che non sono movimenti: saldo iniziale, saldo finale, totali, intestazioni di colonna, riepiloghi.
- Il "saldo progressivo" NON è un movimento: non estrarlo come riga.
- Includi UNA riga per ogni singolo movimento elencato, nell'ordine in cui appaiono.

OUTPUT JSON ESATTO (nessun markdown, nessun testo fuori dal JSON):
{
  "transactions": [
    { "date": "YYYY-MM-DD", "description": "string", "amount": number }
  ],
  "confidenza_estrazione": "alta" | "media" | "bassa"
}`;

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
    const { file_base64, mime_type, mime, image_url, account_id } = body as {
      file_base64?: string;
      mime_type?: string;
      mime?: string;
      image_url?: string;
      account_id?: string;
    };

    if (!account_id) return errorResponse("account_id obbligatorio", 400, cors);
    if (!file_base64 && !image_url) {
      return errorResponse("file_base64 o image_url obbligatorio", 400, cors);
    }

    // ── Deriva l'azienda dal conto (non ci fidiamo di un company_id lato client) ──
    const { data: account, error: accErr } = await supabaseAdmin
      .from("bank_accounts")
      .select("id, company_id, is_manual")
      .eq("id", account_id)
      .maybeSingle();
    if (accErr) return errorResponse("Errore lettura conto", 500, cors);
    if (!account?.company_id) return errorResponse("Conto non trovato", 404, cors);

    const company_id = account.company_id as string;
    await requireCompanyAccess(supabaseAdmin, userId, company_id, cors);
    const paymentBlock = await gateAiPayment(supabaseAdmin, company_id, cors);
    if (paymentBlock) return paymentBlock;

    const effMime = mime_type || mime || "application/pdf";
    const fileContent = file_base64
      ? `data:${effMime};base64,${file_base64}`
      : image_url!;
    const fingerprint = file_base64
      ? await buildStableAiIdempotencyKey("bank_stmt_file", [file_base64.slice(0, 4000)])
      : image_url!;
    const idempotencyKey = await buildStableAiIdempotencyKey("bank_statement_ocr", [
      company_id,
      account_id,
      userId,
      effMime,
      fingerprint,
    ]);

    let aiResult;
    try {
      aiResult = await aiRouterComplete({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabaseAdmin as any,
        taskKey: "bank_statement_ocr",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Estrai tutti i movimenti (data, descrizione, importo con segno) da questo estratto conto." },
              { type: "image_url", image_url: { url: fileContent } },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ] as any,
          },
        ],
        params: { temperature: 0.05, max_tokens: 4000 },
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

    // Normalizza: accetta sia { transactions:[...] } sia un array diretto.
    const rawList: AnyObj[] = Array.isArray(extracted.transactions)
      ? extracted.transactions
      : Array.isArray(extracted.movimenti)
        ? extracted.movimenti
        : Array.isArray(extracted)
          ? (extracted as unknown as AnyObj[])
          : [];

    const isoDate = /^\d{4}-\d{2}-\d{2}$/;
    const transactions = rawList
      .map((r) => {
        // data: accetta date, data; prova a normalizzare GG/MM/AAAA se sfugge
        let date = String(r.date ?? r.data ?? "").trim().slice(0, 10);
        if (!isoDate.test(date)) {
          const m = date.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
          if (m) {
            const [, d, mo, y] = m;
            const yyyy = y.length === 2 ? `20${y}` : y;
            date = `${yyyy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
          }
        }
        // amount: pulisci eventuali simboli/separatori se è stringa
        let amount: number;
        if (typeof r.amount === "number") amount = r.amount;
        else {
          const s = String(r.amount ?? r.importo ?? "")
            .replace(/[^\d,.-]/g, "")
            .replace(/\.(?=\d{3}(\D|$))/g, "") // migliaia con punto
            .replace(",", ".");
          amount = Number(s);
        }
        const description = String(r.description ?? r.causale ?? r.descrizione ?? "Movimento").slice(0, 300);
        return { date, description, amount };
      })
      .filter((t) => isoDate.test(t.date) && Number.isFinite(t.amount) && t.amount !== 0);

    return jsonResponse({
      transactions,
      confidenza_estrazione: extracted.confidenza_estrazione ?? null,
      ai_meta: {
        model: aiResult.modelUsed,
        tokens: aiResult.totalTokens,
        count: transactions.length,
      },
    }, 200, cors);
  } catch (e) {
    // requireAuth / requireCompanyAccess lanciano una Response già formattata.
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : String(e);
    return errorResponse(`Errore interno: ${msg}`, 500, getCorsHeaders(req));
  }
});
