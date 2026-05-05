/**
 * suggerisci-sal-ai — FASE B.3
 *
 * Dato un order_id + numero SAL da emettere, suggerisce per ogni voce contrattuale
 * la % di avanzamento basandosi su:
 *   - articoli ordine (descrizione + importo)
 *   - SAL precedenti emessi
 *   - giorni passati / giorni totali previsti
 *   - foto cantiere recenti (vision se presenti)
 *   - rapportini campo recenti
 *
 * Output: voci_suggerite[] + percentuale_globale_suggerita + note_draft
 *
 * Non modifica nulla — solo suggerisce. L'utente resta in controllo del SAL.
 */

import { requireAuth } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

const SYSTEM_PROMPT = `Sei un esperto di gestione cantieri edili italiano.
Stai assistendo nella compilazione di uno STATO AVANZAMENTO LAVORI (SAL) periodico.

Compito: dato l'ordine, gli articoli (voci contrattuali), SAL precedenti, foto cantiere e rapportini campo,
SUGGERISCI per ogni voce contrattuale la % di avanzamento ragionevole, oltre a note esecutive.

REGOLE:
- Le % devono essere monotone crescenti (mai inferiori al SAL precedente per la stessa voce)
- Massimo 100% per voce
- Stima conservativa: se mancano dati, suggerisci % cautelativa
- Tieni conto del tempo trascorso (gg lavorati / gg totali) come baseline lineare
- Voci con foto cantiere o rapportini esplicitamente positivi → puoi alzare leggermente
- Voci senza riscontri → mantieni baseline temporale

OUTPUT JSON (no markdown):
{
  "voci_suggerite": [
    {
      "descrizione": "string (match esatto con voce ordine se possibile)",
      "importo_contrattuale": number,
      "perc_precedente": number | 0,
      "perc_suggerita": number,
      "perc_delta": number,
      "razionale": "string breve (max 100 char)",
      "confidenza": "alta" | "media" | "bassa"
    }
  ],
  "percentuale_globale_suggerita": number,
  "note_sal_draft": "string (max 500 char) — testo da incollare nel campo note del SAL",
  "warnings": ["array — anomalie rilevate, es. SAL già al 100% / mancano dati"]
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
    const { order_id, company_id, numero_sal } = body as {
      order_id?: string;
      company_id?: string;
      numero_sal?: number;
    };

    if (!order_id || !company_id) {
      return errorResponse("order_id e company_id obbligatori", 400, cors);
    }

    // Fetch order
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id, description, total_amount, work_start_date, expected_date")
      .eq("id", order_id)
      .eq("company_id", company_id)
      .single();
    if (orderErr || !order) {
      return errorResponse("Ordine non trovato", 404, cors);
    }

    // Fetch order items (articoli)
    const { data: items } = await supabaseAdmin
      .from("order_items")
      .select("name, description, quantity, unit_price")
      .eq("order_id", order_id);

    // Fetch SAL precedenti
    const { data: salList } = await supabaseAdmin
      .from("sal_records")
      .select("id, numero_sal, data_emissione, importo_totale, sal_voci(descrizione, importo_contrattuale, percentuale_avanzamento)")
      .eq("order_id", order_id)
      .order("numero_sal", { ascending: true });

    // Aggregate ultima % per voce dai SAL precedenti
    const ultimePerc: Record<string, number> = {};
    (salList ?? []).forEach((sal: AnyObj) => {
      (sal.sal_voci ?? []).forEach((voce: AnyObj) => {
        const desc = String(voce.descrizione ?? "").trim().toLowerCase();
        if (!desc) return;
        ultimePerc[desc] = Math.max(ultimePerc[desc] ?? 0, Number(voce.percentuale_avanzamento ?? 0));
      });
    });

    // Calcola giorni
    let gg_passati: number | null = null;
    let gg_totali: number | null = null;
    if (order.work_start_date) {
      gg_passati = Math.max(0, Math.round(
        (Date.now() - new Date(order.work_start_date).getTime()) / 86400000,
      ));
    }
    if (order.work_start_date && order.expected_date) {
      gg_totali = Math.max(1, Math.round(
        (new Date(order.expected_date).getTime() - new Date(order.work_start_date).getTime()) / 86400000,
      ));
    }

    // Fetch ultimi 3 rapportini campo (per contesto)
    const { data: rapportini } = await supabaseAdmin
      .from("campo_rapportini")
      .select("data_lavoro, descrizione_lavori, ore_lavorate, percentuale_avanzamento, lavoro_completato, note")
      .eq("order_id", order_id)
      .order("data_lavoro", { ascending: false })
      .limit(3);

    // Compose payload
    const payload = {
      ordine: {
        descrizione: order.description,
        importo_totale_eur: Number(order.total_amount ?? 0),
        data_inizio: order.work_start_date,
        data_fine_prevista: order.expected_date,
        gg_passati,
        gg_totali,
        avanzamento_temporale_pct: gg_passati && gg_totali
          ? Math.min(100, Math.round((gg_passati / gg_totali) * 100))
          : null,
      },
      voci_contrattuali: (items ?? []).map((it: AnyObj) => ({
        descrizione: it.name,
        dettaglio: it.description ?? null,
        quantita: it.quantity,
        importo_eur: Number(it.unit_price ?? 0) * Number(it.quantity ?? 1),
        perc_precedente: ultimePerc[String(it.name ?? "").trim().toLowerCase()] ?? 0,
      })),
      sal_precedenti_count: (salList ?? []).length,
      numero_sal_corrente: numero_sal ?? ((salList?.length ?? 0) + 1),
      ultimi_rapportini: (rapportini ?? []).map((r: AnyObj) => ({
        data: r.data_lavoro,
        lavorazioni: r.descrizione_lavori,
        ore_lavorate: r.ore_lavorate,
        perc_voce: r.percentuale_avanzamento,
        completato: r.lavoro_completato,
        note: r.note,
      })),
    };

    // AI call
    let aiResult;
    try {
      aiResult = await aiRouterComplete({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabaseAdmin as any,
        taskKey: "documento_contratto",  // riusa config (haiku-4.5)
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Suggerisci % avanzamento per il SAL n.${payload.numero_sal_corrente} di questo cantiere:\n\n${JSON.stringify(payload, null, 2)}`,
          },
        ],
        params: { temperature: 0.2, max_tokens: 2500 },
        responseFormat: { type: "json_object" },
        companyId: company_id,
        userId,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return errorResponse(`AI Router error: ${msg}`, 502, cors);
    }

    let parsed: AnyObj = {};
    try {
      parsed = JSON.parse(aiResult.content);
    } catch {
      return errorResponse("AI ha restituito JSON non valido", 502, cors);
    }

    return jsonResponse({
      success: true,
      suggerimenti: parsed,
      contesto: {
        articoli_count: (items ?? []).length,
        sal_precedenti: (salList ?? []).length,
        rapportini_count: (rapportini ?? []).length,
        gg_passati,
        gg_totali,
      },
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
