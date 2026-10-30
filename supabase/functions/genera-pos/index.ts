import { supportaRequisitiAddettiPos } from "../_shared/posRequisitiAddetti.ts";
import { supportaDocumentiMezziPos } from "../_shared/posDocumentiMezzi.ts";
import { supportaMezziPos } from "../_shared/posMezzi.ts";
import { supportaFontiTecnichePos } from "../_shared/posFontiTecniche.ts";
import { supportaTecnicaPos } from "../_shared/posTecnica.ts";
import { supportaProdottiPos } from "../_shared/posProdotti.ts";
import { percorsoStorageSicuro } from "../_shared/posPercorsi.ts";
import { oggiRoma } from "../_shared/posData.ts";
import { AZIONI_POS, eAzioneBrowserPos, scriveAzionePos, type AzionePos } from "../_shared/posAzioni.ts";
import { lavorazioniDaRispostaAi } from "../_shared/posAi.ts";
import { controlliApprovazione } from "../_shared/posApprovazione.ts";
import { leggiRichiestaPos } from "../_shared/posRichiesta.ts";
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
 *                  dall'AI, da rileggere e confermare una per una, più le
 *                  modalità organizzative del cantiere (lettera c) se mancano.
 *   approva        { company_id, pos_id } → approva solo se non manca nessuno dei
 *                  contenuti minimi. È l'unica strada: il database rifiuta
 *                  l'approvazione fatta da un utente direttamente.
 *   anteprima_html, prepara_emissione, completa_emissione, annulla_emissione
 *                  Il PDF lo disegna il browser (il server ha 2 s di CPU per richiesta): vedi
 *                  _shared/posAzioniBrowser.ts. anteprima_pdf, approva ed emetti, dove il PDF lo
 *                  disegna il server, restano per le app già installate.
 *
 * Chi chiama deve avere il permesso Sicurezza Cantiere nell'azienda; per le
 * azioni che scrivono non deve essere in sola lettura.
 */
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { amministraAzienda } from "../_shared/amministraAzienda.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { extractJsonFromLLM } from "../_shared/extractJson.ts";
import { colonneRiassunto, preparaPosDaApp } from "../_shared/posDatiApp.ts";
import { normalizzaLavorazione, normalizzaPos, type Lavorazione } from "../_shared/posModello.ts";

import { applicaRiusoPos, lavorazioniRiutilizzabili } from "../_shared/posRiuso.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

type Azione = AzionePos;

async function verificaPermesso(db: Db, userId: string, companyId: string, scrive: boolean, cors: Record<string, string>) {
  const { data: ok, error: permessoError } = await db.rpc("has_permission_for_company", {
    _user_id: userId,
    _permission: "can_view_sicurezza_cantiere",
    _company_id: companyId,
  });
  if (permessoError) throw errorResponse("Permessi non verificabili: riprova prima di procedere",503,cors);
  if (ok !== true) throw errorResponse("Non hai il permesso Sicurezza Cantiere in questa azienda", 403, cors);
  if (!scrive) return;
  const { data: sp, error: staffError } = await db
    .from("staff_permissions").select("sola_lettura").eq("user_id", userId).eq("company_id", companyId).maybeSingle();
  if (staffError) throw errorResponse("Sola lettura non verificabile",503,cors);
  if (sp?.sola_lettura === true) {
    const { data: ruoli } = await db.from("user_roles").select("role").eq("user_id", userId);
    const superAdmin = (ruoli ?? []).some((r: { role: string }) => r.role === "super_admin");
    // L'amministratore di QUESTA azienda (26/09/2026): prima bastava esserlo di
    // un'azienda qualsiasi per superare la sola lettura anche qui.
    const admin = superAdmin || (await amministraAzienda(db, userId, companyId));
    if (!admin) throw errorResponse("Sei in sola lettura: non puoi creare né approvare un POS", 403, cors);
  }
}

