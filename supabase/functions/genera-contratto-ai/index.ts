/**
 * genera-contratto-ai — FASE B.1
 *
 * Genera un contratto d'appalto in Markdown a partire da un order_id.
 * Utilizza aiRouter (task `documento_contratto`) per cost tracking.
 *
 * Input:  { order_id: uuid, company_id: uuid, opzioni?: {...} }
 * Output: { success, contratto: ContrattoDocument }
 *
 * Conforme: art. 1655 c.c. (contratto di appalto), art. 1657 c.c. (prezzo),
 * art. 1660 c.c. (variazioni), art. 1662 c.c. (verifica avanzamento),
 * art. 1666 c.c. (subappalto), art. 1667 c.c. (garanzia).
 */

import { requireAuth } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

interface OpzioniContratto {
  penale_giorno_eur?: number;
  garanzia_anni?: number;
  modalita_pagamento_custom?: string;
  arbitrato?: boolean;        // clausola arbitrale ICC/CamArb
  foro_competente?: string;   // es. "Roma"
  subappalto_consentito?: boolean;
}

const SYSTEM_PROMPT = `Sei un avvocato esperto di diritto civile italiano specializzato in contratti d'appalto edilizio.
Genera un CONTRATTO D'APPALTO completo in MARKDOWN, conforme al Codice Civile italiano (artt. 1655-1677), in italiano professionale e legalmente valido.

STRUTTURA OBBLIGATORIA (sezioni numerate):
1. INTESTAZIONE (Tra... e..., dati identificativi completi committente e appaltatore)
2. PREMESSE (background, finalità, riferimenti normativi)
3. OGGETTO DELL'APPALTO (art. 1655 c.c. - descrizione opere, ubicazione cantiere)
4. CORRISPETTIVO E MODALITA' DI PAGAMENTO (art. 1657 c.c. - importo IVA inclusa/esclusa, acconti, SAL, saldo)
5. DURATA E TERMINI (data inizio, fine prevista, gg lavorativi)
6. VARIAZIONI (art. 1660 c.c. - autorizzazioni scritte preventive)
7. VERIFICHE E COLLAUDO (art. 1662 c.c. - SAL periodici, collaudo finale)
8. PENALI PER RITARDO (importo €/giorno + cap massimo)
9. GARANZIA E DIFETTI (art. 1667 c.c. - 2 anni dalla consegna, denuncia entro 60gg)
10. SUBAPPALTO (art. 1656 c.c. - solo previa autorizzazione scritta)
11. SICUREZZA (riferimento POS D.Lgs 81/2008)
12. ASSICURAZIONI (RCT/RCO appaltatore, polizza CAR opzionale)
13. RISOLUZIONE E RECESSO (art. 1671 c.c.)
14. CLAUSOLA RISOLUTIVA ESPRESSA (art. 1456 c.c.)
15. FORO COMPETENTE / ARBITRATO
16. PRIVACY (riferimento GDPR)
17. CLAUSOLE FINALI E SOTTOSCRIZIONE (con indicazione luogo/data/firme)

REGOLE:
- USA SOLO i dati reali forniti nel JSON input (NON inventare partita IVA, indirizzi, codici fiscali mancanti)
- Per i dati mancanti, scrivi "[DA COMPLETARE]" tra parentesi quadre
- Calcola gg lavorativi tra data_inizio e data_fine_prevista
- Importi sempre in € con due decimali, formato italiano
- Tono giuridico professionale, frasi chiare, paragrafi numerati con ###
- IVA al 10% se descrizione contiene "ristrutturazione", 22% altrimenti (ma scrivi assunzione)
- NON usare Markdown tabelle (usa elenchi)

OUTPUT: rispondi con JSON valido (NO markdown wrapper) con questi campi ESATTI:
{
  "numero_contratto_suggerito": "string opzionale",
  "oggetto_lavori_breve": "string max 200 char",
  "importo_totale_eur": number,
  "durata_giorni": number,
  "modalita_pagamento_riassunto": "string",
  "penale_riassunto": "string",
  "contenuto_md": "string MARKDOWN COMPLETO del contratto",
  "warnings": ["array di stringhe — dati mancanti o ambiguità"],
  "suggerimenti_next_steps": ["array — es. richiedi POS, polizza CAR, ecc."]
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
    const { order_id, company_id, opzioni } = body as {
      order_id?: string;
      company_id?: string;
      opzioni?: OpzioniContratto;
    };

    if (!order_id || !company_id) {
      return errorResponse("order_id e company_id sono obbligatori", 400, cors);
    }

    // Verifica permessi: user deve essere admin/staff della company
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("company_id, id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile || profile.company_id !== company_id) {
      // super_admin bypass
      const { data: rolesData } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      const isSuper = (rolesData || []).some((r: AnyObj) => r.role === "super_admin");
      if (!isSuper) {
        return errorResponse("Accesso negato", 403, cors);
      }
    }

    // Fetch order
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select(
        "id, description, total_amount, deposit_amount, balance_amount, work_start_date, expected_date, " +
          "client_name, client_company, client_email, client_phone, client_address",
      )
      .eq("id", order_id)
      .eq("company_id", company_id)
      .single();
    if (orderErr || !order) {
      return errorResponse("Ordine non trovato", 404, cors);
    }

    // Fetch anagrafica azienda
    const { data: anagrafica } = await supabaseAdmin
      .from("anagrafica_azienda")
      .select(
        "ragione_sociale, partita_iva, codice_fiscale, forma_giuridica, " +
          "indirizzo_via, indirizzo_numero_civico, indirizzo_cap, indirizzo_comune, indirizzo_provincia, " +
          "pec, codice_sdi, iban_principale",
      )
      .eq("company_id", company_id)
      .maybeSingle();

    // Compose AI input
    const importoTotale = Number(order.total_amount ?? 0);
    const importoAcconto = Number(order.deposit_amount ?? 0);
    const importoSaldo = Number(order.balance_amount ?? 0);

    const indirizzoSede = anagrafica
      ? [
          anagrafica.indirizzo_via,
          anagrafica.indirizzo_numero_civico,
          anagrafica.indirizzo_cap,
          anagrafica.indirizzo_comune,
          anagrafica.indirizzo_provincia ? `(${anagrafica.indirizzo_provincia})` : null,
        ].filter(Boolean).join(" ")
      : "";

    const cantierePayload = {
      committente: {
        nome: order.client_name ?? order.client_company ?? "[DA COMPLETARE]",
        ragione_sociale: order.client_company ?? null,
        codice_fiscale: null,
        partita_iva: null,
        indirizzo: order.client_address ?? null,
        email: order.client_email ?? null,
        telefono: order.client_phone ?? null,
      },
      appaltatore: {
        ragione_sociale: anagrafica?.ragione_sociale ?? "[DA COMPLETARE]",
        forma_giuridica: anagrafica?.forma_giuridica ?? null,
        partita_iva: anagrafica?.partita_iva ?? null,
        codice_fiscale: anagrafica?.codice_fiscale ?? null,
        indirizzo_sede: indirizzoSede,
        pec: anagrafica?.pec ?? null,
        iban: anagrafica?.iban_principale ?? null,
      },
      lavori: {
        descrizione: order.description ?? "[DA COMPLETARE]",
        data_inizio: order.work_start_date,
        data_fine_prevista: order.expected_date,
      },
      economico: {
        importo_totale_eur: importoTotale,
        acconto_eur: importoAcconto,
        saldo_eur: importoSaldo,
      },
      opzioni: {
        penale_giorno_eur: opzioni?.penale_giorno_eur ?? Math.max(50, importoTotale * 0.001),
        garanzia_anni: opzioni?.garanzia_anni ?? 2,
        modalita_pagamento_custom: opzioni?.modalita_pagamento_custom ?? null,
        arbitrato: opzioni?.arbitrato ?? false,
        foro_competente: opzioni?.foro_competente ?? anagrafica?.indirizzo_comune ?? "[FORO]",
        subappalto_consentito: opzioni?.subappalto_consentito ?? true,
      },
    };

    // Call AI via router
    let aiResult;
    try {
      aiResult = await aiRouterComplete({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabaseAdmin as any,
        taskKey: "documento_contratto",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Genera il contratto d'appalto edile completo per questo cantiere. Dati strutturati:\n\n${JSON.stringify(cantierePayload, null, 2)}`,
          },
        ],
        params: { temperature: 0.2, max_tokens: 4000 },
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

    if (!parsed.contenuto_md || typeof parsed.contenuto_md !== "string") {
      return errorResponse("AI non ha generato contenuto contratto", 502, cors);
    }

    // Numerazione progressiva
    const { data: numeroData } = await supabaseAdmin
      .rpc("next_contratto_numero", { p_company_id: company_id });
    const numero_contratto = (numeroData as string) ?? `CON-${Date.now()}`;

    // Calcolo durata giorni se non forniti
    let durataGiorni: number | null = null;
    if (order.work_start_date && order.expected_date) {
      const ms = new Date(order.expected_date).getTime() - new Date(order.work_start_date).getTime();
      durataGiorni = Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
    }

    // Salva
    const { data: contratto, error: insertErr } = await supabaseAdmin
      .from("contratti_documents")
      .insert({
        company_id,
        order_id,
        numero_contratto,
        versione: 1,
        status: "bozza",
        committente_nome: cantierePayload.committente.nome,
        committente_indirizzo: cantierePayload.committente.indirizzo,
        appaltatore_nome: cantierePayload.appaltatore.ragione_sociale,
        appaltatore_pi: cantierePayload.appaltatore.partita_iva,
        appaltatore_indirizzo: cantierePayload.appaltatore.indirizzo_sede,
        oggetto_lavori: parsed.oggetto_lavori_breve ?? order.description,
        importo_totale_eur: importoTotale,
        modalita_pagamento: parsed.modalita_pagamento_riassunto ?? null,
        data_inizio_lavori: order.work_start_date,
        data_fine_prevista: order.expected_date,
        durata_giorni: durataGiorni ?? parsed.durata_giorni ?? null,
        penale_ritardo_eur_giorno: cantierePayload.opzioni.penale_giorno_eur,
        garanzia_anni: cantierePayload.opzioni.garanzia_anni,
        contenuto_md: parsed.contenuto_md,
        ai_generated_raw: parsed,
        ai_model_used: aiResult.modelUsed,
        generated_by: "ai",
        created_by: userId,
      })
      .select()
      .single();

    if (insertErr) {
      return errorResponse(`Errore salvataggio: ${insertErr.message}`, 500, cors);
    }

    return jsonResponse({
      success: true,
      contratto,
      ai_meta: {
        model_used: aiResult.modelUsed,
        tokens: aiResult.totalTokens,
        cost_eur: aiResult.costRealEur,
        cost_billed_eur: aiResult.costBilledEur,
        warnings: parsed.warnings ?? [],
        suggerimenti: parsed.suggerimenti_next_steps ?? [],
      },
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(`Errore interno: ${err instanceof Error ? err.message : String(err)}`, 500, getCorsHeaders(req));
  }
});
