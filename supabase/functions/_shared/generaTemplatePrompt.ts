/**
 * generaTemplatePrompt — CORE condiviso per generare i testi dei template
 * preventivo con l'AI, riusato da tutte le edge function ai-genera-template-<modulo>.
 *
 * Un solo prompt di vendita (voce + framework + anti-invenzione + anti-riempitivo
 * + cliente_tipo) parametrizzato per SETTORE: ogni modulo porta le proprie
 * specifiche (lavori, problemi tipici, FAQ) → "minimo di personalizzazione".
 *
 * Output: i 13 campi che editor (applyGenerated) e PDF gia' consumano.
 */
import { requireAuth, requireCompanyAccess } from "./auth.ts";
import { gateAiPayment } from "./requirePaymentMethod.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "./headers.ts";
import { aiRouterComplete } from "./aiRouter.ts";
import { buildStableAiIdempotencyKey } from "./directAiLedger.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

interface SettoreCfg {
  label: string;      // settore esteso (cover/chi siamo/SETTORE)
  lavoro: string;     // "il lavoro" concreto (es. "il rifacimento del tetto")
  default: string;    // descrizione fallback quando il profilo e' vuoto
  specifiche: string; // problemi tipici + lavori + temi FAQ del settore
}

export const SETTORI: Record<string, SettoreCfg> = {
  tetti: {
    label: "rifacimento e impermeabilizzazione di tetti e coperture",
    lavoro: "il rifacimento del tetto",
    default: "Impresa specializzata in rifacimento e manutenzione di tetti e coperture (manto, isolamento termico, impermeabilizzazione, lattoneria e grondaie).",
    specifiche: "Problemi tipici: infiltrazioni e macchie sui soffitti, tetto vecchio/danneggiato, dispersione termica, grondaie otturate. Lavori: rimozione manto, nuova impermeabilizzazione (guaine), isolamento, lattoneria, lucernari, linee vita. Temi FAQ: durata lavori, cosa succede se piove, gestione del bonus, sicurezza e ponteggi.",
  },
  bagni: {
    label: "ristrutturazione e rifacimento bagni",
    lavoro: "il rifacimento del bagno",
    default: "Impresa specializzata nella ristrutturazione completa di bagni (demolizioni, idraulica, elettrico, piastrelle, sanitari, box doccia).",
    specifiche: "Problemi tipici: bagno datato e poco funzionale, umidita'/infiltrazioni, spazi piccoli da sfruttare, impianti vecchi. Lavori: demolizione, impianto idraulico ed elettrico, posa piastrelle, sanitari, box doccia, mobili. Temi FAQ: durata, come usare il bagno durante i lavori, scelta materiali, gestione bonus, polvere e pulizia.",
  },
  climatizzazione: {
    label: "impianti di climatizzazione (riscaldamento e raffrescamento)",
    lavoro: "l'impianto di climatizzazione",
    default: "Impresa specializzata in climatizzazione: split e multisplit, pompe di calore, manutenzione e messa a norma.",
    specifiche: "Problemi tipici: caldo d'estate/freddo d'inverno, bollette alte, impianto vecchio o rumoroso. Lavori: split/multisplit, pompe di calore, canalizzato, manutenzione, gestione gas refrigerante. Temi FAQ: consumi e risparmio, rumorosita', manutenzione, detrazioni/conto termico.",
  },
  pavimenti: {
    label: "posa e rifacimento pavimenti",
    lavoro: "il nuovo pavimento",
    default: "Impresa specializzata nella posa e nel rifacimento di pavimenti (gres, parquet, resina), con preparazione del sottofondo.",
    specifiche: "Problemi tipici: pavimento rovinato o datato, dislivelli, rumore al calpestio. Lavori: rimozione vecchio pavimento, massetto/livellamento, posa (gres/parquet/resina), battiscopa. Temi FAQ: durata, polvere e disagio, posa sopra il vecchio, manutenzione e resistenza.",
  },
  piscine: {
    label: "costruzione e ristrutturazione piscine",
    lavoro: "la piscina",
    default: "Impresa specializzata nella costruzione e ristrutturazione di piscine (struttura, rivestimento, impianto di filtrazione, coperture).",
    specifiche: "Problemi tipici: desiderio di una piscina, piscina vecchia che perde, manutenzione costosa e complicata. Lavori: scavo, struttura, rivestimento, impianto di filtrazione, illuminazione, copertura. Temi FAQ: tempi, permessi, consumi e manutenzione, sicurezza.",
  },
  termoidraulico: {
    label: "impianti termoidraulici (idraulica e riscaldamento)",
    lavoro: "l'impianto termoidraulico",
    default: "Impresa specializzata in impianti termoidraulici: caldaie e pompe di calore, riscaldamento, impianto idrico e sanitari.",
    specifiche: "Problemi tipici: caldaia vecchia, perdite, scarsa pressione dell'acqua, bollette alte. Lavori: caldaia/pompa di calore, radiatori, impianto idrico, sanitari, addolcitore. Temi FAQ: risparmio, durata, manutenzione, detrazioni.",
  },
  elettrico: {
    label: "impianti elettrici civili",
    lavoro: "l'impianto elettrico",
    default: "Impresa specializzata in impianti elettrici: rifacimento, messa a norma e certificazione, quadri, domotica.",
    specifiche: "Problemi tipici: impianto non a norma, salvavita che scatta, pochi punti luce e prese, niente certificazione. Lavori: rifacimento impianto, quadro elettrico, messa a norma e certificazione, domotica, punti luce. Temi FAQ: conformita'/certificazione, durata, lavori per fasi, sicurezza.",
  },
  ristrutturazione: {
    label: "ristrutturazione completa di interni",
    lavoro: "la ristrutturazione",
    default: "Impresa di ristrutturazioni complete: opere edili, impianti e finiture.",
    specifiche: "Problemi tipici: casa datata, spazi mal distribuiti, impianti vecchi, gestire piu' lavori insieme. Lavori: demolizioni, opere edili, impianti idraulico ed elettrico, finiture, serramenti. Temi FAQ: durata e fasi, abitabilita' durante i lavori, gestione bonus, coordinamento delle lavorazioni.",
  },
  fotovoltaico: {
    label: "impianti fotovoltaici e accumulo",
    lavoro: "l'impianto fotovoltaico",
    default: "Impresa specializzata in impianti fotovoltaici residenziali con accumulo: progettazione, installazione, allaccio e pratiche.",
    specifiche: "Problemi tipici: bollette elettriche alte, dipendenza dalla rete, voglia di indipendenza energetica. Lavori: progettazione, pannelli, inverter, batteria di accumulo, allaccio e pratiche GSE/Enel. Temi FAQ: risparmio reale in bolletta, tempi di rientro, durata e garanzia pannelli, manutenzione, incentivi/detrazioni.",
  },
  serramenti: {
    label: "serramenti e infissi (finestre, porte, persiane)",
    lavoro: "i nuovi serramenti",
    default: "Impresa specializzata in fornitura e posa di serramenti e infissi (finestre, porte-finestre, persiane), con rilievo e posa in opera.",
    specifiche: "Problemi tipici: spifferi e freddo, infissi vecchi, dispersione termica e bollette, rumore dall'esterno. Lavori: rilievo, fornitura infissi (PVC/alluminio/legno), smontaggio dei vecchi, posa in opera certificata, zanzariere e persiane. Temi FAQ: risparmio energetico, posa e tempi, detrazioni/bonus, manutenzione, isolamento acustico.",
  },
};

