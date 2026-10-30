/**
 * ai-rapportini-da-documento — i rapportini di una commessa letti da documenti (31/10/2026).
 *
 * Florin: «carico i documenti che scarico, il sistema li legge e crea i
 * rapportini». Fogli di presenza, rapportini di carta fotografati, PDF, export
 * di Excel: il modello legge giorno per giorno cosa si è fatto, chi c'era e
 * quante ore, mezzi, materiali, meteo, e li riporta sulle fasi, le persone, i
 * mezzi e gli articoli di QUESTA commessa (codici corti, vedi mappa.ts).
 *
 * Non salva niente: restituisce le bozze, che il popup «Scrivi rapportini»
 * mostra da controllare. Si salvano con ufficio_crea_rapportini, come quelli
 * scritti a mano, e all'approvazione le ore diventano costo.
 *
 * Input:  { order_id, company_id, files: [{ base64, mime, name }] (max 5), testo?: string }
 * Output: { rapportini: RapportinoLetto[], avvisi: string[], ai_meta }
 */
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { gateAiPayment } from "../_shared/requirePaymentMethod.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";
import { conRegoleDocumento } from "../_shared/documentoNonFidato.ts";
import { erroreAiPerUtente, letturaNonRiuscita } from "../_shared/erroriAi.ts";
import { leggiJsonDalModello } from "../_shared/rispostaModello.ts";
import { elencoPerPrompt, mappaRapportini, type Cataloghi } from "./mappa.ts";

const MAX_FILE = 5;
const MAX_BYTES_BASE64 = 24 * 1024 * 1024;

