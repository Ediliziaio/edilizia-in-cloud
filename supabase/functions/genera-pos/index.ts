/**
 * genera-pos — Piano Operativo Sicurezza D.Lgs 81/08 art. 89
 *
 * MIGRATO ad aiRouter (task `documento_pos`, claude-haiku-4.5).
 * Cost tracking via charge_ai_call con markup 350%.
 */

import { requireAuth } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

const POS_SYSTEM_PROMPT = `Sei un esperto di sicurezza sul lavoro italiano specializzato in edilizia.
Genera un POS (Piano Operativo di Sicurezza) completo conforme al D.Lgs 81/2008 art. 89 in italiano professionale.
Il POS deve includere OBBLIGATORIAMENTE tutte le sezioni richieste dalla normativa:
1. DATI IDENTIFICATIVI IMPRESA (ragione sociale, P.IVA, RSPP, RLS, Medico Competente, posizione INAIL/PAT)
2. DESCRIZIONE LAVORI E FASI (lavorazioni, cronoprogramma, numero lavoratori per fase)
3. VALUTAZIONE RISCHI SPECIFICI EDILIZIA (caduta dall'alto, elettrocuzione, macchine/attrezzature, rumore/vibrazioni, polveri/agenti chimici) con relative misure di prevenzione
4. DPI (Dispositivi Protezione Individuale) obbligatori per mansione
5. PROCEDURE DI EMERGENZA (numeri emergenza 112/115/118, punto raccolta, primo soccorso)
6. ELENCO SUBAPPALTATORI con verifica DURC

Output: JSON con campi:
- tipo_lavori (string)
- fasi_lavori (array di {fase, durata, lavoratori})
- rischi_presenti (array di {rischio, livello, misura_prevenzione})
- dpi_richiesti (array di {mansione, dpi})
- procedure_operative (testo completo formattato)
- procedure_emergenza (testo con numeri e procedure)
- note_sicurezza (testo)
Rispondi SOLO con JSON valido, senza markdown.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    if (req.method !== "POST") {
      return errorResponse("Metodo non consentito", 405, corsH);
    }

    const { userId, supabaseAdmin } = await requireAuth(req, corsH);

    const { order_id, company_id, responsabile_sicurezza } = await req.json().catch(() => ({}));
    if (!order_id || !company_id) {
      return errorResponse("order_id e company_id sono obbligatori", 400, corsH);
    }

    // Fetch order data
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, description, work_start_date, expected_date, company_id")
      .eq("id", order_id)
      .eq("company_id", company_id)
      .single();

    if (orderError || !order) {
      return errorResponse("Ordine non trovato", 404, corsH);
    }

    // Count lavoratori
    const { count: workerCount } = await supabaseAdmin
      .from("order_employees")
      .select("*", { count: "exact", head: true })
      .eq("order_id", order_id);

    // Fetch anagrafica azienda
    const { data: anagrafica } = await supabaseAdmin
      .from("anagrafica_azienda")
      .select("ragione_sociale, partita_iva, indirizzo_via, indirizzo_comune")
      .eq("company_id", company_id)
      .maybeSingle();

    // Fetch subappaltatori tramite purchase_orders
    const { data: purchaseOrders } = await supabaseAdmin
      .from("purchase_orders")
      .select("supplier_id, suppliers(name)")
      .eq("company_id", company_id)
      .eq("order_id", order_id);

    const subappaltatori = (purchaseOrders || [])
      .map((po: AnyObj) => po.suppliers?.name)
      .filter(Boolean);

    const indirizzoSede = anagrafica
      ? [anagrafica.indirizzo_via, anagrafica.indirizzo_comune].filter(Boolean).join(", ")
      : "";

    const cantiereData = {
      descrizione_lavori: order.description,
      data_inizio: order.work_start_date,
      data_fine_prevista: order.expected_date,
      numero_lavoratori: workerCount || 1,
      impresa: anagrafica?.ragione_sociale || "Non specificata",
      partita_iva: anagrafica?.partita_iva || "",
      indirizzo_sede: indirizzoSede,
      subappaltatori: subappaltatori.join(", ") || "Nessuno",
      responsabile_sicurezza: responsabile_sicurezza || "Da nominare",
    };

    // ──── AI call via aiRouter (cost tracking) ────
    let aiResult;
    try {
      aiResult = await aiRouterComplete({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabaseAdmin as any,
        taskKey: "documento_pos",
        messages: [
          { role: "system", content: POS_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Genera il POS completo D.Lgs.81/08 per questo cantiere edile: ${JSON.stringify(cantiereData, null, 2)}`,
          },
        ],
        params: { temperature: 0.2, max_tokens: 3500 },
        responseFormat: { type: "json_object" },
        companyId: company_id,
        userId,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return errorResponse(`AI Router error: ${msg}`, 502, corsH);
    }

    const rawContent = aiResult.content || "{}";

    let parsed: AnyObj = {};
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      parsed = { tipo_lavori: order.description, procedure_operative: rawContent };
    }

    // Save to pos_documents
    const { data: posDoc, error: insertError } = await supabaseAdmin
      .from("pos_documents")
      .insert({
        company_id,
        order_id,
        tipo_lavori: parsed.tipo_lavori || order.description,
        indirizzo_cantiere: indirizzoSede || "Da specificare",
        data_inizio: order.work_start_date,
        data_fine_prevista: order.expected_date,
        responsabile_sicurezza: responsabile_sicurezza || null,
        numero_lavoratori: workerCount || 1,
        rischi_presenti: parsed.rischi_presenti || [],
        dpi_richiesti: parsed.dpi_richiesti || [],
        procedure_operative: parsed.procedure_operative || "",
        generated_content: rawContent,
        generated_by: "ai",
        created_by: userId,
      })
      .select()
      .single();

    if (insertError) {
      return errorResponse(`Errore salvataggio: ${insertError.message}`, 500, corsH);
    }

    return jsonResponse({
      success: true,
      document: posDoc,
      ai_meta: {
        model_used: aiResult.modelUsed,
        tokens: aiResult.totalTokens,
        cost_eur: aiResult.costRealEur,
        cost_billed_eur: aiResult.costBilledEur,
      },
    }, 200, corsH);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(`Errore interno: ${String(err)}`, 500, corsH);
  }
});