function buildSystemPrompt(s: SettoreCfg): string {
  return `# RUOLO
Sei un copywriter senior di vendita per imprese edili italiane, specializzato in: ${s.label}.
Scrivi i testi persuasivi che compaiono dentro il PREVENTIVO che l'impresa invia al suo cliente finale.
Parli con la voce dell'IMPRESA che fa il lavoro, NON di un software e NON di EdiliziaInCloud.
Il "prodotto" che vendi e' ${s.lavoro}, descritto in modo concreto.

# OBIETTIVO
Aumentare la probabilita' che il cliente ACCETTI il preventivo: far percepire competenza, valore e fiducia.
Persuasivo si', gonfiato mai.

# REGOLA D'ORO — ANTI-INVENZIONE (priorita' massima, non negoziabile)
Usi ESCLUSIVAMENTE i dati presenti nel blocco "DATI AZIENDA" del messaggio utente.
E' VIETATO inventare o dedurre: certificazioni, abilitazioni, albi, premi, partnership;
anni di attivita', numero di cantieri/clienti, percentuali; garanzie (durata, copertura)
non elencate esplicitamente; recensioni, nomi di clienti, casi studio.
Se un dato NON e' fornito: NON inventarlo. Ometti la frase oppure usa una formulazione
qualitativa onesta senza numeri (es. "squadra interna" invece di "15 operai specializzati").
MAI promesse tipo "soddisfatti o rimborsati", "garanzia a vita", "prezzo piu' basso garantito"
se non sono scritte nei dati. Nel dubbio tra scrivere meno e rischiare un'affermazione non
verificabile -> scrivi meno.

# VOCE E STILE (default; sovrascritto da VOCE se fornita)
- Diretto e caldo. Dai del "tu" al privato; registro un filo piu' formale per condominio/azienda.
- Frasi corte (max ~14 parole). Parole del cantiere e del lavoro reale, non del marketing.
- Niente burocratese, niente passivo ("verra' effettuato" -> "facciamo").
- Ogni affermazione forte ha SEMPRE una ragione concreta accanto. Zero superlativi vuoti.
PAROLE VIETATE: innovativo, rivoluzionario, all'avanguardia, soluzione (come slogan),
leader del settore, qualita' garantita (senza dire come), professionalita', eccellenza,
su misura (senza dire in cosa), chiavi in mano (se non nei dati), efficienza (senza un fatto),
sinergia, ottimizzare, il meglio per te, passione, dedizione. Piu' le parole elencate in VIETATI.
RIEMPITIVI VIETATI (frasi vuote): "con attenzione e professionalita'", "qualita' e serieta'",
"lavoro fatto a regola d'arte" (se non spieghi COME), "soddisfazione del cliente al primo posto",
"ci distingue la nostra professionalita'". Ogni frase deve poggiare su un fatto concreto;
se non hai il fatto, taglia la frase.

# FRAMEWORK PERSUASIVO (applicalo DENTRO le sezioni, mai come etichette visibili)
DOLORE -> SOLUZIONE -> PROVA -> VALORE -> SICUREZZA.
- DOLORE: il problema reale e concreto del cliente.
- SOLUZIONE: cosa fate e come, in modo tangibile.
- PROVA: solo dati veri (anni, cantieri, certificazioni, zone, garanzie).
- VALORE (equazione di Hormozi): risultato desiderato + perche' e' probabile riuscirci + tempi chiari + poco disturbo per il cliente.
- SICUREZZA: garanzie reali + prossimo passo facile + urgenza ONESTA (validita' preventivo, agenda piena, scadenza bonus reale — mai finta).
Usa le leve di Cialdini quando i fatti lo permettono: riprova sociale, autorita' (certificazioni reali), scarsita' reale.

# SPECIFICHE DI SETTORE (${s.label})
${s.specifiche}

# ADATTAMENTO AL CLIENTE_TIPO
- privato -> emozione: casa, famiglia, tranquillita', "fatto bene una volta". Obiezioni: prezzo, fiducia, disagio dei lavori, durata, pulizia. Tono "tu", caldo.
- condominio -> decisione collettiva + amministratore. Leve: trasparenza, durata garantita, gestione pratiche, niente sorprese in assemblea. Tono "voi", istituzionale ma chiaro.
- azienda -> ROI, continuita' operativa, tempi certi, fattura e detrazioni, zero fermo attivita'. Tono asciutto, numeri.
- studio tecnico / progettista -> interlocutore competente: dettaglio tecnico, rispetto del capitolato, affidabilita' sui tempi, collaborazione.
- ente pubblico -> trasparenza, conformita' normativa, documentazione, rispetto delle procedure.
- agricolo/industriale -> grandi superfici, continuita' operativa, rapidita', costo al mq.
Se sono indicati PIU' tipi insieme: scrivi testi equilibrati che funzionano per tutti, e nelle FAQ copri le obiezioni dei diversi tipi.

# COME COMPILARE OGNI CAMPO
- cover_title: l'headline. Max 12 parole, il valore principale del lavoro per QUESTO cliente_tipo.
- cover_subtitle: 1 frase di supporto.
- chi_siamo_html: 2 brevi paragrafi <p>...</p> (chi siete + perche' vi ha chiamato + cosa garantite). SOLO fatti veri.
- esigenze: 4 voci = il DOLORE del cliente, concreto e legato al settore.
- soluzione: 4 voci = come risolvete + cosa include il lavoro.
- usp: 5 voci = perche' sceglierci, OGNI voce ancorata a un fatto vero.
- garanzie: SOLO garanzie reali dai dati; [] se nessuna.
- percorso: 5 voci = il metodo (sopralluogo -> progetto -> cantiere -> collaudo -> assistenza).
- cronoprogramma: 5 fasi di cantiere, con durata realistica per questo settore.
- faq: 5 obiezioni reali del cliente_tipo (usa i temi FAQ del settore), con risposta diretta.
- payment_terms_html: rate/finanziamento/detrazioni in <p>/<ul>, SOLO se presenti nei dati; "" altrimenti.
- validity_text: 1 frase sulla validita' del preventivo (urgenza onesta).
- footer_text: 1 riga sobria (riprova sociale o scarsita' reale solo se hai i fatti; altrimenti neutra).

# AUTO-CONTROLLO (prima di produrre il JSON, rileggi e correggi)
1. Hai usato parole VIETATE o RIEMPITIVI? Rimuovili.
2. C'e' una frase generica senza un fatto concreto? Cancellala o sostituiscila con un fatto dai DATI AZIENDA.
3. Ogni voce di "usp" cita un fatto vero? Se no, toglila.
4. Numeri, certificazioni o garanzie NON presenti nei DATI? Rimuovili.
Meglio 3 frasi vere e concrete che 6 vuote.

# OUTPUT — SOLO JSON valido, nessun testo prima/dopo, niente markdown, niente backtick.
Se un campo non ha dati veri a supporto: stringa vuota "" o array vuoto []. Struttura ESATTA:
{
  "cover_title": "string",
  "cover_subtitle": "string",
  "chi_siamo_html": "string con <p>...</p>",
  "esigenze": [{ "titolo": "string (max 60)", "descrizione": "string (1 frase)" }],
  "soluzione": [{ "titolo": "string", "descrizione": "string" }],
  "usp": [{ "titolo": "string", "descrizione": "string" }],
  "garanzie": [{ "titolo": "string", "descrizione": "string" }],
  "percorso": [{ "titolo": "string", "descrizione": "string" }],
  "cronoprogramma": [{ "fase": "string", "durata": "string", "descrizione": "string" }],
  "faq": [{ "domanda": "string", "risposta": "string (1-2 frasi)" }],
  "payment_terms_html": "string",
  "validity_text": "string",
  "footer_text": "string"
}
Conteggi: esigenze 4, soluzione 4, usp 5, garanzie max 3, percorso 5, cronoprogramma 5, faq 5.
Tono coerente per tutto l'output. Nessuna parola della lista VIETATE.`;
}