const SYSTEM_PROMPT = `Sei l'assistente di un'impresa edile italiana. Leggi documenti di cantiere (rapportini di carta, fogli presenze, giornali dei lavori, tabelle Excel) e ne ricavi i rapportini GIORNALIERI di UNA commessa.
Non inventare: quello che non c'è scritto resta vuoto. Un rapportino per ogni giorno di lavoro che il documento riporta.

Ti do i cataloghi della commessa con un codice corto. Usa SOLO quei codici:
- fasi (F1, F2…): la fase su cui si è lavorato, se il documento la nomina o il lavoro la indica chiaramente;
- persone (P1, P2…): chi ha lavorato. Se nel documento c'è una persona che non è nel catalogo, metti "persona": null e il nome letto in "nome_letto";
- mezzi (M1, M2…): mezzi e attrezzi usati, solo se nominati;
- articoli (A1, A2…): materiali usati; se non è nel catalogo, "articolo": null e il nome in "nome_letto".

REGOLE:
- "data": "YYYY-MM-DD". Se l'anno manca, usa quello più vicino alla data di oggi senza andare nel futuro.
- "ore": numero di ore di quella persona quel giorno (punto decimale; "7,30" scritto come orario di lavoro di 7 ore e mezza = 7.5). Se il documento dà entrata e uscita, calcola le ore togliendo la pausa se è scritta.
- "descrizione": cosa si è fatto quel giorno, in italiano, breve e concreto.
- "meteo": solo uno tra soleggiato, nuvoloso, pioggia, neve, vento; altrimenti null.
- In "avvisi" scrivi in italiano ciò che non hai potuto leggere o che è dubbio (date illeggibili, ore poco chiare, nomi incerti).

OUTPUT JSON ESATTO (niente markdown):
{
  "rapportini": [
    {
      "data": "YYYY-MM-DD",
      "descrizione": "string",
      "fasi": ["F1"],
      "persone": [{ "persona": "P1" | null, "nome_letto": "string", "ore": number }],
      "mezzi": [{ "mezzo": "M1", "ore": number | null }],
      "materiali": [{ "articolo": "A1" | null, "nome_letto": "string", "quantita": number }],
      "meteo": "soleggiato" | "nuvoloso" | "pioggia" | "neve" | "vento" | null,
      "note": "string | null"
    }
  ],
  "avvisi": ["string"]
}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const cors = getCorsHeaders(req);
  try {
    if (req.method !== "POST") return errorResponse("Metodo non consentito", 405, cors);
    const { userId, supabaseAdmin } = await requireAuth(req, cors);
    const body = await req.json().catch(() => ({}));
    const { order_id, company_id, files, testo } = body as {
      order_id?: string; company_id?: string; testo?: string;
      files?: Array<{ base64?: string; mime?: string; name?: string }>;
    };
    if (!company_id || !order_id) return errorResponse("Commessa e azienda obbligatorie", 400, cors);
    await requireCompanyAccess(supabaseAdmin, userId, company_id, cors);

    const { data: ordine } = await supabaseAdmin.from("orders").select("id, order_code, description")
      .eq("id", order_id).eq("company_id", company_id).is("deleted_at", null).maybeSingle();
    if (!ordine) return errorResponse("Commessa non trovata", 404, cors);
    const { data: puo } = await supabaseAdmin.rpc("has_permission_for_company", { _user_id: userId, _permission: "can_edit_orders", _company_id: company_id });
    if (puo !== true) return errorResponse("Non hai il permesso di scrivere rapportini su questa commessa", 403, cors);

    const elenco = (Array.isArray(files) ? files : []).filter((f) => f?.base64).slice(0, MAX_FILE);
    const testoLibero = String(testo ?? "").slice(0, 60_000);
    if (!elenco.length && !testoLibero.trim()) return errorResponse("Carica almeno un documento", 400, cors);
    if (elenco.reduce((t, f) => t + (f.base64?.length ?? 0), 0) > MAX_BYTES_BASE64) {
      return errorResponse("Documenti troppo grandi: al massimo circa 18 MB in tutto", 413, cors);
    }

    const paymentBlock = await gateAiPayment(supabaseAdmin, company_id, cors);
    if (paymentBlock) return paymentBlock;

    // I cataloghi della commessa, coi codici corti che il modello userà.
    const [fasi, persone, mezzi, articoli] = await Promise.all([
      supabaseAdmin.from("order_work_phases").select("id, name").eq("order_id", order_id).eq("company_id", company_id).order("position"),
      supabaseAdmin.from("employees").select("id, first_name, last_name").eq("company_id", company_id).eq("is_active", true).order("last_name").limit(400),
      supabaseAdmin.from("mezzi").select("id, nome, targa").eq("company_id", company_id).is("deleted_at", null).order("nome").limit(300),
      supabaseAdmin.from("order_items").select("id, name").eq("order_id", order_id).order("name").limit(300),
    ]);
    const cat: Cataloghi = {
      fasi: (fasi.data ?? []).map((f: { id: string; name: string }) => ({ id: f.id, nome: f.name })),
      persone: (persone.data ?? []).map((e: { id: string; first_name: string | null; last_name: string | null }) => ({ id: e.id, nome: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() })),
      mezzi: (mezzi.data ?? []).map((m: { id: string; nome: string; targa: string | null }) => ({ id: m.id, nome: m.targa ? `${m.nome} (${m.targa})` : m.nome })),
      articoli: (articoli.data ?? []).filter((a: { name: string | null }) => a.name?.trim()).map((a: { id: string; name: string }) => ({ id: a.id, nome: a.name.trim() })),
    };
    const oggi = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());

    const contesto = [
      `Oggi è il ${oggi}. Commessa ${ordine.order_code ?? ""} — ${ordine.description ?? ""}.`,
      `FASI:\n${elencoPerPrompt("F", cat.fasi)}`,
      `PERSONE:\n${elencoPerPrompt("P", cat.persone)}`,
      `MEZZI:\n${elencoPerPrompt("M", cat.mezzi)}`,
      `ARTICOLI:\n${elencoPerPrompt("A", cat.articoli)}`,
      testoLibero.trim() ? `TESTO DEI DOCUMENTI (da fogli di calcolo o testo):\n${testoLibero}` : "",
      "Ricava i rapportini giornalieri da questi documenti.",
    ].filter(Boolean).join("\n\n");
    const contenuto: unknown[] = [{ type: "text", text: contesto }];
    for (const f of elenco) {
      const mime = f.mime || "application/pdf";
      const url = `data:${mime};base64,${f.base64}`;
      contenuto.push(mime.startsWith("image/")
        ? { type: "image_url", image_url: { url, detail: "high" } }
        : { type: "file", file: { filename: f.name || "documento.pdf", file_data: url } });
    }

    const impronta = await buildStableAiIdempotencyKey("rapportini_doc_file", [
      ...elenco.map((f) => (f.base64 ?? "").slice(0, 4000)), testoLibero.slice(0, 4000),
    ]);
    const aiResult = await aiRouterComplete({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabaseAdmin as any,
      taskKey: "rapportini_da_documento",
      messages: [
        { role: "system", content: conRegoleDocumento(SYSTEM_PROMPT) },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { role: "user", content: contenuto as any },
      ],
      params: { temperature: 0.05, max_tokens: 6000 },
      responseFormat: { type: "json_object" },
      companyId: company_id,
      userId,
      idempotencyKey: await buildStableAiIdempotencyKey("rapportini_doc", [company_id, userId, order_id, impronta]),
      estimatedCostEur: 0.1,
    });
    const letto = leggiJsonDalModello(aiResult.content);
    if (!letto) {
      const e = letturaNonRiuscita();
      return jsonResponse(e.body, e.status, cors);
    }
    const { rapportini, avvisi } = mappaRapportini(letto, cat, oggi);
    return jsonResponse({
      rapportini,
      avvisi,
      ai_meta: { model_used: aiResult.modelUsed, tokens: aiResult.totalTokens, cost_billed_eur: aiResult.costBilledEur },
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    const noto = erroreAiPerUtente(err);
    if (noto) return jsonResponse(noto.body, noto.status, getCorsHeaders(req));
    return errorResponse(`Errore interno: ${err instanceof Error ? err.message : String(err)}`, 500, getCorsHeaders(req));
  }
});
