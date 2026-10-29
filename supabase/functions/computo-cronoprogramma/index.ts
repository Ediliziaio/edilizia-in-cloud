/**
 * computo-cronoprogramma — Silvio propone il cronoprogramma dei lavori di un
 * preventivo con computo (29/10/2026): dai capitoli e dalle voci (quantità e
 * importi, niente prezzi unitari) le fasi in giorni lavorativi, con le
 * sovrapposizioni che un'impresa fa davvero (l'impianto elettrico mentre si
 * finisce la muratura, non dopo). L'utente le corregge nell'editor.
 *
 * Input:  { company_id, titolo, oggetto?, indirizzo?, squadre?, note?, capitoli: [{ nome, importo, voci: [{ descrizione, unita, quantita }] }] }
 * Output: { success, fasi: [{ nome, inizio, durata, nota }], nota, ai_meta }
 *
 * Il credito AI, il tetto di spesa e l'allarme del credito li gestisce il router.
 */
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";

const SYSTEM_PROMPT = `Sei il direttore tecnico di un'impresa edile italiana. Ricevi il computo metrico di un lavoro (capitoli, voci, quantità, importi) e prepari il cronoprogramma dei lavori da allegare al preventivo.

REGOLE
- Fasi in GIORNI LAVORATIVI (lun-ven). "inizio" è il primo giorno della fase (1 = primo giorno di cantiere), "durata" quanti giorni lavorativi dura.
- Segui la sequenza reale di cantiere: allestimento e sicurezza, demolizioni e scavi, opere strutturali e sottofondi, impianti, finiture, collaudi e pulizia. Sovrapponi le fasi che si possono fare insieme con squadre diverse; NON sovrapporre quelle che dipendono una dall'altra (il manto in resina dopo il massetto e dopo la sua stagionatura).
- Tieni conto dei tempi tecnici che non sono lavoro ma attesa: stagionatura dei getti e dei massetti, asciugatura, consegna dei materiali su ordinazione. Mettili come fasi o nella nota della fase.
- Durate realistiche per le QUANTITÀ date (mai dedotte dagli importi) e per il numero di squadre indicato. Se non è indicato, ipotizza una squadra per specialità (edile, impiantisti, posatori): la stessa squadra non lavora in parallelo su due fasi. Meglio una stima prudente, e dillo nella nota generale.
- Una fase per gruppo di lavorazioni sensato (di solito per capitolo, oppure dividi un capitolo in due fasi se ha lavorazioni in momenti diversi). Da 3 a 15 fasi, nomi brevi e chiari per il cliente.
- "nota": una frase breve solo se serve (attesa, condizione meteo, dipendenza), altrimenti stringa vuota.
- Non inventare lavorazioni che non sono nel computo, tranne allestimento cantiere, tempi di attesa e pulizia finale.

Rispondi SOLO con JSON: {"fasi":[{"nome":"…","inizio":1,"durata":3,"nota":""}],"nota":"una frase su ipotesi e condizioni del cronoprogramma"}`;

const testo = (v: unknown, max: number) => (typeof v === "string" ? v : "").trim().slice(0, max);
const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("POST only", 405, cors);
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, cors);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const companyId = testo(body.company_id, 80);
    if (!companyId) return errorResponse("company_id required", 400, cors);
    await requireCompanyAccess(supabaseAdmin, userId, companyId, cors);

    const capitoli = (Array.isArray(body.capitoli) ? body.capitoli : []).slice(0, 40).map((c) => {
      const r = (c ?? {}) as Record<string, unknown>;
      const voci = (Array.isArray(r.voci) ? r.voci : []).slice(0, 40).map((v) => {
        const x = (v ?? {}) as Record<string, unknown>;
        return { descrizione: testo(x.descrizione, 200), unita: testo(x.unita, 20), quantita: numero(x.quantita) };
      }).filter((v) => v.descrizione);
      return { nome: testo(r.nome, 200), importo: numero(r.importo), voci };
    }).filter((c) => c.nome && c.voci.length);
    if (!capitoli.length) return errorResponse("Il computo non ha ancora lavorazioni: aggiungile prima di chiedere il cronoprogramma.", 422, cors);

    const descrizione = [
      `Lavoro: ${testo(body.titolo, 200) || "senza titolo"}`,
      testo(body.oggetto, 500) && `Oggetto: ${testo(body.oggetto, 500)}`,
      testo(body.indirizzo, 300) && `Luogo: ${testo(body.indirizzo, 300)}`,
      numero(body.squadre) && `Squadre disponibili: ${numero(body.squadre)}`,
      testo(body.note, 1000) && `Indicazioni dell'impresa: ${testo(body.note, 1000)}`,
      "",
      ...capitoli.map((c, k) => `${k + 1}. ${c.nome}${c.importo != null ? ` (${Math.round(c.importo)} €)` : ""}\n${c.voci.map((v) => `   - ${v.descrizione}${v.quantita != null ? `: ${v.quantita} ${v.unita}` : ""}`).join("\n")}`),
    ].filter((r) => r !== false && r !== null && r !== undefined).join("\n");

    const t0 = Date.now();
    const idempotencyKey = await buildStableAiIdempotencyKey("computo_cronoprogramma", [companyId, userId, descrizione.length, descrizione.slice(0, 400)]);
    const ai = await aiRouterComplete({
      // eslint-disable-next-line no-explicit-any
      supabase: supabaseAdmin as any,
      taskKey: "preventivo_genera",
      messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: descrizione }],
      params: { temperature: 0.2, max_tokens: 3000 },
      responseFormat: { type: "json_object" },
      companyId, userId, idempotencyKey,
    });

    const raw = (ai.content ?? "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    let parsed: { fasi?: unknown; nota?: unknown } = {};
    try { parsed = JSON.parse(raw); } catch {
      const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
      try { parsed = a >= 0 && b > a ? JSON.parse(raw.slice(a, b + 1)) : {}; } catch { parsed = {}; }
    }
    // Numeri ripuliti qui: il client li controlla di nuovo, ma un modello che sbaglia non deve passare.
    const fasi = (Array.isArray(parsed.fasi) ? parsed.fasi : []).slice(0, 30).map((f) => {
      const x = (f ?? {}) as Record<string, unknown>;
      const inizio = Math.round(numero(x.inizio) ?? 0), durata = Math.round(numero(x.durata) ?? 0);
      return { nome: testo(x.nome, 200), inizio: Math.min(2000, Math.max(1, inizio)), durata: Math.min(2000, Math.max(1, durata)), nota: testo(x.nota, 500) };
    }).filter((f) => f.nome);
    if (!fasi.length) return errorResponse("Silvio non è riuscito a preparare il cronoprogramma: riprova, oppure parti dai capitoli.", 502, cors);

    return jsonResponse({
      success: true, fasi, nota: testo(parsed.nota, 1000),
      ai_meta: { model_used: ai.modelUsed, tokens: ai.totalTokens, cost_eur: ai.costRealEur, elapsed_ms: Date.now() - t0 },
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(err instanceof Error ? err.message : String(err), 500, getCorsHeaders(req));
  }
});
