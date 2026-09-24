/**
 * genera-pos — Piano Operativo di Sicurezza sul modello ufficiale
 * (DI 9 settembre 2014, Allegato I; Allegato XV punto 3.2.1 del D.Lgs 81/2008).
 *
 * Azioni (POST, JSON):
 *   crea           { company_id, order_id, ruolo_impresa? } → nuovo POS in bozza,
 *                  compilato con i dati dell'app (niente AI).
 *   dati_app       { company_id, pos_id } → i dati dell'app aggiornati, da unire
 *                  nell'editor (lavorazioni e parti scritte a mano non si toccano).
 *   lavorazioni_ai { company_id, pos_id } → schede delle lavorazioni proposte
 *                  dall'AI, da rileggere e confermare una per una.
 *   approva        { company_id, pos_id } → approva solo se non manca nessuno dei
 *                  contenuti minimi. È l'unica strada: il database rifiuta
 *                  l'approvazione fatta da un utente direttamente.
 *
 * Chi chiama deve avere il permesso Sicurezza Cantiere nell'azienda; per le
 * azioni che scrivono non deve essere in sola lettura.
 */
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { colonneRiassunto, preparaPosDaApp } from "../_shared/posDatiApp.ts";
import { normalizzaLavorazione, normalizzaPos, vociMancanti, type Lavorazione } from "../_shared/posModello.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const AZIONI = ["crea", "dati_app", "lavorazioni_ai", "approva"] as const;
type Azione = typeof AZIONI[number];

async function verificaPermesso(db: Db, userId: string, companyId: string, scrive: boolean, cors: Record<string, string>) {
  const { data: ok } = await db.rpc("has_permission_for_company", {
    _user_id: userId,
    _permission: "can_view_sicurezza_cantiere",
    _company_id: companyId,
  });
  if (ok !== true) throw errorResponse("Non hai il permesso Sicurezza Cantiere in questa azienda", 403, cors);
  if (!scrive) return;
  const { data: sp } = await db
    .from("staff_permissions").select("sola_lettura").eq("user_id", userId).eq("company_id", companyId).maybeSingle();
  if (sp?.sola_lettura === true) {
    const { data: ruoli } = await db.from("user_roles").select("role").eq("user_id", userId);
    const admin = (ruoli ?? []).some((r: { role: string }) => r.role === "company_admin" || r.role === "super_admin");
    if (!admin) throw errorResponse("Sei in sola lettura: non puoi creare né approvare un POS", 403, cors);
  }
}