export async function handleGeneraTemplate(req: Request, settoreKey: string): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  const cors = getCorsHeaders(req);

  try {
    if (req.method !== "POST") {
      return errorResponse("Metodo non consentito", 405, cors);
    }
    const settore = SETTORI[settoreKey];
    if (!settore) return errorResponse(`Settore sconosciuto: ${settoreKey}`, 400, cors);

    const { userId, supabaseAdmin } = await requireAuth(req, cors);

    const body = await req.json().catch(() => ({}));
    const { company_id, descrizione, tono, cliente_tipo } = body as {
      company_id?: string;
      descrizione?: string;
      tono?: string;
      cliente_tipo?: string;
    };

    if (!company_id) return errorResponse("company_id obbligatorio", 400, cors);
    await requireCompanyAccess(supabaseAdmin, userId, company_id, cors);
    const paymentBlock = await gateAiPayment(supabaseAdmin, company_id, cors);
    if (paymentBlock) return paymentBlock;

    // Puo' essere uno o piu' tipi separati da virgola (es. "privato, condominio").
    const clienteTipo = (cliente_tipo ?? "").trim() || "privato";

    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("name")
      .eq("id", company_id)
      .maybeSingle();
    const companyName = (company?.name as string | undefined) ?? "La nostra impresa";

    const userPrompt = [
      `SETTORE: ${settore.label}`,
      `IMPRESA: "${companyName}"`,
      `CLIENTE_TIPO: ${clienteTipo}`,
      tono?.trim() ? `VOCE (override del default): ${tono.trim()}` : "",
      "",
      "DATI AZIENDA (FATTI_VERI / OFFERTA / ESEMPI) — usa SOLO questi; ometti cio' che manca:",
      descrizione?.trim()
        ? descrizione.trim()
        : `(nessun dato specifico fornito: ${settore.default} Scrivi testi onesti e generici di settore, senza numeri, certificazioni o garanzie inventate.)`,
      "",
      "Genera i testi del template rispettando regole, framework e schema di output.",
    ]
      .filter(Boolean)
      .join("\n");

    const idempotencyKey = await buildStableAiIdempotencyKey(`template_${settoreKey}`, [
      company_id,
      userId,
      clienteTipo,
      descrizione ?? null,
      tono ?? null,
    ]);

    let aiResult;
    try {
      aiResult = await aiRouterComplete({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabaseAdmin as any,
        taskKey: `template_${settoreKey}`,
        messages: [
          { role: "system", content: buildSystemPrompt(settore) },
          { role: "user", content: userPrompt },
        ],
        params: { temperature: 0.6, max_tokens: 3800 },
        responseFormat: { type: "json_object" },
        companyId: company_id,
        userId,
        idempotencyKey,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return errorResponse(`AI Router error: ${msg}`, 502, cors);
    }

    let generated: AnyObj;
    try {
      generated = JSON.parse(aiResult.content);
    } catch {
      return errorResponse("AI ha restituito JSON non valido", 502, cors);
    }

    const asList = (v: unknown) =>
      Array.isArray(v)
        ? v
            .map((x) => ({
              titolo: String((x as AnyObj)?.titolo ?? "").trim(),
              descrizione: ((x as AnyObj)?.descrizione ?? null) as string | null,
            }))
            .filter((x) => x.titolo)
        : [];
    const asCrono = (v: unknown) =>
      Array.isArray(v)
        ? v
            .map((x) => ({
              fase: String((x as AnyObj)?.fase ?? "").trim(),
              durata: ((x as AnyObj)?.durata ?? null) as string | null,
              descrizione: ((x as AnyObj)?.descrizione ?? null) as string | null,
            }))
            .filter((x) => x.fase)
        : [];
    const asFaq = (v: unknown) =>
      Array.isArray(v)
        ? v
            .map((x) => ({
              domanda: String((x as AnyObj)?.domanda ?? "").trim(),
              risposta: String((x as AnyObj)?.risposta ?? "").trim(),
            }))
            .filter((x) => x.domanda && x.risposta)
        : [];

    const out = {
      cover_title: String(generated.cover_title ?? "").trim() || null,
      cover_subtitle: String(generated.cover_subtitle ?? "").trim() || null,
      chi_siamo: String(generated.chi_siamo_html ?? "").trim() || null,
      esigenze: asList(generated.esigenze),
      soluzione: asList(generated.soluzione),
      usp: asList(generated.usp),
      garanzie: asList(generated.garanzie),
      percorso: asList(generated.percorso),
      cronoprogramma: asCrono(generated.cronoprogramma),
      faq: asFaq(generated.faq),
      payment_terms_text: String(generated.payment_terms_html ?? "").trim() || null,
      validity_text: String(generated.validity_text ?? "").trim() || null,
      footer_text: String(generated.footer_text ?? "").trim() || null,
    };

    return jsonResponse(
      {
        success: true,
        generated: out,
        ai_meta: {
          model_used: aiResult.modelUsed,
          tokens: aiResult.totalTokens,
          cost_billed_eur: aiResult.costBilledEur,
        },
      },
      200,
      cors,
    );
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(
      `Errore interno: ${err instanceof Error ? err.message : String(err)}`,
      500,
      getCorsHeaders(req),
    );
  }
}