/** Un RAISE EXCEPTION dei nostri trigger (P0001) dice all'utente cosa correggere; gli altri errori del database restano nei log del server. */
function erroreDb(contesto: string, error: { message: string; code?: string }, cors: Record<string, string>) {
  console.error(`genera-pos: ${contesto}`, error.code ?? "", error.message);
  return errorResponse(error.code === "P0001" ? `${contesto}: ${error.message}` : `${contesto}: riprova tra poco`, 500, cors);
}

async function caricaPos(db: Db, companyId: string, posId: string, cors: Record<string, string>) {
  const { data, error } = await db
    .from("pos_documents")
    .select("id, company_id, order_id, status, contenuto, revisione, revisioni, document_type, updated_at")
    .eq("id", posId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw erroreDb("POS non leggibile", error, cors);
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
- rischi: ELENCO (array di stringhe) dei rischi specifici della lavorazione
- misure: ELENCO (array di stringhe) delle misure preventive e protettive concrete per ciascun rischio, con i riferimenti normativi SOLO se certi (es. D.Lgs 81/2008 Titolo IV Capo II per i lavori in quota, Allegato XVIII e PiMUS per i ponteggi, Titolo VIII per rumore e vibrazioni, Titolo IX per gli agenti chimici)
- dpi: ELENCO (array di stringhe) dei DPI necessari, con la norma EN solo se certa (es. elmetto EN 397, calzature di sicurezza EN ISO 20345, imbracatura anticaduta EN 361, otoprotettori EN 352, facciale filtrante EN 149)
- durata_giorni: durata presunta in giorni, coerente con la durata totale del cantiere
- svolgimento: "diretto", oppure "subappalto" SOLO se tra i subappaltatori della commessa ce n'è uno che fa quel lavoro
- svolgimento_con: il nome di quel subappaltatore, altrimenti vuoto

Inoltre scrivi modalita_organizzative: come è organizzato QUESTO cantiere (Allegato XV 3.2.1 lettera c), in 5-8 frasi brevi separate da a capo: recinzione e accessi, viabilità e aree di carico e scarico, aree di stoccaggio dei materiali, servizi igienico-assistenziali, gestione dei rifiuti, impianti di cantiere, coordinamento con le altre imprese presenti (se ce ne sono), rapporti col committente.

Regole:
- Una lavorazione per ogni fase di lavoro della commessa, se le fasi ci sono (accorpando quelle minori), altrimenti 3-6; nell'ordine in cui si svolgono, specifiche per QUESTO cantiere. Frasi brevi.
- Se una lavorazione richiede opere provvisionali in quota (ponteggi, trabattelli), indica i rischi di caduta dall'alto e le misure del Titolo IV Capo II.
- MAI inventare nomi di persone, numeri di telefono, livelli di rumore in dB, marche, codici o date.
- Scrivi in italiano tecnico, frasi brevi, senza markdown.
- Rispondi SOLO con JSON valido, senza blocchi di codice e senza testo prima o dopo: {"modalita_organizzative": "…", "lavorazioni": [ {...}, ... ]}. Niente a capo dentro le stringhe delle lavorazioni: gli elenchi sono array.`;

async function proponiLavorazioni(db: Db, companyId: string, userId: string, pos: Record<string, unknown>, cors: Record<string, string>): Promise<{ lavorazioni: Lavorazione[]; modalita_organizzative: string }> {
  const contenuto = normalizzaPos(pos.contenuto);
  const { contesto } = await preparaPosDaApp(db, companyId, String(pos.order_id));
  const dati = {
    descrizione_attivita: contenuto.opera.descrizione_attivita,
    modalita_organizzative: contenuto.opera.modalita_organizzative,
    turni_di_lavoro: contenuto.opera.turni_lavoro,
    fasi_di_lavoro_della_commessa: contesto.fasi ?? [],
    indirizzo_cantiere: [contenuto.opera.cantiere.via, contenuto.opera.cantiere.localita].filter(Boolean).join(", "),
    data_inizio: contenuto.opera.data_inizio,
    data_fine: contenuto.opera.data_fine,
    lavoratori: contenuto.lavoratori.map((r) => `${r.numero} ${r.qualifica}`),
    macchine_e_attrezzature_della_commessa: contesto.mezzi.map((m) => `${m.nome} (${m.tipo})`),
    subappaltatori_della_commessa: contesto.subappaltatori.map((s) => `${s.ragione_sociale}: ${s.tipo_lavori || "lavori non indicati"}`),
    lavorazioni_gia_presenti: contenuto.lavorazioni.map((l) => l.titolo).filter(Boolean),
  };
  if (!dati.descrizione_attivita.trim() && !dati.fasi_di_lavoro_della_commessa.length) {
    throw errorResponse("Scrivi prima la descrizione dell'attività di cantiere (o aggiungi le fasi alla commessa): l'AI parte da lì", 422, cors);
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
    // Tollera blocchi ```json e testo attorno (i modelli via router non sempre rispettano il formato).
    parsed = extractJsonFromLLM(risposta.content || "");
  } catch {
    throw errorResponse("L'AI ha risposto in un formato non leggibile: riprova", 502, cors);
  }
  const elenco = Array.isArray((parsed as { lavorazioni?: unknown })?.lavorazioni)
    ? (parsed as { lavorazioni: unknown[] }).lavorazioni
    : [];
  const lavorazioni = lavorazioniDaRispostaAi(elenco, `ai-${Date.now().toString(36)}`);
  if (!lavorazioni.length) throw errorResponse("L'AI non ha proposto lavorazioni: riprova o scrivile a mano", 502, cors);
  const modalita = (parsed as { modalita_organizzative?: unknown })?.modalita_organizzative;
  return { lavorazioni, modalita_organizzative: typeof modalita === "string" ? modalita.trim() : "" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const cors = getCorsHeaders(req);

  try {
    if (req.method !== "POST") return errorResponse("Metodo non consentito", 405, cors);
    const { userId, supabaseAdmin: db } = await requireAuth(req, cors);

    const { body, pdf } = await leggiRichiestaPos(req);
    // Compatibilità: chi chiamava senza azione con order_id voleva creare un POS.
    const azione: Azione = body.azione == null && body.order_id ? "crea" : body.azione;
    const companyId = typeof body.company_id === "string" ? body.company_id : "";
    if (!AZIONI_POS.includes(azione)) return errorResponse("Azione non riconosciuta", 400, cors);
    if (!companyId) return errorResponse("company_id obbligatorio", 400, cors);

    await requireCompanyAccess(db, userId, companyId, cors);
    await verificaPermesso(db, userId, companyId, scriveAzionePos(azione), cors);

    if(azione === "apri_originale_addetto") {
      const persona=String(body.persona_id||"");
      const {data:fonte,error}=await db.rpc("pos_originale_addetto_per_autore",{_company:companyId,_ordine:String(body.order_id||""),_riesame:String(body.riesame_id||""),_persona:persona,_documento:String(body.documento_id||""),_impronta:String(body.impronta||""),_autore:userId});
      if(error)return errorResponse(error.message,error.code==="40001"?409:error.code==="42501"?403:400,cors);
      const path=fonte?.path;
      if(fonte?.bucket!=="hr-documenti"||typeof path!=="string"||!path.startsWith(`${companyId}/${persona}/`)||!percorsoStorageSicuro(path)||path.split("/").length!==3)return errorResponse("Originale formativo non disponibile",403,cors);
      const {data:link,error:err}=await db.storage.from("hr-documenti").createSignedUrl(path,300);
      if(err||!link?.signedUrl)return errorResponse("Originale formativo non disponibile",503,cors);
      return jsonResponse({ok:true,url:link.signedUrl},200,cors);
    }
    if(azione === "apri_documento_mezzo") {
      const ordine=String(body.order_id||""),mezzo=String(body.mezzo_id||""),documento=String(body.documento_id||""),impronta=String(body.impronta||"");
      const {data:path,error}=await db.rpc("pos_documento_mezzo_per_autore",{_company:companyId,_ordine:ordine,_mezzo:mezzo,_documento:documento,_impronta:impronta,_autore:userId});
      if(error)return errorResponse(error.message,error.code==="40001"?409:error.code==="42501"?403:400,cors);
      if(typeof path!=="string"||!path.startsWith(`${companyId}/${mezzo}/`)||!percorsoStorageSicuro(path)||path.split("/").length!==3)return errorResponse("Originale attrezzatura non disponibile",403,cors);
      const {data:link,error:err}=await db.storage.from("mezzi-documenti").createSignedUrl(path,300);
      if(err||!link?.signedUrl)return errorResponse("Originale attrezzatura non disponibile",503,cors);
      return jsonResponse({ok:true,url:link.signedUrl},200,cors);
    }
    if (azione === "scarica_emissione") {
      if(!["pdf","zip"].includes(body.tipo)) return errorResponse("Scegli PDF o fascicolo",400,cors);
      const {scaricaEmissionePos}=await import("../_shared/posEmissione.ts");
      const r=await scaricaEmissionePos(db,companyId,String(body.emissione_id||""),body.tipo);
      return jsonResponse({ok:true,...r},200,cors);
    }
    if (eAzioneBrowserPos(azione)) {
      const { gestisciAzioneBrowserPos } = await import("../_shared/posAzioniBrowser.ts");
      const r = await gestisciAzioneBrowserPos({ azione, db, userId, companyId, body, pdf, caricaPos: (id) => caricaPos(db, companyId, id, cors) });
      return jsonResponse(r.corpo, r.status, cors);
    }
    if (azione === "archivia_modello") {
      const {data,error}=await db.from("pos_modelli_aziendali").update({archiviato:true}).eq("company_id",companyId).eq("id",body.modello_id).select("id").maybeSingle();
      if(error) return errorResponse("Modello non archiviato",500,cors);
      if(!data) return errorResponse("Modello non trovato",404,cors);
      return jsonResponse({ok:true},200,cors);
    }
    if (azione === "salva_modello") {
      const nome=typeof body.nome === "string" ? body.nome.trim() : "";
      const ambito=typeof body.ambito === "string" ? body.ambito.trim() : "";
      if(!nome || nome.length>100 || !ambito || ambito.length>500 || body.testi_verificati !== true) return errorResponse("Indica nome e campo d’impiego e verifica i testi da riutilizzare",400,cors);
      const sorgente=await caricaPos(db,companyId,String(body.pos_id||""),cors);
      if(body.attesa_updated_at !== sorgente.updated_at) return errorResponse("Il POS è cambiato: ricaricalo prima di salvare il modello",409,cors);
      if(sorgente.contenuto?.versione_requisiti_addetti===1&&!supportaRequisitiAddettiPos(body))return errorResponse("Ricarica l’editor per riutilizzare le lavorazioni senza trasferire riscontri nominativi",409,cors);
      if(sorgente.contenuto?.versione_documenti_mezzi===1&&!supportaDocumentiMezziPos(body))return errorResponse("Ricarica l’editor per riutilizzare i documenti delle attrezzature",409,cors);
      if(sorgente.contenuto?.versione_mezzi===1&&!supportaMezziPos(body))return errorResponse("Ricarica l’editor per riutilizzare le attrezzature",409,cors);
      if(sorgente.contenuto?.versione_fonti_tecniche===1&&!supportaFontiTecnichePos(body))return errorResponse("Ricarica l’editor per riutilizzare le fonti tecniche",409,cors);
      if(sorgente.contenuto?.versione_tecnica===1&&!supportaTecnicaPos(body)) return errorResponse("Ricarica l’editor per riutilizzare il dettaglio tecnico",409,cors);
      const lavorazioni=lavorazioniRiutilizzabili(sorgente.contenuto);
      if(!lavorazioni.length) return errorResponse("Il POS non contiene lavorazioni da riutilizzare",400,cors);
      const {data:versioni,error:versioniError}=await db.from("pos_modelli_aziendali").select("nome,versione").eq("company_id",companyId).ilike("nome",nome.replace(/[\\%_]/g, "\\$&")).order("versione",{ascending:false}).limit(1);
      if(versioniError) return errorResponse("Versione del modello non verificabile",503,cors);
      const versione=(versioni?.[0]?.versione||0)+1;
      const {data:modello,error}=await db.from("pos_modelli_aziendali").insert({company_id:companyId,nome,ambito,versione,contenuto:{versione_modello:1,...(sorgente.contenuto?.versione_requisiti_addetti===1?{versione_requisiti_addetti:1}:{}),...(lavorazioni.some(l=>l.tecnica)?{versione_tecnica:1}:{}),...(sorgente.contenuto?.versione_fonti_tecniche===1?{versione_fonti_tecniche:1}:{}),...(sorgente.contenuto?.versione_mezzi===1?{versione_mezzi:1}:{}),...(sorgente.contenuto?.versione_documenti_mezzi===1?{versione_documenti_mezzi:1}:{}),lavorazioni},sorgente_pos_id:sorgente.id,created_by:userId}).select("id").single();
      if(error) return errorResponse(error.code === "23505" ? "Il modello è stato aggiornato da un altro utente: riprova" : "Modello non salvato",error.code === "23505" ? 409 : 500,cors);
      return jsonResponse({ok:true,modello_id:modello.id,versione},200,cors);
    }
    if (azione === "crea") {
      const orderId = typeof body.order_id === "string" ? body.order_id : "";
      if (!orderId) return errorResponse("Scegli la commessa del POS", 400, cors);
      let preparato;
      try {
        preparato = await preparaPosDaApp(db, companyId, orderId);
      } catch (e) {
        return errorResponse(e instanceof Error ? e.message : "Commessa non trovata", 404, cors);
      }
      let contenuto = preparato.contenuto;
      if(supportaRequisitiAddettiPos(body))contenuto.versione_requisiti_addetti=1;
      if(supportaProdottiPos(body)) contenuto.versione_prodotti=1;
      if(supportaTecnicaPos(body)) contenuto.versione_tecnica=1;
      if(supportaFontiTecnichePos(body))contenuto.versione_fonti_tecniche=1;
      if(supportaMezziPos(body))contenuto.versione_mezzi=1;
      if(supportaDocumentiMezziPos(body))contenuto.versione_documenti_mezzi=1;
      // Older deployed editors cannot record the new explicit review checkbox.
      // Keep their existing rules until the coordinated frontend rollout.
      if(body.versione_client !== 2 && !body.sorgente_pos_id && !body.modello_id) contenuto.versione_controlli=1;
      let descrizioneRevisione = "Prima emissione";
      if(body.sorgente_pos_id && body.modello_id) return errorResponse("Scegli un solo punto di partenza",400,cors);
      if(body.sorgente_pos_id) {
        const sorgente=await caricaPos(db,companyId,String(body.sorgente_pos_id),cors);
        if(body.attesa_updated_at !== sorgente.updated_at) return errorResponse("Il POS sorgente è cambiato: ricarica prima di duplicare",409,cors);
        contenuto=applicaRiusoPos(contenuto,sorgente.contenuto);
        descrizioneRevisione=`Bozza da POS ${sorgente.id}, rev. ${sorgente.revisione ?? 0}; lavorazioni da verificare`;
      } else if(body.modello_id) {
        const {data:modello,error}=await db.from("pos_modelli_aziendali").select("id,nome,versione,contenuto").eq("company_id",companyId).eq("id",body.modello_id).eq("archiviato",false).maybeSingle();
        if(error) return errorResponse("Modello non leggibile",503,cors);
        if(!modello) return errorResponse("Modello non disponibile",404,cors);
        contenuto=applicaRiusoPos(contenuto,modello.contenuto);
        descrizioneRevisione=`Bozza da modello ${modello.nome}, v${modello.versione} (${modello.id}); lavorazioni da verificare`;
      }
      if(contenuto.versione_requisiti_addetti===1&&!supportaRequisitiAddettiPos(body))return errorResponse("Ricarica l’editor per i riscontri nominativi della propria impresa",409,cors);
    if(contenuto.versione_documenti_mezzi===1&&!supportaDocumentiMezziPos(body))return errorResponse("Ricarica l’editor per riutilizzare i documenti delle attrezzature",409,cors);
      if(contenuto.versione_mezzi===1&&!supportaMezziPos(body))return errorResponse("Ricarica l’editor per riutilizzare le attrezzature",409,cors);
    if(contenuto.versione_fonti_tecniche===1&&!supportaFontiTecnichePos(body))return errorResponse("Ricarica l’editor per riutilizzare le fonti tecniche",409,cors);
      if(contenuto.versione_tecnica===1&&!supportaTecnicaPos(body)) return errorResponse("Ricarica l’editor per riutilizzare le schede tecniche di questo POS",409,cors);
      if(body.sorgente_pos_id || body.modello_id) preparato.contesto.avvisi.push("Lavorazioni riprese da adattare e confermare. Dati di cantiere, persone e incarichi recuperati dalla commessa di destinazione; firme e allegati precedenti esclusi.");
      if (["affidataria", "affidataria_esecutrice", "esecutrice_subappalto"].includes(body.ruolo_impresa)) {
        contenuto.impresa.ruolo = body.ruolo_impresa;
      }
      const oggi = oggiRoma();
      const { data: doc, error } = await db
        .from("pos_documents")
        .insert({
          company_id: companyId,
          order_id: orderId,
          document_type: "pos",
          status: "bozza",
          version: 1,
          revisione: 0,
          revisioni: [{ rev: 0, data: oggi, descrizione: descrizioneRevisione }],
          contenuto,
          generated_by: "app",
          created_by: userId,
          valid_from: oggi,
          ...colonneRiassunto(contenuto),
        })
        .select("id")
        .single();
      if (error) return erroreDb("POS non salvato", error, cors);
      return jsonResponse({ ok: true, pos_id: doc.id, avvisi: preparato.contesto.avvisi, contesto: preparato.contesto }, 200, cors);
    }

    const posId = typeof body.pos_id === "string" ? body.pos_id : "";
    if (!posId) return errorResponse("pos_id obbligatorio", 400, cors);
    const pos = await caricaPos(db, companyId, posId, cors);

    if(azione === "anteprima_pdf") {
      const {data:ordine,error:ordineErr}=await db.from("orders").select("order_code").eq("company_id",companyId).eq("id",pos.order_id).maybeSingle();
      if(ordineErr) return errorResponse("Codice commessa non disponibile",503,cors);
      const {generaPdfPos}=await import("../_shared/posPdf.ts");
      const {datiDaSnapshotPos}=await import("../_shared/posEmissione.ts");
      const pdf=await generaPdfPos(datiDaSnapshotPos(pos,pos.revisione??0,ordine?.order_code||""),new Date().toISOString(),{anteprima:true});
      return new Response(new Uint8Array(pdf.bytes),{status:200,headers:{...cors,"Content-Type":"application/pdf","Content-Disposition":"inline; filename=POS-anteprima.pdf","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
    }
    if(azione === "emetti") {
      const q=db.from("pos_contenuti_archiviati").select("id,revisione,snapshot,fonte,acquisito_il").eq("company_id",companyId).eq("pos_id",posId);
      const {data:a,error:err}=await (body.snapshot_id?q.eq("id",body.snapshot_id):q.eq("revisione",pos.revisione??0)).maybeSingle();
      if(err||!a) return errorResponse("Contenuto approvato non disponibile",404,cors);
      const {data:ordine,error:ordineErr}=await db.from("orders").select("order_code").eq("company_id",companyId).eq("id",pos.order_id).maybeSingle();
      if(ordineErr) return errorResponse("Codice commessa non disponibile",503,cors);
      const {conservaEmissionePos,datiDaSnapshotPos}=await import("../_shared/posEmissione.ts");
      const r=await conservaEmissionePos(db,userId,{posId,companyId,attesoUpdatedAt:pos.updated_at,snapshotId:a.id,
        dati:datiDaSnapshotPos(a.snapshot,a.revisione,ordine?.order_code||""),nomeAutore:"Copia da contenuto archiviato",
        fonti:async()=>({tipo:"contenuto_archiviato",snapshot_id:a.id,fonte:a.fonte,acquisito_il:a.acquisito_il,
          nota:"Le fonti e i byte originari non sono ricostruiti. Il codice commessa è rilevato alla preparazione della copia."})});
      return jsonResponse({ok:true,emissione_id:r.id},200,cors);
    }
    if (azione === "dati_app") {
      const preparato = await preparaPosDaApp(db, companyId, String(pos.order_id));
      if(body.versione_client !== 2) preparato.contenuto.versione_controlli=1;
      if(supportaRequisitiAddettiPos(body))preparato.contenuto.versione_requisiti_addetti=1;
      if(supportaProdottiPos(body)) preparato.contenuto.versione_prodotti=1;
      if(supportaTecnicaPos(body)) preparato.contenuto.versione_tecnica=1;
      if(supportaFontiTecnichePos(body))preparato.contenuto.versione_fonti_tecniche=1;
      if(supportaMezziPos(body))preparato.contenuto.versione_mezzi=1;
      if(supportaDocumentiMezziPos(body))preparato.contenuto.versione_documenti_mezzi=1;
      return jsonResponse({ ok: true, contenuto: preparato.contenuto, contesto: preparato.contesto }, 200, cors);
    }

    if (azione === "lavorazioni_ai") {
      const proposta = await proponiLavorazioni(db, companyId, userId, pos, cors);
      return jsonResponse({ ok: true, ...proposta }, 200, cors);
    }

    // approva: i controlli sono gli stessi di prepara_emissione (controlliApprovazione).
    const verificato = controlliApprovazione(pos, body);
    if (verificato.tipo === "risposta") return jsonResponse(verificato.corpo, verificato.status, cors);
    const contenuto = verificato.contenuto;
    // Il nome di chi approva resta nel PDF immutabile e in approvato_da_nome: se il profilo non si legge, si riprova.
    const { data: profilo, error: profiloError } = await db.from("profiles").select("first_name, last_name, email").eq("id", userId).maybeSingle();
    if (profiloError) return errorResponse("Profilo di chi approva non leggibile: riprova tra poco", 503, cors);
    const nome = [profilo?.first_name, profilo?.last_name].filter(Boolean).join(" ") || profilo?.email || "utente";
    if(body.versione_client===2) {
      const {conservaEmissionePos}=await import("../_shared/posEmissione.ts");
      const fonti=await preparaPosDaApp(db,companyId,String(pos.order_id));
      const rilevateIl=new Date().toISOString();
      const r=await conservaEmissionePos(db,userId,{posId,companyId,attesoUpdatedAt:pos.updated_at,nomeAutore:nome,
        dati:{contenuto,stato:"approvato",revisione:pos.revisione??0,revisioni:Array.isArray(pos.revisioni)?pos.revisioni:[],codiceCommessa:String(fonti.order.order_code||"")},
        fonti:async()=>{
          return {tipo:"dati_app_rilevati_durante_preparazione",rilevati_il:rilevateIl,commessa:fonti.order,contenuto_rilevato:fonti.contenuto,contesto:fonti.contesto,riferimenti:fonti.fonti,
            nota:"Dati delle fonti rilevati durante la preparazione, distinti dai contenuti adattati e approvati dall’utente."};
        }});
      return jsonResponse({ok:true,approvato_da_nome:nome,emissione_id:r.id},200,cors);
    }
    let approvazione = db
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
    approvazione = pos.updated_at ? approvazione.eq("updated_at",pos.updated_at) : approvazione.is("updated_at",null);
    const {data:approvato,error}=await approvazione.select('id').maybeSingle();
    if (error) return erroreDb("POS non approvato", error, cors);
    if(!approvato) return errorResponse("Il POS è cambiato durante la verifica. Ricarica e ricontrolla la bozza.",409,cors);
    return jsonResponse({ ok: true, approvato_da_nome: nome }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    if(err instanceof Error && "status" in err && typeof err.status === "number") return errorResponse(err.message,err.status,cors);
    return errorResponse(`Errore interno: ${err instanceof Error ? err.message : String(err)}`, 500, cors);
  }
});
