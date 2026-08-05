/**
 * Edge Function: ai-brain-seed-universal
 *
 * Indicizza nel Brain UNIVERSALE un corpus iniziale di conoscenze sul business
 * edile italiano, normative, vendita, fiscale. Pensato per essere eseguito
 * UNA volta dal SuperAdmin.
 *
 * Categorie:
 *   - 01-normativa-edilizia
 *   - 02-finanza-cashflow
 *   - 03-controllo-gestione
 *   - 04-vendita-consulenziale
 *   - 05-fiscale-compliance
 *   - 06-hr-edile
 *   - 07-guide-redazionali (76 guide + filiere + esempi, da corpusRedazionale.ts)
 *
 * Permission: SOLO super_admin
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { cronSecretValido } from "../_shared/cronAuth.ts";
import { generateEmbeddingsBatch, contentHash } from "../_shared/brainEmbed.ts";
import { estimateEmbeddingUsage, logPlatformAiCall } from "../_shared/directAiLedger.ts";
import { CORPUS_REDAZIONALE } from "./corpusRedazionale.ts";

interface UniversalDoc {
  category: string;
  title: string;
  content: string;
  source_type?: string;
}

const CORPUS: UniversalDoc[] = [
  // ─── NORMATIVA SICUREZZA ─────────────────────────────────────────────
  {
    category: "01-normativa-edilizia",
    title: "D.Lgs 81/08 — Testo Unico Sicurezza Lavoro",
    source_type: "law",
    content: `D.Lgs 81/2008 — Testo Unico per la Sicurezza sul Lavoro

OBBLIGHI DATORE DI LAVORO IMPRESA EDILE:
1. Valutazione rischi (DVR) aggiornata e firmata
2. Designazione RSPP (Responsabile Servizio Prevenzione Protezione)
3. Designazione medico competente
4. Formazione lavoratori: generale 4h + specifica per settore (8/12/16h in base rischio)
5. Sorveglianza sanitaria
6. Fornitura DPI (Dispositivi Protezione Individuale) certificati
7. POS (Piano Operativo Sicurezza) per ogni cantiere
8. PIMUS (Piano Montaggio Uso Smontaggio ponteggi) se ponteggi >2m

SCADENZE FORMAZIONE EDILE:
- Generale: 4 ore una tantum
- Specifica rischio alto: 16 ore + 6 ore aggiornamento ogni 5 anni
- Preposti: 8 ore + 6h aggiornamento 5 anni
- Dirigenti: 16 ore + 6h aggiornamento 5 anni
- RSPP: variabile per macrosettore + 40h aggiornamento 5 anni

DURC (Documento Unico Regolarità Contributiva):
- Obbligatorio per appalti pubblici e privati >5.000€
- Validità 120 giorni dalla data di emissione
- Verifica online INAIL/INPS/Cassa Edile

SANZIONI:
- DVR mancante: arresto 3-6 mesi o ammenda 2.500-6.400€
- DPI non forniti: arresto fino 4 mesi o 1.200-5.200€
- Formazione mancante: 1.474-6.400€
- Lavoratore senza nomina/formazione: sospensione attività`,
  },
  {
    category: "01-normativa-edilizia",
    title: "Sicurezza ponteggi e lavori in quota",
    source_type: "law",
    content: `LAVORI IN QUOTA — D.Lgs 81/08 Titolo IV

DEFINIZIONE: lavori >2m da piano stabile.

PRECEDENZA MISURE:
1. Sostituzione (eliminare necessità lavoro in quota)
2. Protezione collettiva (parapetti, reti)
3. Protezione individuale (imbracature, linee vita)

PONTEGGI:
- Solo personale formato (formazione 28h + 4h ogni 4 anni)
- Verifica giornaliera prima dell'inizio lavori
- PIMUS firmato da datore + RSPP + responsabile montaggio
- Distanza max parete 30 cm
- Larghezza min 60 cm su livelli alti
- Tavola fermapiede min 15 cm
- Mancorrenti a 1m e a 0,45m

LINEE VITA:
- Certificazione UNI 11578 obbligatoria
- Verifica annuale strutturale
- Cartellonistica visibile

DPI ANTICADUTA:
- Imbracature certificate UNI EN 361
- Cordini con assorbitore di energia
- Verifica mensile da utente, annuale da tecnico abilitato`,
  },

  // ─── NORMATIVA FISCALE ────────────────────────────────────────────────
  {
    category: "05-fiscale-compliance",
    title: "IVA Edilizia — Reverse Charge e Aliquote",
    source_type: "law",
    content: `IVA NEL SETTORE EDILE ITALIANO

REVERSE CHARGE (DPR 633/72 art. 17 c.6):
Si applica nelle seguenti operazioni B2B:
- Subappalti con prestazione servizi a impresa appaltatrice
- Pulizia, demolizione, installazione impianti, completamento edifici
- Cessione fabbricati strumentali a soggetti IVA

CONSEGUENZE: il fornitore emette fattura SENZA IVA con dicitura "operazione soggetta a reverse charge ex art.17 c.6 DPR 633/72". Il cliente integra l'IVA nel suo registro acquisti e vendite (autoliquidazione).

ALIQUOTE IVA EDILIZIA:
- 4%: lavori prima casa, costruzione/ristrutturazione abitazioni non di lusso (categorie A2-A11 escl. A1, A8, A9), interventi di edilizia sociale
- 10%: manutenzione ordinaria/straordinaria su immobili residenziali, beni significativi entro determinato valore
- 22%: tutto il resto (es. manutenzione su uffici, capannoni)

BENI SIGNIFICATIVI (caldaie, infissi, sanitari, ecc.):
- IVA 10% sul valore della prestazione
- IVA 22% sul valore del bene che eccede la prestazione
- Calcolo: (Lavori - Beni) × 10% + min(Beni, Lavori-Beni) × 10% + max(Beni - (Lavori-Beni), 0) × 22%

SPLIT PAYMENT (PA):
- Per fatture verso PA, il committente versa IVA direttamente all'Erario
- Fornitore emette fattura con esposizione IVA + nota "scissione pagamenti"`,
  },
  {
    category: "05-fiscale-compliance",
    title: "Bonus Fiscali Edilizia 2026",
    source_type: "law",
    content: `BONUS FISCALI EDILIZIA — RIEPILOGO 2026

BONUS RISTRUTTURAZIONE 50% (Art. 16-bis TUIR):
- Detrazione 50% in 10 anni (dal 2025-2027 al 36% per seconde case, 50% prima casa)
- Tetto: 96.000€ per unità immobiliare
- Lavori ammessi: manutenzione straordinaria, ristrutturazione, restauro, recupero
- Pagamento: bonifico parlante con causale e CF beneficiario
- Non più sconto in fattura/cessione credito (eccetto deroghe specifiche)

ECOBONUS:
- 50% (caldaie classe A, finestre/infissi standard)
- 65% (caldaie a condensazione classe A+, schermature solari, pompe calore)
- Tetto: variabile per intervento (60-100k€)
- Detrazione 10 anni

SISMABONUS:
- 50%-85% in base a riduzione classe sismica (1 o 2 classi)
- Tetto: 96.000€
- Immobili in zone sismiche 1-2-3
- Necessaria asseverazione classe sismica

BONUS MOBILI ED ELETTRODOMESTICI:
- 50% su acquisti collegati a ristrutturazione
- Tetto 5.000€ (2025) → in calo

SUPERBONUS (110% / 90% / 70% / 65%):
- Solo per casi residui (cantieri pre-esistenti con SAL completati)
- Verificare normativa vigente: legge di bilancio aggiorna ogni anno

DOCUMENTI OBBLIGATORI:
- Comunicazione ENEA per efficienza energetica
- Asseverazione tecnica per sismabonus
- Visto conformità + asseverazione per sconto/cessione (dove applicabile)
- Bonifico parlante con codice fiscale beneficiario

ATTENZIONE: per sconto in fattura e cessione credito le regole sono molto restrittive dal 2024. Verificare ogni progetto con commercialista.`,
  },

  // ─── BUSINESS FINANZA ─────────────────────────────────────────────────
  {
    category: "02-finanza-cashflow",
    title: "Cashflow Management Impresa Edile",
    source_type: "knowledge",
    content: `CASHFLOW IMPRESA EDILE — PRINCIPI

REGOLE D'ORO:
1. Liquidità minima = 2-3 mesi costi fissi (operai + sede + assicurazioni)
2. DSO (Days Sales Outstanding) target: <60gg per privati, <90gg per PA
3. DPO (Days Payable Outstanding): max 60gg per non rovinare relazioni fornitori
4. Working Capital positivo: crediti+magazzino - debiti commerciali

STRUTTURA INCASSI EDILIZIA:
- Acconto: 20-30% all'ordine (cassa anticipata)
- Acconto 2 / SAL intermedio: 30-40% a metà lavori
- Saldo: 30-50% a fine lavori (rischio principale)
- Finanziamento bancario cliente: erogazione vincolata avanzamento

ANTI-CRISI LIQUIDITÀ (segnali precoci):
- DSO sopra 75gg → rischio
- Saldo banca <30gg costi fissi → emergenza
- Più di 3 rate scadute >30gg → bandiera rossa
- Crescita ricavi >+30% senza crescita liquidità → trappola

KPI CHIAVE:
- Margine commessa: target 15-25%
- Rotazione magazzino: 4-6 cicli/anno
- Indebitamento: D/E ratio max 1.5
- ROE: target >10% annuo

COSA FARE QUANDO SCARSEGGIA LIQUIDITÀ:
1. Sospendere nuove assunzioni
2. Sollecitare crediti scaduti (telefono > email)
3. Negoziare dilazioni con fornitori
4. Linee di fido bancarie (anticipo fatture)
5. Factoring fatture come ultima risorsa (costoso)
6. Mai indebitarsi a M/L termine per tappare buchi correnti`,
  },
  {
    category: "02-finanza-cashflow",
    title: "Margine Commessa e Controllo Costi",
    source_type: "knowledge",
    content: `MARGINE COMMESSA — CONTROLLO

FORMULA MARGINE LORDO COMMESSA:
Margine Lordo = (Ricavo Commessa - Costi Diretti) / Ricavo Commessa × 100

COSTI DIRETTI EDILIZIA:
- Manodopera diretta (ore × costo orario incluso INAIL/INPS)
- Materiali (con sconti fornitore reali, non lista)
- Subappalti
- Trasporti specifici cantiere
- Noleggio attrezzature dedicate
- Sicurezza specifica cantiere (DPI extra, ponteggi)

COSTI INDIRETTI (overhead, ~12-18% del fatturato):
- Sede aziendale, utenze
- Personale ufficio (admin, tecnici non in cantiere)
- Furgoni, manutenzione attrezzi
- Assicurazioni generali
- Marketing, commerciali

TARGET MARGINI EDILIZIA ITALIA:
- Lordo per commessa: 18-30% (eccellente >25%)
- Operativo (EBITDA): 10-15%
- Netto: 5-10%

CAMPANELLI ALLARME:
- Margine consuntivo <5% sotto preventivo → indagare
- Sforamento ore manodopera >10% → revisione preventivi futuri
- Sforamento materiali >7% → controllo acquisti (sprechi, furti)
- Subappalti più cari del previsto → rinegoziare

SAL (STATO AVANZAMENTO LAVORI):
- Strumento per fatturare con avanzamento
- % completamento × valore commessa - già fatturato = SAL del periodo
- Necessari: documentazione fotografica, firma cliente/DL

VARIANTI E EXTRA:
- Sempre formalizzare prima dell'esecuzione
- Preventivo extra firmato dal cliente
- Guai se eseguito senza approvazione: rischio non incasso`,
  },

  // ─── BUSINESS VENDITA ─────────────────────────────────────────────────
  {
    category: "04-vendita-consulenziale",
    title: "Vendita Consulenziale Edile",
    source_type: "knowledge",
    content: `VENDITA CONSULENZIALE EDILE

FRAMEWORK SPIN SELLING:
S - SITUATION: capire la situazione attuale del cliente (casa, esigenze, budget)
P - PROBLEM: scoprire i problemi (umidità, vecchio impianto, bolletta alta)
I - IMPLICATION: amplificare conseguenze (aumento bollette, deprezzamento immobile)
N - NEED-PAYOFF: il cliente verbalizza i benefici della soluzione

DOMANDE CHIAVE PRIMO INCONTRO:
1. "Come è arrivato a contattarci?" (capire la fonte)
2. "Cosa vorrebbe ottenere con questi lavori?" (benefici, non features)
3. "Quando vorrebbe iniziare?" (urgenza)
4. "Ha già confrontato altri preventivi?" (concorrenza)
5. "C'è una persona che decide con lei?" (decision unit)
6. "Qual è il budget indicativo?" (qualifica BANT)

QUALIFICA BANT:
- Budget: ha i soldi/finanziamento?
- Authority: chi decide?
- Need: ha bisogno reale?
- Timing: quando decide?

OBIEZIONI COMUNI E RISPOSTE:
- "È troppo caro" → "Rispetto a cosa? Di solito i clienti che scelgono noi fanno questo confronto..."
- "Devo pensarci" → "Cosa la trattiene specificamente? Vediamo insieme..."
- "Ho un altro preventivo più basso" → "Le posso mostrare cosa NON include? Perché spesso c'è un motivo..."
- "Non ho urgenza" → "Capisco. Considera che ogni mese che passa la sua bolletta..."

CHIUSURA:
- Riepilogo benefici prima
- Domanda diretta: "Posso preparare il contratto?"
- Alternative close: "Preferisce iniziare a marzo o aprile?"
- Mai pressione: il cliente sente quando lo stai forzando

FOLLOW-UP:
- 24h dopo presentazione preventivo: prima call
- 7gg: secondo touch (case study, recensione)
- 14gg: terzo touch (limited offer, esempio)
- Oltre: cliente "freddo", priorizza altri lead`,
  },

  // ─── BUSINESS OPERATIONS ──────────────────────────────────────────────
  {
    category: "03-controllo-gestione",
    title: "Gestione Cantiere — Best Practice",
    source_type: "knowledge",
    content: `GESTIONE CANTIERE EDILE — OPERATIVO

PRIMO GIORNO CANTIERE:
1. Cartello cantiere (CIL/CILA/SCIA estremi)
2. Recinzione e cartellonistica sicurezza
3. Riunione preliminare con squadra: piano lavori, tempi, sicurezza
4. Verifica accessi materiali e mezzi
5. Foto stato pre-lavori (tutela legale)
6. Comunicazione vicini se rumori/disagi

QUOTIDIANO:
- 8:00 briefing capocantiere con squadra (10 min)
- Diario cantiere aggiornato giornalmente: ore, attività, materiali, anomalie
- Foto avanzamento (almeno 3 al giorno)
- Aggiornamento commessa in software gestionale
- Verifica DPI e sicurezza

MILESTONE LAVORI:
- Inizio lavori: foto, comunicazione cliente
- Fine demolizioni: ispezione, autorizzazione fase successiva
- Fine impianti grezzi: collaudo, foto
- Fine intonaci/cartongessi: pulizia, foto pre-finiture
- Fine lavori: verifica completa, pulizia finale, consegna chiavi

COMUNICAZIONE CLIENTE:
- Update settimanale (anche WhatsApp con foto)
- Avvisare 48h prima di lavori rumorosi/invasivi
- Mai sparire: anche se nulla cambia, mandare aggiornamento "tutto in linea"
- Documentare extra/varianti SUBITO con preventivo extra

GESTIONE ANOMALIE:
- Sopralluogo immediato del PM
- Documentazione fotografica dell'anomalia
- Stop lavori se sicurezza compromessa
- Comunicazione cliente entro 4h
- Soluzione proposta entro 24h

CHIUSURA CANTIERE:
- Pulizia accurata
- Smontaggio ponteggi/recinzioni
- Verifica documenti: dichiarazioni conformità impianti, fine lavori
- Consegna ufficiale con verbale firmato
- Consegna manuali, garanzie, bonifico finale
- Domanda recensione/referenza dopo 30gg`,
  },

  // ─── HR CCNL ──────────────────────────────────────────────────────────
  {
    category: "06-hr-edile",
    title: "CCNL Edilizia Industria — Riepilogo",
    source_type: "knowledge",
    content: `CCNL EDILIZIA INDUSTRIA — PUNTI CHIAVE

LIVELLI INQUADRAMENTO:
- 1° livello: Operaio comune (€7,50-8,50 /h base)
- 2° livello: Operaio qualificato (€8,50-9,50 /h)
- 3° livello: Operaio specializzato (€9,50-11 /h)
- 4° livello: Operaio specializzato di provata capacità (€11-12,50 /h)
- 5° livello: Quadro tecnico
- 6° livello: Capo-squadra, capocantiere
- 7° livello: Quadro intermedio (responsabile commessa)

ORARIO LAVORO:
- 40 ore settimanali ordinarie
- Maggiorazioni: straordinario diurno +35%, notturno +50%, festivo +50%, festivo notturno +75%
- Riposo 24h consecutive/settimana (di solito domenica)

FERIE:
- 24 giorni lavorativi/anno (4 settimane)
- Maturazione mensile
- Indennità sostitutiva NON ammessa (devono essere godute)

PERMESSI:
- 64 ore/anno ROL (Riduzione Orario Lavoro)
- Permessi studio (150 ore/3 anni)
- Permessi disabili (L.104 - 3 giorni/mese o 2 ore/giorno)

INDENNITÀ TIPICHE:
- Indennità trasporto cantiere (€/km variabile)
- Indennità altezza (lavori >5m)
- Indennità sostitutiva mensa (~5-7€/giorno)
- Indennità trasferta (oltre 50km)

CASSA EDILE:
- Versamento mensile al CCNL provinciale
- Contribuzione: ~14-16% del lordo (carico azienda + lavoratore)
- Eroga: APE (anzianità), ferie, gratifica natalizia (13a), 14a, malattia integrativa
- ATTENZIONE: sospensione versamenti = sospensione DURC = stop lavori

PERIODO DI PROVA:
- Operaio: 30-60 giorni in base livello
- Impiegato: 60-180 giorni
- Durante prova: licenziamento senza preavviso/giusta causa

LICENZIAMENTO:
- Giusta causa: senza preavviso
- Giustificato motivo soggettivo: preavviso ridotto
- Giustificato motivo oggettivo: preavviso completo
- Discriminatorio/illegittimo: tutela L.92/2012 (Fornero) o art.18 SL

ISCRIZIONE OBBLIGATORIA:
- Cassa Edile (CE) provinciale
- Scuola Edile (formazione)
- Comitato paritetico territoriale (CPT)
- INAIL settore costruzioni`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsHeaders);

  try {
    // Due strade di autenticazione, come nelle altre ~40 funzioni interne:
    //  - super_admin dal pannello (bottone Re-seed in /admin AI Knowledge);
    //  - x-cron-secret interno, per il seeding senza passare dal browser.
    //    Il corpus e' fisso nel codice e l'upsert e' idempotente (hash del
    //    contenuto): il peggio che puo' fare chi ha il secret interno e'
    //    rigenerare gli embedding, pochi centesimi. Lo stesso secret gia'
    //    protegge funzioni ben piu' sensibili (email-poll-inbox).
    let userId: string | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let supabaseAdmin: any;
    if (cronSecretValido(req)) {
      supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
    } else {
      const auth = await requireAuth(req, corsHeaders);
      userId = auth.userId;
      supabaseAdmin = auth.supabaseAdmin;
      await requireRole(supabaseAdmin, userId, ["super_admin"], corsHeaders);
    }

    // Generate embeddings
    const FULL_CORPUS = [...CORPUS, ...CORPUS_REDAZIONALE];
    const contents = FULL_CORPUS.map(d => d.content);
    let embeddings: number[][] = [];
    const startedAt = Date.now();
    try {
      embeddings = await generateEmbeddingsBatch(contents);
      const estimated = estimateEmbeddingUsage(contents);
      await logPlatformAiCall({
        supabase: supabaseAdmin,
        operationKey: "ai_brain_seed_universal_embedding",
        provider: "openai",
        modelUsed: "text-embedding-3-small",
        userId,
        tokensIn: estimated.tokens,
        costRealUsd: estimated.costUsd,
        durationMs: Date.now() - startedAt,
        metadata: { documents: FULL_CORPUS.length },
      });
    } catch (e) {
      console.error("[brain-seed-universal] embed error:", e);
      return errorResponse(`Errore embedding: ${e instanceof Error ? e.message : String(e)}`, 500, corsHeaders);
    }

    // Upsert
    let okCount = 0;
    const failed: string[] = [];
    for (let i = 0; i < FULL_CORPUS.length; i++) {
      const doc = FULL_CORPUS[i];
      const emb = embeddings[i];
      const hash = await contentHash(doc.content);
      try {
        const { error } = await supabaseAdmin.rpc("brain_upsert_document", {
          p_company_id: null,
          p_source_type: doc.source_type ?? "knowledge",
          p_source_id: null,
          p_content: doc.content,
          p_content_hash: hash,
          p_embedding: emb ? `[${emb.join(",")}]` : null,
          p_metadata: {
            title:    doc.title,
            area:     doc.category,
            category: doc.category,
          },
          p_visibility_roles: null,
          p_scope: "universal",
          p_category: doc.category,
          p_title: doc.title,
        });
        if (error) {
          failed.push(`${doc.title}: ${error.message}`);
          console.error(`[brain-seed-universal] ${doc.title}: ${error.message}`);
        } else {
          okCount++;
        }
      } catch (e) {
        failed.push(`${doc.title}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const { data: stats } = await supabaseAdmin.rpc("brain_stats", {
      p_company_id: "00000000-0000-0000-0000-000000000000",
    });

    return jsonResponse({
      ok: true,
      total_corpus: FULL_CORPUS.length,
      ingested: okCount,
      failed: failed.length,
      failed_details: failed.slice(0, 5),
      stats,
    }, 200, corsHeaders);
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai-brain-seed-universal] error:", msg);
    return errorResponse(msg, 500, corsHeaders);
  }
});
