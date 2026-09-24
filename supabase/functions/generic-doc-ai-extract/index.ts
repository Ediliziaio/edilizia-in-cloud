/**
 * generic-doc-ai-extract — Estrattore "universale" per tipi documento NON
 * coperti da edge function dedicata.
 *
 * Riceve doc_type (es. "verbale_collaudo", "polizza_assicurativa",
 * "documento_pa", "scheda_tecnica", "documento_generico", "foto_generale") +
 * il file, e produce un JSON strutturato con campi specifici per quel tipo +
 * sintesi narrativa.
 *
 * Una sola edge function = manutenibile + un solo prompt da far evolvere.
 *
 * Input:
 *   { storage_bucket, storage_path, file_name, mime_type, company_id, doc_type }
 *
 * Output:
 *   { success, doc_type, extracted: {...}, summary: "...", ai_meta: {...} }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";

// Schema specifico per tipo doc — guida il prompt a produrre JSON tipizzato
const SCHEMA_BY_TYPE: Record<string, string> = {
  verbale_collaudo: `{
  "opera_collaudata": "string",
  "committente": "string",
  "impresa_esecutrice": "string",
  "data_collaudo": "YYYY-MM-DD",
  "data_inizio_lavori": "YYYY-MM-DD o null",
  "data_fine_lavori": "YYYY-MM-DD o null",
  "importo_lavori_eur": numero o null,
  "esito": "positivo|positivo_con_riserve|negativo|provvisorio",
  "riserve": ["lista riserve testuali"],
  "prescrizioni": ["lista prescrizioni"],
  "collaudatore": { "nome": "string", "ruolo": "string", "albo": "string o null" },
  "direttore_lavori": "string o null",
  "responsabile_procedimento": "string o null",
  "documenti_allegati": ["lista"],
  "note": "string"
}`,
  polizza_assicurativa: `{
  "compagnia": "string",
  "numero_polizza": "string",
  "tipo_copertura": "RC professionale|RC opere|fideiussione|all-risks cantiere|decennale postuma|...",
  "contraente": { "ragione_sociale": "string", "partita_iva": "string o null" },
  "assicurato": "string",
  "beneficiario": "string o null",
  "decorrenza": "YYYY-MM-DD",
  "scadenza": "YYYY-MM-DD",
  "rinnovo_tacito": boolean,
  "massimale_eur": numero,
  "franchigia_eur": numero o null,
  "premio_annuo_eur": numero o null,
  "frazionamento": "annuale|semestrale|trimestrale|null",
  "rischi_coperti": ["lista"],
  "esclusioni_principali": ["lista"]
}`,
  // Mezzi e attrezzature (24/09/2026): i documenti del furgone, per compilare
  // da soli scadenze e dati del mezzo.
  polizza_veicolo: `{
  "compagnia": "string",
  "numero_polizza": "string",
  "targa": "string senza spazi o null",
  "veicolo": "marca e modello del veicolo assicurato o null",
  "decorrenza": "YYYY-MM-DD",
  "scadenza": "YYYY-MM-DD: fine della copertura (NON la data di emissione, NON la scadenza di una rata)",
  "premio_annuo_eur": "numero: il premio TOTALE annuo lordo, o null",
  "frazionamento": "annuale|semestrale|trimestrale|null",
  "coperture": ["RCA, furto, incendio, kasko, cristalli, ... lista"],
  "contraente": "string o null"
}`,
  libretto_circolazione: `{
  "targa": "string senza spazi (campo A)",
  "data_prima_immatricolazione": "YYYY-MM-DD (campo B) o null",
  "marca": "string (campo D.1) o null",
  "modello": "string: tipo e denominazione commerciale (campi D.2/D.3) o null",
  "telaio": "numero di identificazione del veicolo (campo E) o null",
  "intestatario": "string (campo C.2 / C.3) o null",
  "alimentazione": "benzina|diesel|metano|gpl|elettrico|ibrido|null (campo P.3)",
  "massa_complessiva_kg": "numero (campo F.2) o null",
  "categoria": "N1|N2|N3|M1|... (campo J) o null",
  "ultima_revisione": "YYYY-MM-DD: data dell'ultima revisione timbrata, o null",
  "prossima_revisione": "YYYY-MM-DD se indicata, o null"
}`,
  documento_pa: `{
  "tipo_documento": "SCIA|CILA|PdC|DURC|certificato urbanistico|autorizzazione paesaggistica|abitabilita|altro",
  "numero_protocollo": "string",
  "ente_emittente": "string",
  "comune": "string o null",
  "data_rilascio": "YYYY-MM-DD",
  "scadenza_validita": "YYYY-MM-DD o null",
  "intestatario": "string",
  "oggetto": "string",
  "ubicazione_intervento": "string o null",
  "dati_catastali": { "foglio": "string", "particelle": "string", "subalterni": "string" },
  "prescrizioni": ["lista"],
  "allegati": ["lista"]
}`,
  scheda_tecnica: `{
  "prodotto": "string",
  "fornitore": "string",
  "produttore": "string o null",
  "codice_articolo": "string o null",
  "categoria_merceologica": "string",
  "descrizione_uso": "string",
  "caratteristiche_tecniche": { "chiave": "valore" },
  "certificazioni": ["CE|ISO 9001|EPD|...lista"],
  "classe_resistenza": "string o null",
  "anno_emissione": numero o null,
  "scheda_sicurezza_disponibile": boolean,
  "note_posa": "string o null"
}`,
  documento_generico: `{
  "titolo": "string",
  "tipo": "verbale|relazione|lettera|email|FAQ|altro",
  "autore": "string o null",
  "data": "YYYY-MM-DD o null",
  "destinatario": "string o null",
  "oggetto": "string",
  "punti_chiave": ["3-5 bullet sintesi"],
  "azioni_richieste": ["lista o vuoto"],
  "scadenze": ["YYYY-MM-DD lista"],
  "soggetti_citati": ["lista"]
}`,
  foto_generale: `{
  "soggetto_principale": "string",
  "categoria": "prodotto|materiale|persone|luogo|natura|astratto|altro",
  "descrizione": "string max 200 char",
  "elementi_visibili": ["lista oggetti rilevanti"],
  "presenza_persone": boolean,
  "ambiente": "interno|esterno|null",
  "qualita_immagine": "buona|media|scarsa",
  "uso_consigliato": "string"
}`,
  contratto_commessa: `{
  "cliente": {
    "nome_completo": "ragione sociale OPPURE nome e cognome del committente/cliente",
    "email": "string o null",
    "telefono": "string o null",
    "indirizzo": "string o null",
    "codice_fiscale": "string o null",
    "partita_iva": "string o null"
  },
  "descrizione_lavori": "sintesi di cio' che viene EFFETTIVAMENTE fornito secondo le voci/il modulo d'ordine (es. 'Fornitura e posa di 7 serramenti PVC con cassonetti'). NON copiare la clausola-oggetto generica delle condizioni di contratto: frasi tipo 'vendita di serramenti, infissi, porte, tapparelle, zanzariere' elencano cio' che il fornitore POTREBBE vendere, non cio' che questo ordine contiene. Nomina solo le tipologie presenti tra le voci",
  "indirizzo_cantiere": "string o null",
  "importo_totale_eur": "numero: l'imponibile FINALE del documento (IVA esclusa) COMPRENSIVO di sconti gia' applicati e di imballaggio/trasporto — cioe' l'ultimo totale prima dell'IVA, non un subtotale intermedio",
  "iva_pct": numero (es. 22, 10, 4) o null,
  "importo_totale_ivato_eur": numero totale con IVA o null,
  "voci": [{ "descrizione": "string", "quantita": numero, "prezzo_unitario_eur": numero }],
  "_regole_voci": "ESAUSTIVITA' OBBLIGATORIA: estrai OGNI POSIZIONE del modulo d'ordine/abaco, anche su documenti lunghi — mai riassumere, mai accorpare posizioni diverse in una. La voce e' la POSIZIONE COMMERCIALE col SUO prezzo (es. 'Porta 1', 'Finestra 2', 'PF2A 1270x2520'): i COMPONENTI elencati dentro una posizione (vetri, pannelli, ferramenta, maniglie, rinforzi, profili della scheda tecnica) NON sono voci — non estrarli come righe. Mantieni nella descrizione modello e dimensioni LxH del SERRAMENTO se presenti (NON quelle dei singoli vetri). Usa il campo quantita invece di duplicare righe identiche (es. 'Finestra 8 x3' = quantita 3 col prezzo UNITARIO). NON creare righe di totale/subtotale. Accessori venduti a parte con prezzo proprio (coprifili, estensioni, kit) SONO voci. Se il prezzo di una posizione non e' leggibile metti 0 e aggiungi un warning. ATTENZIONE alle offerte con DUE colonne di prezzo ('Prezzo' e 'Totale'): prezzo_unitario_eur e' il prezzo di UN pezzo (colonna Prezzo), MAI il totale riga — controllo per OGNI voce: quantita × prezzo_unitario deve dare il totale riga stampato; se usassi il totale come unitario una voce con quantita 3 varrebbe il triplo. Alla fine verifica: somma(quantita*prezzo) deve avvicinarsi al subtotale merce del documento — se non torna, aggiungi warning con i due numeri",
  "sconto_globale_pct": "numero o null — sconto percentuale applicato sul totale (es. 'Sconto: 15,00 %')",
  "altri_costi": [{ "descrizione": "string (es. Imballaggio / Trasporto / Oneri)", "importo_eur": numero }],
  "natura_documento": "'contratto_cliente' | 'offerta_fornitore' | 'copia_commissione' — offerta_fornitore quando il documento e' l'offerta di un PRODUTTORE/fornitore verso un'impresa rivenditrice (listino tecnico di produzione, sconto rivenditore, trasporto): in quel caso il 'cliente' e' l'impresa destinataria",
  "valuta": "codice ISO della valuta degli importi (EUR, CHF, RON, USD...): leggila dal documento, NON dedurla — se non e' indicata metti null",
  "fornitore_emittente": "nome dell'azienda che EMETTE il documento (intestazione, logo, pie' di pagina, condizioni): per un'offerta_fornitore e' il produttore/fornitore — null se non leggibile",
  "data_documento": "YYYY-MM-DD o null — la data di emissione stampata sul documento",
  "consegna_giorni": "numero o null — tempi di consegna in GIORNI se dichiarati (es. 'consegna 30-35 giorni lavorativi' → 35; 'entro 6 settimane' → 42). Solo se il documento li dice",
  "validita_offerta_giorni": "numero o null — per quanti giorni l'offerta resta valida (es. 'questa offerta e' valida per 15 giorni' → 15)",
  "_regole_extra": "NON attribuire prestazioni assenti: se il documento dice 'Senza Montaggio' NON scrivere 'e posa' nella descrizione lavori. Sconto globale, imballaggio e trasporto vanno nei campi dedicati (sconto_globale_pct, altri_costi), NON tra le voci e NON ignorati",
  "modalita_pagamento": "string (es. Bonifico bancario / Assegno / Finanziamento) o null",
  "fasi_pagamento": [{ "descrizione": "string es. Acconto alla firma / SAL / Saldo", "percentuale": numero o null, "importo_eur": numero o null }],
  "data_inizio_lavori": "YYYY-MM-DD o null",
  "data_fine_lavori": "YYYY-MM-DD o null"
}`,
};

const PROMPT_TEMPLATE = (docType: string, schema: string) => `Sei un assistente esperto in documenti tecnici, amministrativi e legali per l'edilizia italiana.
Analizza il contenuto allegato (PDF o immagine) e estrai i dati strutturati per un documento di tipo "${docType}".

REGOLE:
1. Numeri italiani: punto = migliaia, virgola = decimali. "1.234,56" → 1234.56
2. Date sempre in ISO YYYY-MM-DD
3. NON inventare. Se manca, ritorna null o lista vuota.
4. Per le immagini (foto_generale): descrivi solo ciò che VEDI realmente.
5. Aggiungi SEMPRE in fondo:
   - "summary": riassunto narrativo italiano max 280 char
   - "confidence": 0.0-1.0 sulla qualità complessiva dell'estrazione
   - "warnings": [] eventuali campi mancanti / dubbi

SCHEMA STRUTTURA (rispetta nomi e tipi):
${schema}

Restituisci SOLO JSON valido (no markdown), formato:
{
  ...campi sopra...,
  "summary": "...",
  "confidence": 0.X,
  "warnings": []
}`;

async function bufferToBase64(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("POST only", 405, cors);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, cors);
    const body = await req.json();
    const { storage_bucket, storage_path, file_name, mime_type, company_id, doc_type, user_hint } = body as {
      storage_bucket?: string;
      storage_path?: string;
      file_name?: string;
      mime_type?: string;
      company_id?: string;
      doc_type?: string;
      /** Indicazioni scritte dall'utente per guidare l'estrazione (es. "l'IVA
       *  è al 10%", "è un'offerta fornitore, il cliente finale è Rossi"). */
      user_hint?: string;
    };
    const hintPulito = typeof user_hint === "string" ? user_hint.trim().slice(0, 600) : "";
    if (!storage_bucket || !storage_path || !file_name || !company_id || !doc_type) {
      return errorResponse("storage_bucket, storage_path, file_name, company_id, doc_type required", 400, cors);
    }
    await requireCompanyAccess(supabaseAdmin, userId, company_id, cors);

    const schema = SCHEMA_BY_TYPE[doc_type] ?? SCHEMA_BY_TYPE.documento_generico;
    const systemPrompt = PROMPT_TEMPLATE(doc_type, schema);

    // Fino al 24/09/2026 il file si scaricava sempre con la chiave di servizio,
    // controllando solo che l'utente fosse dell'azienda indicata: bastava
    // passare il percorso di un file di un'altra azienda per farselo leggere.
    // Un file nella cartella dell'azienda ({company_id}/...) si scarica come
    // prima; qualunque altro percorso con i permessi di chi chiama, così chi
    // non potrebbe aprirlo non lo apre nemmeno passando da qui.
    const nellaCartellaDellAzienda = storage_path.startsWith(`${company_id}/`) && !storage_path.includes("..");
    const scaricatore = nellaCartellaDellAzienda
      ? supabaseAdmin
      : createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
          global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
          auth: { persistSession: false },
        });
    const { data: file, error: dlErr } = await scaricatore.storage
      .from(storage_bucket)
      .download(storage_path);
    if (dlErr || !file) {
      return nellaCartellaDellAzienda
        ? errorResponse(`Download fallito: ${dlErr?.message ?? "?"}`, 500, cors)
        : errorResponse("File non accessibile", 403, cors);
    }

    const buffer = await (file as Blob).arrayBuffer();
    if (buffer.byteLength > 18 * 1024 * 1024) {
      return errorResponse("Documento troppo grande (max 18MB)", 413, cors);
    }
    const base64 = await bufferToBase64(buffer);
    const isImage = (mime_type ?? "").startsWith("image/");
    const dataUrl = `data:${mime_type ?? (isImage ? "image/jpeg" : "application/pdf")};base64,${base64}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userContent: any[] = [
      {
        type: "text",
        text:
          `Estrai i dati di questo documento (${doc_type}). Nome file: "${file_name}".` +
          (hintPulito
            ? `\n\nINDICAZIONI DELL'UTENTE (chi carica conosce il documento: seguile, hanno priorita' sulle tue deduzioni):\n${hintPulito}`
            : ""),
      },
    ];
    if (isImage) {
      userContent.push({ type: "image_url", image_url: { url: dataUrl } });
    } else {
      userContent.push({ type: "file", file: { filename: file_name, file_data: dataUrl } });
    }

    const t0 = Date.now();
    const idempotencyKey = await buildStableAiIdempotencyKey("generic_doc_ai_extract", [
      company_id,
      userId,
      storage_bucket,
      storage_path,
      file_name,
      mime_type ?? null,
      doc_type,
      // Note diverse → estrazione diversa: l'hint entra nella chiave.
      hintPulito || null,
    ]);
    const aiResult = await aiRouterComplete({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabaseAdmin as any,
      taskKey: "pdf_vision_extract",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      // Contratti/computi lunghi: le voci sono l'output più costoso in token e
      // un tetto basso le TRONCA in silenzio (JSON monco o liste dimezzate).
      params: { temperature: 0.0, max_tokens: doc_type === "contratto_commessa" ? 12000 : 6000 },
      responseFormat: { type: "json_object" },
      companyId: company_id,
      userId,
      idempotencyKey,
      // Ricaricare due volte lo stesso documento (succede: rinvii, doppi
      // click, ritentativi dopo un errore a valle) non deve ripagare
      // l'estrazione. La chiave e' l'identita' vera del file, non i messaggi:
      // dentro c'e' il PDF in base64, hasharlo tutto a ogni chiamata sarebbe
      // uno spreco e basta.
      cacheKey: idempotencyKey,
      cacheTtlDays: 90,
    });
    const elapsedMs = Date.now() - t0;

    let extracted: Record<string, unknown> = {};
    try {
      const raw = aiResult.content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      extracted = JSON.parse(raw);
    } catch {
      // Recupero: su risposte lunghe alcuni modelli aggiungono testo attorno al
      // JSON — si tenta il blocco { … } più esterno prima di arrendersi.
      const raw = aiResult.content ?? "";
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          extracted = JSON.parse(raw.slice(start, end + 1));
        } catch {
          return errorResponse(`AI returned invalid JSON: ${raw.slice(0, 200)}`, 502, cors);
        }
      } else {
        return errorResponse(`AI returned invalid JSON: ${raw.slice(0, 200)}`, 502, cors);
      }
    }

    const summary = (extracted.summary as string | undefined) ?? "";
    const confidence = Number(extracted.confidence) || 0;
    const warnings = (extracted.warnings as string[] | undefined) ?? [];

    return jsonResponse({
      success: true,
      doc_type,
      extracted,
      summary,
      confidence,
      warnings,
      ai_meta: {
        model_used: aiResult.modelUsed,
        tokens: aiResult.totalTokens,
        cost_eur: aiResult.costRealEur,
        cost_billed_eur: aiResult.costBilledEur,
        elapsed_ms: elapsedMs,
      },
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(err instanceof Error ? err.message : String(err), 500, getCorsHeaders(req));
  }
});