async function caricaPos(db: Db, companyId: string, posId: string, cors: Record<string, string>) {
  const { data, error } = await db
    .from("pos_documents")
    .select("id, company_id, order_id, status, contenuto, revisione, revisioni, document_type")
    .eq("id", posId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw errorResponse(`POS non leggibile: ${error.message}`, 500, cors);
  if (!data || (data.document_type && data.document_type !== "pos")) throw errorResponse("POS non trovato", 404, cors);
  return data;
}

const SISTEMA_LAVORAZIONI = `Sei un tecnico della sicurezza nei cantieri edili italiani. Prepari le schede delle LAVORAZIONI di un Piano Operativo di Sicurezza (POS) secondo il modello semplificato del Decreto Interministeriale 9 settembre 2014 (Allegato I) e l'Allegato XV, punto 3.2.1, del D.Lgs 81/2008.

Per ogni lavorazione compili i campi della tabella «Lavorazioni svolte in cantiere» del modello:
- titolo: nome breve della lavorazione (es. «Montaggio e smontaggio del ponteggio»)
- descrizione: cosa si fa
- modalita: modalità e organizzazione della fase di lavoro
- sostanze: sostanze e miscele pericolose tipiche della lavorazione, scrivendo «da verificare con le schede di sicurezza dei prodotti usati»; «Nessuna» se non ce ne sono
- opere_provvisionali: ponteggi, trabattelli, parapetti, ecc.; «Nessuna» se non servono
- macchine: macchine e attrezzature; usa quelle della commessa se pertinenti, altrimenti tipologie generiche; «Nessuna» se non servono
- impianti: impianti di cantiere (elettrico, idrico, ecc.) o «Nessuno»
- turni: turni di lavoro (es. «Turno unico diurno»)
- rischi: rischi specifici della lavorazione, uno per riga
- misure: misure preventive e protettive concrete per ciascun rischio, una per riga, con i riferimenti normativi SOLO se certi (es. D.Lgs 81/2008 Titolo IV Capo II per i lavori in quota, Allegato XVIII e PiMUS per i ponteggi, Titolo VIII per rumore e vibrazioni, Titolo IX per gli agenti chimici)
- dpi: DPI necessari, uno per riga, con la norma EN solo se certa (es. elmetto EN 397, calzature di sicurezza EN ISO 20345, imbracatura anticaduta EN 361, otoprotettori EN 352, facciale filtrante EN 149)
- durata_giorni: durata presunta in giorni, coerente con la durata totale del cantiere
- svolgimento: "diretto", oppure "subappalto" SOLO se tra i subappaltatori della commessa ce n'è uno che fa quel lavoro
- svolgimento_con: il nome di quel subappaltatore, altrimenti vuoto

Regole:
- 3-8 lavorazioni, nell'ordine in cui si svolgono, specifiche per QUESTO cantiere.
- MAI inventare nomi di persone, numeri di telefono, livelli di rumore in dB, marche, codici o date.
- Scrivi in italiano tecnico, frasi brevi, senza markdown.
- Rispondi SOLO con JSON: {"lavorazioni": [ {...}, ... ]}.`;

async function proponiLavorazioni(db: Db, companyId: string, userId: string, pos: Record<string, unknown>, cors: Record<string, string>): Promise<Lavorazione[]> {
  const contenuto = normalizzaPos(pos.contenuto);
  const { contesto } = await preparaPosDaApp(db, companyId, String(pos.order_id));
  const dati = {
    descrizione_attivita: contenuto.opera.descrizione_attivita,
    modalita_organizzative: contenuto.opera.modalita_organizzative,
    data_inizio: contenuto.opera.data_inizio,
    data_fine: contenuto.opera.data_fine,
    lavoratori: contenuto.lavoratori.map((r) => `${r.numero} ${r.qualifica}`),
    macchine_e_attrezzature_della_commessa: contesto.mezzi.map((m) => `${m.nome} (${m.tipo})`),
    subappaltatori_della_commessa: contesto.subappaltatori.map((s) => `${s.ragione_sociale}: ${s.tipo_lavori || "lavori non indicati"}`),
    lavorazioni_gia_presenti: contenuto.lavorazioni.map((l) => l.titolo).filter(Boolean),
  };
  if (!dati.descrizione_attivita.trim()) {
    throw errorResponse("Scrivi prima la descrizione dell'attività di cantiere: l'AI parte da lì", 422, cors);
  }

  let risposta;
  try {
    risposta = await aiRouterComplete({
      supabase: db,
      taskKey: "documento_pos",
      messages: [
        { role: "system", content: SISTEMA_LAVORAZIONI },
        { role: "user", content: `Dati del cantiere:\n${JSON.stringify(dati, null, 2)}` },
      ],
      params: { temperature: 0.2, max_tokens: 7000 },
      responseFormat: { type: "json_object" },
      companyId,
      userId,
      estimatedCostEur: 0.05,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw errorResponse(`L'AI non ha risposto: ${msg}. Riprova tra poco o scrivi le lavorazioni a mano.`, 502, cors);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(risposta.content || "{}");
  } catch {
    throw errorResponse("L'AI ha risposto in un formato non leggibile: riprova", 502, cors);
  }
  const elenco = Array.isArray((parsed as { lavorazioni?: unknown })?.lavorazioni)
    ? (parsed as { lavorazioni: unknown[] }).lavorazioni
    : [];
  const base = Date.now().toString(36);
  const lavorazioni = elenco
    .map((l, i) => ({ ...normalizzaLavorazione(l, `ai-${base}-${i + 1}`), origine: "ai" as const, verificata: false }))
    .filter((l) => l.titolo.trim() || l.descrizione.trim());
  if (!lavorazioni.length) throw errorResponse("L'AI non ha proposto lavorazioni: riprova o scrivile a mano", 502, cors);
  return lavorazioni;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const cors = getCorsHeaders(req);

  try {
    if (req.method !== "POST") return errorResponse("Metodo non consentito", 405, cors);
    const { userId, supabaseAdmin: db } = await requireAuth(req, cors);

    const body = await req.json().catch(() => ({}));
    // Compatibilità: chi chiamava senza azione con order_id voleva creare un POS.
    const azione: Azione = AZIONI.includes(body.azione) ? body.azione : body.order_id ? "crea" : body.azione;
    const companyId = typeof body.company_id === "string" ? body.company_id : "";
    if (!AZIONI.includes(azione)) return errorResponse("Azione non riconosciuta", 400, cors);
    if (!companyId) return errorResponse("company_id obbligatorio", 400, cors);

    await requireCompanyAccess(db, userId, companyId, cors);
    await verificaPermesso(db, userId, companyId, azione === "crea" || azione === "approva", cors);

    if (azione === "crea") {
      const orderId = typeof body.order_id === "string" ? body.order_id : "";
      if (!orderId) return errorResponse("Scegli la commessa del POS", 400, cors);
      let preparato;
      try {
        preparato = await preparaPosDaApp(db, companyId, orderId);
      } catch (e) {
        return errorResponse(e instanceof Error ? e.message : "Commessa non trovata", 404, cors);
      }
      const contenuto = preparato.contenuto;
      if (["affidataria", "affidataria_esecutrice", "esecutrice_subappalto"].includes(body.ruolo_impresa)) {
        contenuto.impresa.ruolo = body.ruolo_impresa;
      }
      const oggi = new Date().toISOString().slice(0, 10);
      const { data: doc, error } = await db
        .from("pos_documents")
        .insert({
          company_id: companyId,
          order_id: orderId,
          document_type: "pos",
          status: "bozza",
          version: 1,
          revisione: 0,
          revisioni: [{ rev: 0, data: oggi, descrizione: "Prima emissione" }],
          contenuto,
          generated_by: "app",
          created_by: userId,
          valid_from: oggi,
          ...colonneRiassunto(contenuto),
        })
        .select("id")
        .single();
      if (error) return errorResponse(`POS non salvato: ${error.message}`, 500, cors);
      return jsonResponse({ ok: true, pos_id: doc.id, avvisi: preparato.contesto.avvisi, contesto: preparato.contesto }, 200, cors);
    }

    const posId = typeof body.pos_id === "string" ? body.pos_id : "";
    if (!posId) return errorResponse("pos_id obbligatorio", 400, cors);
    const pos = await caricaPos(db, companyId, posId, cors);

    if (azione === "dati_app") {
      const preparato = await preparaPosDaApp(db, companyId, String(pos.order_id));
      return jsonResponse({ ok: true, contenuto: preparato.contenuto, contesto: preparato.contesto }, 200, cors);
    }

    if (azione === "lavorazioni_ai") {
      const lavorazioni = await proponiLavorazioni(db, companyId, userId, pos, cors);
      return jsonResponse({ ok: true, lavorazioni }, 200, cors);
    }

    // approva
    if (pos.status === "approvato") return jsonResponse({ ok: true, gia_approvato: true }, 200, cors);
    const contenuto = normalizzaPos(pos.contenuto);
    const mancanti = vociMancanti(contenuto);
    if (mancanti.length) {
      return jsonResponse({ ok: false, error: "Il POS non ha ancora tutti i contenuti minimi dell'Allegato XV", mancanti }, 422, cors);
    }
    const { data: profilo } = await db.from("profiles").select("first_name, last_name, email").eq("id", userId).maybeSingle();
    const nome = [profilo?.first_name, profilo?.last_name].filter(Boolean).join(" ") || profilo?.email || "utente";
    const { error } = await db
      .from("pos_documents")
      .update({
        status: "approvato",
        approvato_da: userId,
        approvato_da_nome: nome,
        approvato_il: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...colonneRiassunto(contenuto),
      })
      .eq("id", posId)
      .eq("company_id", companyId)
      .eq("status", pos.status);
    if (error) return errorResponse(`POS non approvato: ${error.message}`, 500, cors);
    return jsonResponse({ ok: true, approvato_da_nome: nome }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(`Errore interno: ${err instanceof Error ? err.message : String(err)}`, 500, cors);
  }
});
