/**
 * Distinta dei materiali («lista della spesa») dal computo della commessa e
 * dai conteggi confermati delle planimetrie. Regole pure: nessun accesso al
 * database qui.
 *
 * Per ogni voce del computo:
 *   1. voci di sicurezza, in detrazione o tolte dal computo → escluse;
 *   2. c'è una scomposizione attiva che la riconosce → materiali =
 *      componenti × quantità della voce, più lo sfrido;
 *   3. è già una fornitura (cavo, pompa di calore, moduli FV…) → una riga
 *      con la voce stessa;
 *   4. oneri, parcelle, pratiche, noli, manodopera, smaltimenti, «a corpo»
 *      senza scomposizione → escluse, col motivo;
 *   5. tutto il resto è una lavorazione senza scomposizione → avviso (la
 *      scomposizione la propone l'AI o la scrive il tecnico).
 * Dal 14/11/2026 (richiesta del titolare: «sviluppare bene la ricerca dei
 * materiali») prima delle regole generiche si scartano le voci di sola posa,
 * di materiale fornito dal committente e le demolizioni; la libreria standard
 * (scomposizioniStandard) fa da riserva quando l'azienda non ha una sua
 * scomposizione, con le quantità adattate allo spessore scritto; le proposte
 * dell'AI ancora da approvare entrano come righe a bassa sicurezza, spente.
 * Ogni riga dice da dove viene (`fonte`) e quanto è sicura (`affidabilita`).
 *
 * Le righe uguali (stessa descrizione normalizzata, unità e specifiche) si
 * sommano e tengono l'elenco delle voci da cui vengono. Le righe dalle
 * planimetrie restano separate da quelle del computo: la stessa cosa contata
 * due volte sarebbe comprata due volte, e lo segnala un avviso.
 */

import { applicaSovrapprezziSpessore } from "./sovrapprezziSpessore";
import { classificaServizio, ETICHETTA_SERVIZIO } from "./serviziComputo";
import { caratteristicheTecniche } from "./caratteristicheVoce";
import { completaVerificheAcquisto, preparaQuantitaAcquisto, type VerificaAcquisto } from "./verificaAcquisto";
import { completaMaterialiDaDocumenti, prodottoEsplicito, type DatiDocumentaliMateriale } from "./materialiDocumentali";
import { prodottoDaVoceDocumentata } from "./prodottiDocumentati";

/** Unità a pezzi, comunque scritte («cad», «cadauno», «pz», «n.»). */
const aPezzi = (u: string | null | undefined) => ["pz", "cad", "n", "nr"].includes(normalizzaUnita(u));

export interface VoceComputo {
  id: string;
  codice_voce?: string | null;
  codice_prezzario?: string | null;
  codice_tariffa?: string | null;
  numero_ordine?: string | null;
  descrizione_breve: string;
  descrizione_estesa?: string | null;
  unita_misura?: string | null;
  quantita?: number | null;
  super_categoria?: string | null;
  categoria?: string | null;
  sotto_categoria?: string | null;
  capitolo_nome?: string | null;
  is_sicurezza?: boolean | null;
  is_detrazione?: boolean | null;
  a_corpo?: boolean | null;
  is_included?: boolean | null;
  misure?: { id?: string; ordine?: number; descrizione?: string | null; parti_uguali?: number | null; lunghezza?: number | null; larghezza?: number | null; altezza_peso?: number | null; quantita?: number | null; formula?: string | null }[] | null;
  avvisi_acquisto?: string[];
}

export interface ComponenteScomposizione {
  id?: string;
  descrizione: string;
  specifiche?: string | null;
  unita_misura: string;
  quantita_per_unita: number;
  sfrido_percentuale?: number | null;
  categoria?: string | null;
  article_template_id?: string | null;
  supplier_id?: string | null;
}

export interface Scomposizione {
  id: string;
  nome: string;
  codice_prezzario?: string | null;
  parole_chiave?: string[] | null;
  unita_misura?: string | null;
  categoria?: string | null;
  attiva: boolean;
  /** Se viene dalla libreria standard: il suo codice (ED-INTONACO-PREMISCELATO…). */
  codice_standard?: string | null;
  componenti: ComponenteScomposizione[];
}

export interface ConteggioConfermato {
  pagina?: number; metodo?: string; updated_at?: string;
  id: string;
  simbolo: string;
  descrizione_legenda?: string | null;
  locale?: string | null;
  quantita: number;
  documento_id?: string | null;
  documento_nome?: string | null;
  scomposizione_id?: string | null;
  /** Fase di lavoro scelta per il conteggio. */
  phase_id?: string | null;
  /** Unità del conteggio: 'pz' (simboli contati) o 'm' (lunghezze misurate dal disegno CAD). Vuota = pezzi. */
  unita?: string | null;
}

/** Da dove viene un materiale: decide quanto è sicuro. */
export type FonteMateriale =
  | "scomposizione_codice" | "scomposizione" | "libreria_standard" | "fornitura" | "compreso" | "proposta_ai" | "tavola" | "tavola_fornitura";

export const ETICHETTA_FONTE_MATERIALE: Record<FonteMateriale, string> = {
  scomposizione_codice: "Scomposizione dell'azienda (codice)",
  scomposizione: "Scomposizione dell'azienda",
  libreria_standard: "Libreria standard (resa media)",
  fornitura: "La voce è già il materiale",
  compreso: "Compreso nella voce: quantità da controllare",
  proposta_ai: "Proposta dell'AI, da approvare",
  tavola: "Tavola contata",
  tavola_fornitura: "Tavola contata (simbolo come fornitura)",
};

export const AFFIDABILITA_FONTE: Record<FonteMateriale, number> = {
  scomposizione_codice: 0.95,
  scomposizione: 0.85,
  libreria_standard: 0.7,
  fornitura: 0.75,
  compreso: 0.5,
  proposta_ai: 0.45,
  tavola: 0.9,
  tavola_fornitura: 0.6,
};

export type OrigineRiga =
  | { tipo: "contratto"; documento_ref: string; posizione_ref: string; descrizione: string; quantita: number; unita_materiale?: string; voce_id?: string | null; subphase_id?: string | null;
      verifica_acquisto?: VerificaAcquisto; dati_documentali?: DatiDocumentaliMateriale }
  | { tipo: "computo"; voce_id: string; codice: string | null; descrizione: string; quantita_voce: number; unita_voce: string | null; quantita: number; fonte?: FonteMateriale; nota?: string | null;
      /** La scomposizione della libreria standard usata (il suo codice): per ricordare le scelte dell'utente. */
      standard?: string | null; note?: string[]; verifica_acquisto?: VerificaAcquisto; dati_documentali?: DatiDocumentaliMateriale }
  | { tipo: "planimetria"; conteggio_id: string; documento_id: string | null; documento: string | null; locale: string | null; simbolo: string; quantita_simbolo: number; quantita: number;
      ruolo?: "riscontro_quantita" | "riscontro_precedente"; conteggio_versione?: string; pagina?: number; verifica_acquisto?: VerificaAcquisto };

export interface RigaDistintaCalcolata {
  chiave: string;
  descrizione: string;
  specifiche: string | null;
  unita_misura: string;
  /** Senza sfrido. */
  quantita_netta: number;
  /** Con lo sfrido, arrotondata per l'acquisto. */
  quantita_calcolata: number;
  /** Sfrido percentuale, se uguale per tutte le parti della riga. */
  sfrido: number | null;
  origine: "computo" | "planimetria";
  origini: OrigineRiga[];
  computo_voce_id: string | null;
  scomposizione_id: string | null;
  planimetria_documento_id: string | null;
  planimetria_documento: string | null;
  locale: string | null;
  categoria: string | null;
  article_template_id: string | null;
  supplier_id: string | null;
  /** Fase di lavoro della commessa in cui va il materiale (null = senza fase). */
  phase_id: string | null;
  /** Da dove viene (la fonte meno sicura fra le parti sommate). */
  fonte: FonteMateriale;
  /** Da 0 a 1: quanto è sicuro che sia da comprare così. */
  affidabilita: number;
  /** Viene da una scomposizione proposta dall'AI e non ancora approvata: si propone spenta. */
  proposta_ai: boolean;
  /** Note sul calcolo («spessore 2 cm: quantità × 1,33», «posa esclusa»). */
  note: string[];
  verifica_acquisto?: VerificaAcquisto;
  dati_documentali?: DatiDocumentaliMateriale;
}

export interface VoceEsclusa {
  voce_id: string;
  codice: string | null;
  descrizione: string;
  quantita: number | null;
  unita_misura: string | null;
  motivo: string;
}

export interface AvvisoDistinta {
  tipo: "senza_scomposizione" | "quantita_mancante" | "possibile_doppione" | "conteggio_senza_scomposizione" | "gia_nel_computo";
  messaggio: string;
  voce_id?: string;
  conteggio_id?: string;
}

export interface RisultatoDistinta {
  righe: RigaDistintaCalcolata[];
  escluse: VoceEsclusa[];
  avvisi: AvvisoDistinta[];
  /** Voci da far scomporre (all'AI o al tecnico). */
  senzaScomposizione: VoceComputo[];
}

// ─── Normalizzazione ───────────────────────────────────────────────────────

export function normalizzaTesto(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[×x](?=\s*\d)/g, "x")
    .replace(/,/g, ".")
    .replace(/[^a-z0-9.%/øØ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const UNITA: Record<string, string> = {
  cad: "cad", "cad.": "cad", cadauno: "cad", n: "cad", "n.": "cad", nr: "cad", "nr.": "cad", num: "cad",
  pz: "pz", "pz.": "pz", pezzi: "pz", pezzo: "pz",
  m: "m", ml: "m", "m.": "m", mt: "m", metri: "m", metro: "m",
  mq: "mq", m2: "mq", "m²": "mq",
  mc: "mc", m3: "mc", "m³": "mc",
  kg: "kg", t: "t", ton: "t", q: "q", "100 kg": "q", "100kg": "q", l: "l", lt: "l",
  h: "h", ore: "h", ora: "h",
  "a corpo": "a corpo", corpo: "a corpo",
};

export function normalizzaUnita(um: string | null | undefined): string {
  const k = (um ?? "").trim().toLowerCase();
  if (!k) return "pz";
  return UNITA[k] ?? UNITA[k.replace(/\.$/, "")] ?? k;
}

export function chiaveRiga(
  descrizione: string, unita: string, specifiche: string | null | undefined, origine: string, fase?: string | null,
): string {
  return [normalizzaTesto(descrizione), normalizzaUnita(unita), normalizzaTesto(specifiche), origine, fase ?? ""].join("|");
}

/** Unità che si comprano a pezzi interi. */
const UNITA_INTERE = new Set(["cad", "pz"]);

/** Vero se l'unità si compra a pezzi interi (cad, pz): kg, m², m³… accettano i decimali. */
export function siCompraAPezzi(unita: string | null | undefined): boolean {
  return UNITA_INTERE.has(normalizzaUnita(unita));
}

export function arrotondaPerAcquisto(q: number, unita: string): number {
  if (!Number.isFinite(q) || q <= 0) return 0;
  if (UNITA_INTERE.has(normalizzaUnita(unita))) return Math.ceil(q - 1e-9);
  return Math.ceil(q * 100 - 1e-6) / 100;
}

// ─── Riconoscimento ────────────────────────────────────────────────────────

function testoVoce(v: VoceComputo): string {
  return normalizzaTesto(`${v.descrizione_breve} ${v.descrizione_estesa ?? ""}`);
}

/** Punteggio di una scomposizione su un testo: codice esatto vince, poi le parole chiave (tutte presenti). */
export function punteggioScomposizione(
  s: Scomposizione,
  dati: { codice?: string | null; codiceTariffa?: string | null; codiceVoce?: string | null; testo: string; unita?: string | null },
): number {
  if (!s.attiva) return 0;
  const codiceS = (s.codice_prezzario ?? "").trim().toUpperCase();
  const codici = [dati.codice, dati.codiceTariffa, dati.codiceVoce].map((c) => (c ?? "").trim().toUpperCase()).filter(Boolean);
  const umOk = !s.unita_misura || normalizzaUnita(s.unita_misura) === normalizzaUnita(dati.unita);
  if (codiceS && codici.includes(codiceS)) return umOk ? 1000 : 900;
  const parole = (s.parole_chiave ?? []).map(normalizzaTesto).filter(Boolean);
  if (!parole.length || !umOk) return 0;
  const testo = ` ${dati.testo} `;
  // Ogni parola chiave deve comparire all'inizio di una parola del testo
  // («corrugat» trova «corrugato» e «corrugati»).
  if (!parole.every((p) => testo.includes(` ${p}`))) return 0;
  // Vince la più specifica: ogni parola chiave pesa per quanto dice (vedi
  // pesoParolaChiave); a parità, le parole più lunghe.
  return 100 + parole.reduce((t, p) => t + pesoParolaChiave(p), 0) + parole.join("").length / 100;
}

/**
 * Parole che cambiano i materiali (un deviatore in più, l'apparecchio di
 * emergenza, un altro rivelatore): pesano più delle altre. «Punto luce
 * deviato a parete» è un deviato, non un punto luce a parete.
 */
const PAROLE_SPECIFICHE = [
  "deviat", "invertit", "interrott", "emergenz", "sicurezz", "comandat", "temporizzat", "dimmer",
  "rele", "stagn", "antideflagr", "schuko", "rj45", "rj11", "telefon", "tv", "sat",
  "ottic", "termovelocimetric", "multicriteri", "differenzial", "magnetotermic",
];
/** Dove sta il punto (parete, soffitto, incasso): pesa poco, i materiali cambiano appena. */
const PAROLE_DI_POSIZIONE = [
  "parete", "soffit", "controsoffit", "incasso", "vista", "esterno", "esterna", "interno", "interna", "pavimento", "muro",
];

/** Peso di una parola chiave normalizzata: 25 se specifica, 3 se dice solo dove sta, 10 le altre. */
export function pesoParolaChiave(parola: string): number {
  const p = parola.replace(/^(a|al|alla|ad|da|in|su|sotto)\s+/, "").trim();
  if (PAROLE_SPECIFICHE.some((s) => p.startsWith(s))) return 25;
  if (PAROLE_DI_POSIZIONE.some((s) => p.startsWith(s))) return 3;
  return 10;
}

export function trovaScomposizione(
  scomposizioni: Scomposizione[],
  dati: { codice?: string | null; codiceTariffa?: string | null; codiceVoce?: string | null; testo: string; unita?: string | null },
): Scomposizione | null {
  let migliore: Scomposizione | null = null;
  let max = 0;
  for (const s of scomposizioni) {
    const p = punteggioScomposizione(s, dati);
    if (p > max) { max = p; migliore = s; }
  }
  return migliore;
}

/** Perché una voce non compra niente: lo legge chi interpreta la voce, senza rileggere il motivo scritto. */
export type CausaEsclusione =
  | "tolta" | "detrazione" | "quantita_mancante" | "sovrapprezzo" | "demolizione" | "sicurezza" | "generica" | "subappalto"
  | "prestazione" | "nolo" | "manodopera" | "smaltimento" | "assistenza" | "solo_posa" | "committente";

/** Lavorazione data a una ditta: materiali e manodopera sono nel suo prezzo (23/11/2026). */
export const AFFIDATA_A_TERZI = /\b(?:in subappalto|subappaltat[oaie]|affidat[oaie] (?:in subappalto|a terzi|a (?:una )?(?:ditta|impresa) (?:specializzata|esterna|terza|abilitata|qualificata)))\b/;
/**
 * Voci che dicono un importo, non un lavoro (23/11/2026): «spese generali», «imprevisti», «opere
 * accessorie», «assistenze varie». Prima finivano fra le voci «da scomporre» e l'AI ne ricavava
 * materiali. Vanno chiarite: si compra qualcosa solo se c'è un dettaglio che lo dice.
 */
export const VOCE_GENERICA = /^(?:spese generali|imprevist[oi]|oneri (?:generali|vari|accessori)|opere (?:accessorie|varie|complementari|di completamento varie)|lavori vari|varie(?: ed eventuali)?\b|assistenz[ae] (?:varie|generich[ae])|opere e assistenze|arrotondament[oi]|utile d.?impresa)/;

const NON_MATERIALI: { re: RegExp; motivo: string; causa: CausaEsclusione }[] = [
  { re: AFFIDATA_A_TERZI, causa: "subappalto", motivo: "Lavorazione affidata a una ditta: materiali e manodopera sono nel suo prezzo" },
  { re: VOCE_GENERICA, causa: "generica", motivo: "Voce generica: va chiarito che cosa comprende prima di comprare qualcosa" },
  { re: /\boneri\b|\bsicurezza\b.*\b(psc|cantiere)\b|\bapprestament/, causa: "sicurezza", motivo: "Oneri o apprestamenti della sicurezza: non sono materiali da ordinare" },
  { re: /\b(?:parcell\w*|onorar\w*|progettazion\w*|direzione lavori|coordinamento|collaud\w*|certificazion\w*|asseveraz\w*|relazione tecnica|pratica|pratiche|spese tecniche|frazionamento|accatastament\w*)\b/, causa: "prestazione", motivo: "Prestazione tecnica o pratica: non è un materiale" },
  { re: /\b(nolo|noleggio|noli)\b/, causa: "nolo", motivo: "Nolo: si noleggia, non si acquista" },
  { re: /\b(mano d.?opera|manodopera|operaio (specializzato|qualificato|comune)|ora di (operaio|lavoro))\b/, causa: "manodopera", motivo: "Manodopera" },
  { re: /\b(smaltiment|conferimento a discarica|oneri di discarica|trasporto a (discarica|rifiuto))/, causa: "smaltimento", motivo: "Smaltimento o trasporto a discarica" },
  { re: /\b(assistenza muraria|assistenze murarie)\b/, causa: "assistenza", motivo: "Assistenza muraria: lavorazione senza materiali da ordinare" },
  { re: /^sovrapprezz/, causa: "sovrapprezzo", motivo: "Sovrapprezzo: i materiali sono già nella voce principale" },
];

/** Voci che descrivono una cosa da comprare, non una lavorazione. */
const PREFISSO_FORNITURA = /^(fornitura|f\.?\s?e p\.?|f\.? e p\.? in opera)( e (posa|messa|collocazione|collocamento|installazione)( in opera)?)?( in opera)?( (di|del|della|dello|dei|degli|delle))?\s+/;
/** Dopo «fornitura e posa di…»: un punto o un impianto è una lavorazione, non un materiale. */
const LAVORAZIONE_DOPO_FORNITURA = /^(punt[oi]|impiant[oi]|realizzazion|esecuzion|opere|lavori|predisposizion|linea|linee|allacci|collegament)/;
const FORNITURA_DIRETTA = /^(cavo|cavi|tubo|tubi|tubazion|corrugat|guaina|canal(a|ina|ette)|pompa di calore|pompe di calore|modul[oi] (fotovoltaic|fv)|pannell[oi] (fotovoltaic|solar)|inverter|batteri[ae] di accumulo|accumulo|plafonier|lampad|apparecchi[oa]? (illuminant|di illuminazione)|corpo illuminante|quadro elettrico|centrale|rilevator|rivelator|pulsante|segnalatore|interruttore|scatol|cassett|caldaia|radiatore|termosifon|collettore|valvol[ae]|boiler|scaldacqua|scaldabagno|serbatoio|split|unita (interna|esterna)|climatizzator|ventilconvettor|sanitari|vaso|lavabo|piatto doccia|rubinett|miscelator|serramento|infisso|porta|finestra|tegol|coppi|pannell[oi]|lastr[ae]|profilat|travi?|putrell|tondin|rete elettrosaldata|mattoni|blocchi|laterizi|cemento|calcestruzzo|malta|sabbia|ghiaia|piastrell|gres|parquet|battiscopa|vernice|pittura|idropittura|isolante|lana di (roccia|vetro)|polistirene|eps|xps|membrana|guaina)/;

const UNITA_MATERIALE = new Set(["cad", "pz", "m", "mq", "mc", "kg", "t", "q", "l"]);
const PRODOTTO_FV_CONTATO = /^(?:regolator[ei] di carica\b|concentrator[ei] per (?:\d+ )?batteri[ae]\b|batteri[ae] (?:piombo|litio|al piombo)\b|sistema di commutazione.*batteri)/;

export type ClassificazioneVoce =
  | { tipo: "esclusa"; motivo: string; causa?: CausaEsclusione }
  | { tipo: "scomposta"; scomposizione: Scomposizione; fonte: FonteMateriale; fattore?: number; nota?: string | null }
  | { tipo: "fornitura"; nome: string; nota: string | null; compresi?: string[]; unita?: string; specifiche?: string }
  | { tipo: "senza_scomposizione" };

/** Voci che non comprano niente: sola posa, materiale del committente, demolizioni e scavi. */
const SOLO_POSA = /^(?:sola |solo )?(?:posa|messa)(?: in opera)?\b/;
const MATERIALE_DEL_COMMITTENTE = /\b(?:fornit[oaie] dal(?:la|l)? ?(?:committent|committenza|stazione appaltante|cliente|proprieta)|esclus[ao] (?:la )?fornitura|(?:materiale|materiali) (?:esclus|a carico del committent))/;
const SENZA_MATERIALI = /^(?:demolizion|rimozion|smontaggi|scarific|scavo|scavi|rinterr|pulizi|sgombero|carico (?:e trasporto|su automezzo)|trasporto|movimentazion|taglio (?:di|del|della|a sezione)|spicconatur|asportazion)/;

const RIFACIMENTO = /\b(?:e|con|compreso il|compreso|per)\s+(?:successiv[oa]\s+)?(?:rifaciment|ricostruzion|ripristin|nuov[oa] (?:posa|fornitura|realizzazion)|sostituzion)/;

/** «Fornitura e posa in opera di» e simili: c'è la posa dentro la voce. */
const CON_POSA = /\b(posa|in opera|messa in opera|posto in opera|posti in opera)\b/;

/**
 * L'oggetto della voce: le prime parole che contano, senza «Fornitura e posa in opera di»
 * e senza articoli e preposizioni (17/11/2026). Una ricetta della libreria si abbina per
 * parole chiave solo se una di queste sta qui: «Controsoglia in travertino a copertura del
 * cappotto» non è un cappotto, «Bollitore… corredato di termostato» non è un termostato,
 * «Sistema di montaggio… per modulo fotovoltaico» non sono moduli. Simulazione col computo
 * PriMus di Genzano: 510 moduli invece di 160, mattoni da un controtelaio, rasante da un
 * manto di coppi.
 */
const PAROLE_VUOTE = new Set(["di", "del", "della", "dello", "dei", "degli", "delle", "a", "al", "alla", "ai", "agli", "alle", "ad", "da", "dal", "in", "nel", "nella", "con", "per", "su", "e", "ed", "o", "il", "lo", "la", "i", "gli", "le", "un", "uno", "una", "tipo"]);
export function testaVoce(breve: string, parole = 3): string[] {
  const n = normalizzaTesto(breve);
  const prefisso = PREFISSO_FORNITURA.exec(n);
  const resto = prefisso ? n.slice(prefisso[0].length) : n;
  return resto.split(/[^a-z0-9]+/).filter((w) => w && !PAROLE_VUOTE.has(w)).slice(0, parole);
}
function chiaveInTesta(s: Scomposizione, testa: string[]): boolean {
  const chiavi = (s.parole_chiave ?? []).map(normalizzaTesto).filter(Boolean);
  return chiavi.some((k) => testa.some((w) => w.startsWith(k.split(" ")[0])));
}

/** Sovrapprezzi, maggiorazioni, accessori: i materiali stanno nella voce principale. */
/** Prodotti fatti su misura per vano: serramenti, persiane, avvolgibili, oscuranti, cassonetti, zanzariere. */
const SU_MISURA_A_SUPERFICIE = /^(serrament|finestr|portafinestr|porta finestr|porton|infiss|persian|avvolgibil|tapparell|oscurant|scuri|scurett|contro\s?sportell|cassonett|zanzarier|vetrat)/;
const APPARECCHIO_COMPLETO = /^(?:pompa di calore|pompe di calore|ventilconvettor|inverter)\b/;
const SOVRAPPREZZO = /\b(sovrapprezz|maggiorazion|supplemento per|per ogni cm in piu|per ogni centimetro in piu)/;
const ACCESSORI_DI = /^(accessori|accessorio|kit|pannello decorativo|ricambi)\b/;

/**
 * Il nome del materiale da una voce di fornitura: senza «Fornitura e posa in opera di»,
 * senza «compreso…», «dato in opera…» e il resto delle condizioni.
 */
export function nomeMateriale(descrizione: string): string {
  let t = descrizione.trim().replace(/\s+/g, " ");
  t = t.replace(/^(?:fornitura|f\.? ?e ?p\.?(?: ?o\.?)?|f\.? ?p\.? ?o\.?)(?:\s+e\s+(?:posa|messa|collocazione|collocamento|installazione)(?:\s+in\s+opera)?)?(?:\s+in\s+opera)?(?:\s+(?:di|del|della|dello|dei|degli|delle|d'))?\s*/i, "");
  t = t.split(/\s*(?:[,;:(]\s*)?\b(?:compres[oaie]|inclus[oaie]|fornit[oaie] e post[oaie] in opera|fornit[oaie] in opera|dat[oaie] in opera|post[oaie] in opera|in opera|eseguit[oaie]|realizzat[oaie]|ogni onere|per dare|a regola d'arte|e quant'altro|nonch[eé])\b/i)[0];
  t = t.replace(/[\s,.;:–-]+$/, "").trim();
  if (!t) return descrizione.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * La variante che PriMus scrive in fondo, dopo i due punti («…: finestra a 2 ante, a
 * battente»): senza, cinque tipi di serramento diventavano un solo «Serramento» da 314 mq
 * (17/11/2026). Si aggiunge solo se è breve e non ripete il nome.
 */
export function conVariante(nome: string, descrizione: string): string {
  const i = descrizione.lastIndexOf(":");
  if (i < 0) return nome;
  // Dopo la variante il PDF attacca a volte la prima riga di misura («… a battente Da Abaco
  // infissi»): ci si ferma alla prima parola con la maiuscola.
  const variante = descrizione.slice(i + 1).trim().split(/\s(?=[A-ZÀ-Ý][a-zà-ý])/)[0].replace(/[\s,.;–-]+$/, "");
  if (!variante || variante.length > 80 || /^\d+([.,]\d+)?$/.test(variante)) return nome;
  if (normalizzaTesto(nome).includes(normalizzaTesto(variante))) return nome;
  return `${nome} · ${variante}`;
}

/** Quanto pesa lo spessore scritto nella voce, per le scomposizioni a spessore noto. */
const SPESSORE_BASE_CM: Record<string, number> = {
  "ED-INTONACO-PREMISCELATO": 1.5,
  "ED-MASSETTO-SABBIA-CEMENTO": 5,
  "ED-MASSETTO-AUTOLIVELLANTE": 1,
  "ST-PLATEA": 40,
  "ST-CA-SUPERFICIE": 20,
  "ST-CA-LINEARE": 15,
};

/** Lo spessore in cm scritto nella voce («sp. 2 cm», «spessore 20 mm»), se c'è. */
export function spessoreCm(testo: string): number | null {
  const m = testo.match(/\b(?:sp\.?|spess(?:ore|\.)?|di spessore)\s*(?:medio|minimo|finito|complessivo|totale|max\.?|massimo)?\s*(?:di\s*)?(?:cm\.?\s*)?(\d+(?:[.,]\d+)?)(?!\d|[.,]\d)\s*(cm|mm)?(?!\s*\+)/i)
    ?? testo.match(/\b(\d+(?:[.,]\d+)?)\s*(cm|mm)\s+(?:di\s+)?spessore\b/i)
    // «paretine balconate di 15 cm», «muro di 30 cm»: lo spessore detto dopo l'elemento.
    ?? testo.match(/\b(?:paret|mur[oi]\b|sett[oi]\b|solett)\w*[^.,;]*?\bdi\s*(\d+(?:[.,]\d+)?)\s*(cm)\b/i);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  if (!(n > 0)) return null;
  const cm = (m[2] ?? "cm").toLowerCase() === "mm" ? n / 10 : n;
  return cm > 0 && cm <= 30 ? cm : null;
}

/** Dopo «compreso…»: prestazioni, oneri e parole vaghe, non cose da comprare. */
const COMPRESO_NON_MATERIALE = /^(?:posa|messa|post[oaie]|trasport|carico|scarico|scav|allacci|collegament|assistenz|oner|ogni|quant|magister|pulizi|pulitur|sfrid|tagl|sigillatur|fissaggi|montaggi|smontaggi|collaud|prov[ae]|certificaz|dichiaraz|opere|lavor|mano|ponteggi|nolo|noli|smaltim|accessori|minuteri|material|tracc|ripristin|assistenz|regolazion|messa in|avviament|stuccatur|fornitur|il tutto|tutto|e$|ed$|installazion|apposit|pezzi special|egli\b|di\b|\d|diam|nei seguenti|occorrent|necessari)/;

/**
 * I materiali che una voce di fornitura nomina dopo «compreso», «incluso» o
 * «con relativo» (non «completa di»: la porta completa di maniglia arriva con la
 * maniglia): «Fornitura e posa di piatto doccia, compreso piletta e silicone»
 * compra anche la piletta e il silicone (14/11/2026). Le prestazioni («compreso
 * trasporto», «allacciamenti», «ogni onere») restano fuori.
 */
export function materialiCompresi(descrizione: string): string[] {
  const t = descrizione.replace(/\s+/g, " ");
  const m = t.match(/\b(?:compres[oaie]|inclus[oaie]|con relativ[oaie])\b\s*(?:di|il|la|lo|i|gli|le|l')?\s*(.+)$/i);
  if (!m) return [];
  const resto = m[1].split(/[;.](?:\s|$)|\b(?:dat[oaie] in opera|a regola d'arte|per dare|e quant'altro|nonch[eé])\b/i)[0];
  const visti = new Set<string>();
  return resto.split(/\s*,\s*|\s+(?:e|ed)\s+/i)
    .map((x) => x.trim().replace(/^l['’]\s*/i, "").replace(/^(?:il|la|lo|i|gli|le|un|una|uno|relativ[oaie]|necessari[oaie])\s+/i, "").replace(/[\s,.;:]+$/, ""))
    .filter((x) => x.length >= 3 && x.length <= 60 && /[a-zà-ù]{3}/i.test(x) && !COMPRESO_NON_MATERIALE.test(normalizzaTesto(x)))
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
    .filter((x) => { const k = normalizzaTesto(x); if (visti.has(k)) return false; visti.add(k); return true; });
}

function compresiNellaStessaUnita(descrizione: string, um: string): string[] {
  return materialiCompresi(descrizione).filter(nome => aPezzi(um)
    || (um === "mq" && /^(materassin|membran|guain|rete\b|fogli|tel[oi])/i.test(nome))
    || (um === "m" && /^(cav[oi]|tub[oi]|guain|nastr|profil)/i.test(nome)));
}

const ISOLANTI: [RegExp, string][] = [
  [/\beps\b.*\bgrafit|\bgrafit/, "EPS con grafite"], [/\bxps\b|polistirene (?:espanso )?estru/, "XPS"], [/\beps\b|polistirene espanso/, "EPS"],
  [/lana di roccia/, "lana di roccia"], [/lana di vetro/, "lana di vetro"], [/lana minerale/, "lana minerale"],
  [/fibra di legno/, "fibra di legno"], [/sughero/, "sughero"],
];

/**
 * Le misure che la voce scrive entrano nel materiale (14/11/2026): «spessore da
 * progetto» diventa «spessore 10 cm», il formato «da progetto» diventa 60x60, il
 * pannello del cappotto dice di che isolante è e il tassello quanto è lungo.
 * Così l'ordine al fornitore non va completato a mano.
 */
export function specificheDallaVoce(specifiche: string | null, testoVoce: string): string | null {
  if (!specifiche) return specifiche;
  const n = normalizzaTesto(testoVoce);
  const sp = spessoreCm(testoVoce);
  let out = specifiche;
  if (/^inverter\b/.test(n) && /potenza da progetto/i.test(out)) {
    out = "Configurazione di ingressi, tensioni, protezioni e accumulo da confermare con il progetto e il modello scelto.";
  }
  if (/^ventilconvettore\b/.test(n) && /a parete o a pavimento.*potenza da progetto/i.test(out)) {
    out = "Prestazioni come da voce; condizioni di resa, attacchi e regolazione da confermare con il prodotto scelto.";
  }
  if (sp) {
    const cm = sp.toLocaleString("it-IT");
    out = out.replace(/spessore da progetto/i, `spessore ${cm} cm`);
    out = out.replace(/Lunghezza = spessore pannello \+ 40 mm di ancoraggio/i, `Lunghezza almeno ${Math.round(sp * 10 + 40)} mm (pannello ${cm} cm + 40 mm di ancoraggio)`);
    if (/isolamento termico|coibentazion/i.test(testoVoce) && /isolant|eps|xps|lana minerale/i.test(specifiche)) {
      out = out.replace(/spessore\s+\d+(?:[.,]\d+)?\s*(?:cm|mm)\b/i, `spessore ${cm} cm`);
    }
  }
  const isolante = ISOLANTI.find(([re]) => re.test(n))?.[1];
  if (isolante) out = out.replace(/EPS o lana minerale/i, isolante);
  // La potenza dei moduli scritta nella voce («510-580 Wp»), non quella di esempio della libreria.
  const wp = n.match(/potenza modulo\s+(\d{3})\s?wp\b/) ?? n.match(/\b(\d{3})\s?-?\s?(\d{3})\s?wp\b/) ?? n.match(/\b(\d{3})\s?wp\b/);
  if (wp) out = out.replace(/Potenza da progetto \([^)]*Wp\)/i, wp[2] ? `Potenza ${wp[1]}-${wp[2]} Wp` : `Potenza ${wp[1]} Wp`);
  const formato = n.match(/\b(\d+(?:\.\d+)?)\s?x\s?(\d+(?:\.\d+)?)\b/);
  if (formato) out = out.replace(/Formato da progetto/i, `Formato ${formato[1].replace(".", ",")}x${formato[2].replace(".", ",")}`);
  return out;
}

/** Il fattore di spessore di una scomposizione della libreria (o nata dalla libreria) per una voce. */
function scalaSpessore(codiceStandard: string | null | undefined, v: VoceComputo): { fattore?: number; nota: string | null } {
  const base = codiceStandard ? SPESSORE_BASE_CM[codiceStandard] : undefined;
  const sp = base ? spessoreCm(`${v.descrizione_breve} ${v.descrizione_estesa ?? ""}`) : null;
  const fattore = base && sp && Math.abs(sp - base) > 0.01 ? sp / base : undefined;
  const nota = fattore
    ? `Spessore ${sp!.toLocaleString("it-IT")} cm invece di ${base!.toLocaleString("it-IT")}: quantità × ${fattore.toLocaleString("it-IT", { maximumFractionDigits: 2 })}`
    : base && !sp && codiceStandard?.startsWith("ST-") ? `Spessore non scritto nella voce: calcolato su ${base.toLocaleString("it-IT")} cm, da controllare` : null;
  return { fattore, nota };
}

/**
 * La classe del calcestruzzo scritta nella voce, come C28/35: «Rck 28/35» e «C28/35»
 * dicono la stessa cosa (resistenza cilindrica / cubica). Null se non c'è.
 */
export function classeCalcestruzzo(testo: string): string | null {
  const m = testo.match(/\b(?:rck|c)\s?(\d{2,3})\s?\/\s?(\d{2,3})\b/i);
  return m ? `C${m[1]}/${m[2]}` : null;
}

/**
 * Il nome del materiale con quello che la voce dice (14/11/2026): il calcestruzzo
 * prende la sua classe («Calcestruzzo strutturale C28/35»), il blocco del solaio
 * l'altezza del solaio («20+5» → H20x25x38). Così si collega alla voce giusta del
 * listino (Rck 35 / C28/35) e non a una qualsiasi.
 */
export function nomeDallaVoce(nome: string, testoVoce: string): string {
  if (/^(?:ventilconvettore|inverter fotovoltaico)$/i.test(nome)) {
    const installazione = /a cassetta/i.test(testoVoce) ? "a cassetta" : /parete alta/i.test(testoVoce) ? "a parete alta" : /da incasso|ad incasso/i.test(testoVoce) ? "da incasso" : "";
    const nominale = /potenza nominale inverter per l.impianto\s*(\d+(?:[.,]\d+)?)\s*kw/i.exec(testoVoce)
      ?? (/^inverter/i.test(nome) ? /potenza nominale\s*(\d+(?:[.,]\d+)?)\s*kw/i.exec(testoVoce) : null);
    const prestazioni = /^ventilconvettore/i.test(nome) ? [...testoVoce.matchAll(/\b(PT|PF)\s*(?:\(kW\))?\s*=\s*(\d+(?:[.,]\d+)?)/gi)] : [];
    const potenze = nominale ? [`${nominale[1]} kW`] : prestazioni.length
      ? prestazioni.map(m => `${m[1].toUpperCase()} ${m[2]} kW`)
      : [...testoVoce.matchAll(/(\d+(?:[.,]\d+)?)\s*kW\b/gi)].map(m => `${m[1]} kW`);
    const dettagli = [...new Set([installazione, ...potenze, /\bibrido\b/i.test(testoVoce) ? "ibrido" : ""].filter(Boolean))];
    if (dettagli.length) return `${nome} · ${dettagli.join(" · ")}`;
  }
  if (/^calcestruzzo\b/i.test(nome)) {
    const classe = classeCalcestruzzo(testoVoce);
    return classe && !/\bC\d{2,3}\/\d{2,3}\b/.test(nome) ? `${nome} ${classe}` : nome;
  }
  if (/^blocco interposto/i.test(nome)) {
    const solaio = testoVoce.match(/\b(\d{2})\s?\+\s?(\d{1,2})\b/);
    return solaio ? nome.replace(/H\d{2}x/i, `H${solaio[1]}x`) : nome;
  }
  return nome;
}

export interface OpzioniRiconoscimento {
  /** Libreria standard: vale dove l'azienda non ha una scomposizione sua. */
  riserva?: Scomposizione[];
  /** Scomposizioni proposte dall'AI e non ancora approvate. */
  proposteAI?: Scomposizione[];
}

function ricettaAdattaAllIntervento(codice: string | null | undefined, breve: string): boolean {
  if (codice === "FV-INVERTER" && !/^inverter\b/.test(breve.replace(PREFISSO_FORNITURA, ""))) return false;
  if (codice === "ED-MASSETTO-SABBIA-CEMENTO" && /ritiro controllato|asciugamento veloce|presa rapida|autolivellante/.test(breve)) return false;
  if (codice?.includes("IMPERMEAB") && /^(preparazion|regolarizz)/.test(breve)) return false;
  if (codice === "ED-MURATURA-FORATI" && /^(sbruffatur|intonac|pulitur|rasatur|consolid|rinforz|ripristin|regolarizz)/.test(breve)) return false;
  if (codice === "ST-SOLAIO-LATEROCEMENTO" && /^(consolid|rinforz|ripristin|antisfondell|sistema antisfondell)/.test(breve)) return false;
  return true;
}

export function classificaVoce(v: VoceComputo, scomposizioni: Scomposizione[], opzioni: OpzioniRiconoscimento = {}): ClassificazioneVoce {
  // L'abbreviazione cambia solo il riconoscimento: la provenienza conserva il testo del PDF.
  if (/^f\.?\s*p\.?\s*o\.?(?:\s|$)/i.test(v.descrizione_breve)) {
    v = { ...v, descrizione_breve: v.descrizione_breve.replace(/^f\.?\s*p\.?\s*o\.?\s*(?:di\s+)?/i, "Fornitura e posa di ") };
  }
  if (v.is_included === false) return { tipo: "esclusa", causa: "tolta", motivo: "Voce tolta dal computo" };
  if (v.is_sicurezza) return { tipo: "esclusa", causa: "sicurezza", motivo: "Oneri della sicurezza: non sono materiali da ordinare" };
  if (v.is_detrazione) return { tipo: "esclusa", causa: "detrazione", motivo: "Voce in detrazione" };
  const q = Number(v.quantita ?? 0);
  if (!(q > 0)) return { tipo: "esclusa", causa: "quantita_mancante", motivo: "Quantità zero o mancante" };

  const esplicito = prodottoEsplicito(v);
  if (esplicito && !SOLO_POSA.test(normalizzaTesto(v.descrizione_breve))
    && !MATERIALE_DEL_COMMITTENTE.test(normalizzaTesto(`${v.descrizione_breve} ${v.descrizione_estesa ?? ""}`))) {
    return { tipo: "fornitura", ...esplicito, compresi: [] };
  }

  const testo = testoVoce(v);
  const datiVoce = { codice: v.codice_prezzario, codiceTariffa: v.codice_tariffa, codiceVoce: v.codice_voce, testo, unita: v.unita_misura };
  const testa = testaVoce(v.descrizione_breve);
  const breveN = normalizzaTesto(v.descrizione_breve);
  let s = trovaScomposizione(scomposizioni, datiVoce);
  const perCodiceAzienda = !!s && punteggioScomposizione(s, datiVoce) >= 900;
  // Una ricetta dell'azienda nata dalla libreria, presa per parole chiave, vale solo se la
  // parola sta nell'oggetto della voce (vedi testaVoce). Le ricette scritte dall'azienda no.
  // Con una breve corta («Muri in c.a.») l'opera la dice l'estesa: lì la regola non vale.
  const breveCompleta = breveN.length >= 25;
  if (s && !perCodiceAzienda && s.codice_standard && (!ricettaAdattaAllIntervento(s.codice_standard, breveN) || (breveCompleta && !chiaveInTesta(s, testa)))) s = null;
  // Un sovrapprezzo («…: sovrapprezzo per ogni cm in più di spessore») non è un'altra
  // superficie: a Genzano 27.488 mq×cm diventavano 28.862 mq di pannelli e 169.877 tasselli.
  if (!perCodiceAzienda && SOVRAPPREZZO.test(breveN)) {
    return { tipo: "esclusa", causa: "sovrapprezzo", motivo: "Sovrapprezzo: i materiali sono già nella voce principale" };
  }
  if (s) {
    const perCodice = punteggioScomposizione(s, datiVoce) >= 900;
    // Una scomposizione dell'azienda nata dalla libreria (anche ricordata da «Genera dal
    // computo») scala con lo spessore come la libreria.
    const { fattore, nota } = scalaSpessore(s.codice_standard, v);
    return { tipo: "scomposta", scomposizione: s, fonte: perCodice ? "scomposizione_codice" : "scomposizione", fattore, nota };
  }

  const breve = normalizzaTesto(v.descrizione_breve);
  // Le esclusioni esplicite di prestazioni non trasformano una fornitura
  // in un noleggio. Limitiamo la rimozione a elenchi di prestazioni noti.
  const prestazioniNegate = /\b(?:nessun[ao]?|senza)\s+(?:posa|manodopera|mano d.opera|nolo|noleggio)(?:\s*(?:,|e|o|né)\s*(?:posa|manodopera|mano d.opera|nolo|noleggio))*\b/gi;
  const testoClassificazione = normalizzaTesto(`${v.descrizione_breve} ${v.descrizione_estesa ?? ""}`.replace(prestazioniNegate, " "));
  // «Rimozione e rifacimento di intonaco»: si toglie e si rifà, il materiale nuovo si compra.
  if (SENZA_MATERIALI.test(breve) && !RIFACIMENTO.test(breve)) return { tipo: "esclusa", causa: "demolizione", motivo: "Demolizione, rimozione, scavo o trasporto: nessun materiale da comprare" };
  for (const { re, motivo, causa } of NON_MATERIALI) if (re.test(testoClassificazione)) return { tipo: "esclusa", causa, motivo };
  const um = normalizzaUnita(v.unita_misura);
  if (um === "h") return { tipo: "esclusa", causa: "manodopera", motivo: "Manodopera (a ore)" };
  if (SOLO_POSA.test(breve)) return { tipo: "esclusa", causa: MATERIALE_DEL_COMMITTENTE.test(testoClassificazione) ? "committente" : "solo_posa", motivo: MATERIALE_DEL_COMMITTENTE.test(testoClassificazione) ? "Solo posa: il materiale lo fornisce il committente" : "Solo posa: il materiale non è da comprare" };
  if (MATERIALE_DEL_COMMITTENTE.test(testoClassificazione)) return { tipo: "esclusa", causa: "committente", motivo: "Materiale fornito dal committente: si fa solo la posa" };

  const prefisso = PREFISSO_FORNITURA.exec(breve);
  const resto = prefisso ? breve.slice(prefisso[0].length) : breve;
  const conPosa = (!!prefisso && CON_POSA.test(prefisso[0])) || /\b(?:post[oaie]|dat[oaie]|mess[oaie]) in opera\b/.test(breve);
  const fornitura = (): ClassificazioneVoce => ({
    tipo: "fornitura",
    nome: conVariante(nomeMateriale(v.descrizione_breve), v.descrizione_breve),
    nota: conPosa ? "Posa e manodopera della voce escluse: si compra solo il materiale" : null,
    // Un prodotto su misura (serramento, avvolgibile…) arriva con i suoi accessori: «compresa maniglia»
    // non è un acquisto a parte, e «uno per m²» di maniglie non ha senso (17/11/2026).
    // Un accessorio citato senza una quantità propria non pesa quanto la fornitura:
    // 3.420 kg di rete non sono anche 3.420 kg di distanziatori e di legature.
    compresi: SU_MISURA_A_SUPERFICIE.test(normalizzaTesto(nomeMateriale(v.descrizione_breve)))
      || SU_MISURA_A_SUPERFICIE.test(normalizzaTesto(testaVoce(v.descrizione_breve, 1).join(" ")))
      || APPARECCHIO_COMPLETO.test(resto) ? [] : compresiNellaStessaUnita(v.descrizione_breve, um),
  });
  const fornituraPossibile = UNITA_MATERIALE.has(um) && !v.a_corpo;
  // «Fornitura di…» senza posa: è il materiale, la libreria non aggiunge collanti o accessori.
  if (fornituraPossibile && prefisso && !conPosa && !LAVORAZIONE_DOPO_FORNITURA.test(resto)) return fornitura();

  // La libreria standard, dove l'azienda non ha una scomposizione sua: si guarda la
  // descrizione breve (l'estesa elenca spesso lavorazioni compre­se che ingannerebbero).
  const breveConsiderato = breve.length >= 25 ? breve : normalizzaTesto(`${v.descrizione_breve} ${(v.descrizione_estesa ?? "").slice(0, 160)}`);
  // Se la breve non basta («Muri in c.a.», «Platea di fondazione»), si guarda anche
  // l'estesa: «compreso calcestruzzo, ferro, casseformi» dice di che opera si tratta.
  // Solo ricette con la parola chiave nell'oggetto della voce, e niente per gli accessori.
  const ricettaPertinente = (r: Scomposizione) => {
    const codice = r.codice_standard ?? r.id;
    // Il supporto nominato non è un'opera da costruire: consolidare un solaio non lo rifà.
    if (!ricettaAdattaAllIntervento(codice, breve)) return false;
    return !breveCompleta || chiaveInTesta(r, testa);
  };
  const riserva = ACCESSORI_DI.test(testa.join(" ")) ? [] : (opzioni.riserva ?? []).filter(ricettaPertinente);
  const standard = riserva.length
    ? trovaScomposizione(riserva, { testo: breveConsiderato, unita: v.unita_misura })
      ?? (v.descrizione_estesa && !prefisso
        ? trovaScomposizione(riserva, { testo: normalizzaTesto(`${v.descrizione_breve} ${v.descrizione_estesa.slice(0, 400)}`), unita: v.unita_misura })
        : null)
    : null;
  if (standard) {
    const { fattore, nota } = scalaSpessore(standard.id, v);
    return { tipo: "scomposta", scomposizione: standard, fonte: "libreria_standard", fattore, nota };
  }

  if (fornituraPossibile) {
    const documentato = prodottoDaVoceDocumentata(v);
    if (documentato) return { tipo: "fornitura", ...documentato, compresi: [] };
    if (/^(?:isolamento termico|coibentazione)/.test(resto) && /pannell/.test(resto) && um === "mq") {
      const materiale = ISOLANTI.find(([re]) => re.test(resto))?.[1];
      return { tipo: "fornitura", nome: `Pannello isolante${materiale ? ` ${materiale}` : ""}`, compresi: [],
        nota: "Superficie netta dal computo: confermare prodotto, spessore, formato e sfrido prima dell'acquisto." };
    }
    // Un sistema di motorizzazione contato a pezzi è acquistabile come kit completo.
    // I cavi e gli accessori compresi non hanno quantità autonome nel documento.
    if (aPezzi(um) && /^sistema (?:per|di) apertura e chiusura (?:di )?(?:avvolgibili|tapparelle)\b/.test(resto)
      && /\b(?:rotore|motore|puleggia)\b/.test(resto)) {
      return { tipo: "fornitura", nome: nomeMateriale(v.descrizione_breve), compresi: [],
        nota: "Sistema completo contato a pezzi: posa esclusa dall'acquisto. Accessori e cablaggi compresi nel kit, senza quantità aggiuntive inventate." };
    }
    if (prefisso && !LAVORAZIONE_DOPO_FORNITURA.test(resto)) return fornitura();
    if (!prefisso && (FORNITURA_DIRETTA.test(resto) || (aPezzi(um) && PRODOTTO_FV_CONTATO.test(resto)))) return fornitura();
  }
  const ai = opzioni.proposteAI?.length
    ? trovaScomposizione(opzioni.proposteAI.map((x) => ({ ...x, attiva: true })), datiVoce)
    : null;
  if (ai) return { tipo: "scomposta", scomposizione: ai, fonte: "proposta_ai" };
  if ((v.a_corpo || um === "a corpo") && /^(?:quadro elettrico|kit|accessori)/.test(resto)) {
    return { tipo: "fornitura", nome: nomeMateriale(v.descrizione_breve), unita: "lotto", compresi: [],
      nota: "Lotto a corpo da completare: verificare schema, componenti e inclusioni prima dell'acquisto." };
  }
  return { tipo: "senza_scomposizione" };
}

// ─── Generazione ───────────────────────────────────────────────────────────

/** La fonte meno sicura fra le parti sommate decide la sicurezza della riga. */
function fonteRiga(ps: { fonte: FonteMateriale; nota: string | null }[]): Pick<RigaDistintaCalcolata, "fonte" | "affidabilita" | "proposta_ai" | "note"> {
  let fonte = ps[0].fonte;
  for (const p of ps) if (AFFIDABILITA_FONTE[p.fonte] < AFFIDABILITA_FONTE[fonte]) fonte = p.fonte;
  return {
    fonte,
    affidabilita: AFFIDABILITA_FONTE[fonte],
    proposta_ai: fonte === "proposta_ai",
    note: [...new Set(ps.map((p) => p.nota).filter((n): n is string => !!n))],
  };
}

interface Parte {
  descrizione: string;
  specifiche: string | null;
  unita: string;
  netta: number;
  conSfrido: number;
  sfrido: number;
  origine: "computo" | "planimetria";
  provenienza: OrigineRiga;
  categoria: string | null;
  article_template_id: string | null;
  supplier_id: string | null;
  scomposizione_id: string | null;
  computo_voce_id: string | null;
  documento_id: string | null;
  documento: string | null;
  locale: string | null;
  phase_id: string | null;
  fonte: FonteMateriale;
  nota: string | null;
}

/** Componenti che scalano con lo spessore: i materiali a peso o volume, non i profili. */
const SCALA_CON_SPESSORE = new Set(["kg", "mc", "l", "q", "t"]);
/** Primer, fissativi e fondi si danno sulla superficie: lo spessore non li cambia. */
const SOLO_SUPERFICIE = /^(?:primer|fissativ|fondo)/;

function categoriaVoce(v: VoceComputo): string | null {
  return v.categoria || v.super_categoria || v.capitolo_nome || null;
}

function partiDaComponenti(
  s: Scomposizione,
  quantitaBase: number,
  base: Omit<Parte, "descrizione" | "specifiche" | "unita" | "netta" | "conSfrido" | "sfrido" | "provenienza" | "categoria" | "article_template_id" | "supplier_id" | "scomposizione_id">,
  provenienza: (q: number) => OrigineRiga,
  categoriaRiserva: string | null,
  fattoreSpessore?: number,
  testoVoce?: string,
): Parte[] {
  return s.componenti
    .filter((c) => Number(c.quantita_per_unita) > 0 && c.descrizione.trim())
    .map((c) => {
      const scala = fattoreSpessore && SCALA_CON_SPESSORE.has(normalizzaUnita(c.unita_misura)) && !SOLO_SUPERFICIE.test(normalizzaTesto(c.descrizione)) ? fattoreSpessore : 1;
      const netta = quantitaBase * Number(c.quantita_per_unita) * scala;
      const sfrido = Math.max(0, Number(c.sfrido_percentuale ?? 0));
      const conSfrido = netta * (1 + sfrido / 100);
      return {
        ...base,
        descrizione: testoVoce ? nomeDallaVoce(c.descrizione.trim(), testoVoce) : c.descrizione.trim(),
        specifiche: testoVoce ? specificheDallaVoce(c.specifiche?.trim() || null, testoVoce) : c.specifiche?.trim() || null,
        unita: normalizzaUnita(c.unita_misura),
        netta,
        conSfrido,
        sfrido,
        provenienza: provenienza(conSfrido),
        categoria: c.categoria || s.categoria || categoriaRiserva,
        article_template_id: c.article_template_id ?? null,
        supplier_id: c.supplier_id ?? null,
        // La libreria standard non è una riga del database: non si collega.
        scomposizione_id: base.fonte === "libreria_standard" ? null : s.id,
        // La nota sullo spessore vale solo per i componenti che ne seguono la quantità.
        nota: fattoreSpessore && scala === 1 ? null : base.nota,
      };
    });
}

export function generaDistinta(input: {
  voci: VoceComputo[];
  scomposizioni: Scomposizione[];
  /** Libreria standard e proposte dell'AI (vedi OpzioniRiconoscimento). */
  riserva?: Scomposizione[];
  proposteAI?: Scomposizione[];
  conteggi?: ConteggioConfermato[];
  /** In quale fase va il materiale di una voce (di solito dal capitolo/categoria). */
  faseVoce?: (v: VoceComputo) => string | null;
}): RisultatoDistinta {
  const attive = input.scomposizioni.filter((s) => s.attiva);
  const parti: Parte[] = [];
  const escluse: VoceEsclusa[] = [];
  const avvisi: AvvisoDistinta[] = [];
  const senzaScomposizione: VoceComputo[] = [];

  // Lo spessore dei sovrapprezzi «per ogni cm in più» entra nella voce principale (17/11/2026).
  const tutte = applicaSovrapprezziSpessore(input.voci).map(preparaQuantitaAcquisto);
  // La testa di ogni voce: per non ricomprare un componente che il computo ha già come voce sua.
  const teste = tutte.map((x) => testaVoce(x.descrizione_breve, 2));
  for (const [i, v] of tutte.entries()) {
    const c = classificaVoce(v, attive, { riserva: input.riserva, proposteAI: input.proposteAI });
    const q = Number(v.quantita ?? 0);
    const codice = v.codice_prezzario || v.codice_tariffa || v.codice_voce || v.numero_ordine || null;
    const fonte: FonteMateriale = c.tipo === "scomposta" ? c.fonte : "fornitura";
    const nota = c.tipo === "scomposta" || c.tipo === "fornitura" ? c.nota ?? null : null;
    const standard = c.tipo === "scomposta" && c.fonte === "libreria_standard" ? c.scomposizione.id : null;
    const origineComputo = (quantita: number, fonteParte: FonteMateriale = fonte, notaParte: string | null = nota): OrigineRiga => ({
      tipo: "computo", voce_id: v.id, codice, descrizione: v.descrizione_breve, quantita_voce: q, unita_voce: v.unita_misura ?? null, quantita,
      fonte: fonteParte, nota: notaParte, ...(standard ? { standard } : {}),
    });
    const base = {
      origine: "computo" as const, computo_voce_id: v.id, documento_id: null as string | null, documento: null as string | null, locale: null as string | null,
      phase_id: input.faseVoce?.(v) ?? null, fonte, nota,
    };
    // Noli, ore e prestazioni (17/11/2026): fuori dai materiali, col perché e la durata. Una ricetta
    // dell'azienda per quella voce vince sempre.
    const servizio = classificaServizio(v);
    if (servizio && (c.tipo !== "scomposta" || (c.fonte !== "scomposizione" && c.fonte !== "scomposizione_codice"))) {
      escluse.push({ voce_id: v.id, codice, descrizione: v.descrizione_breve, quantita: v.quantita ?? null, unita_misura: v.unita_misura ?? null,
        motivo: `${c.tipo === "esclusa" ? `${c.motivo} — ` : ""}${ETICHETTA_SERVIZIO[servizio.tipo]}: ${servizio.nota}` });
    } else if (c.tipo === "esclusa") {
      escluse.push({ voce_id: v.id, codice, descrizione: v.descrizione_breve, quantita: v.quantita ?? null, unita_misura: v.unita_misura ?? null, motivo: c.motivo });
    } else if (c.tipo === "scomposta") {
      // «Incluso nel pacchetto» (17/11/2026): un componente della libreria o dell'AI che una voce vicina
      // del computo fornisce già (il comando dei ventilconvettori, contato a parte: 26+4+2+1) non si
      // ordina due volte. Le scomposizioni dell'azienda restano come sono.
      let scomposizione = c.scomposizione;
      if (c.fonte === "libreria_standard" || c.fonte === "proposta_ai") {
        const vicine = [...tutte.keys()].filter((k) => k !== i && Math.abs(k - i) <= 3 && tutte[k].id !== v.id);
        const tenuti = c.scomposizione.componenti.filter((comp) => {
          const componente = normalizzaTesto(comp.descrizione);
          if (/fotovoltaic/.test(testoVoce(v))) {
            const fase = input.faseVoce?.(v) ?? null;
            const ambito = tutte.filter(w => w.id !== v.id && (!fase || input.faseVoce?.(w) === fase)
              && (w.categoria ?? w.super_categoria ?? "") === (v.categoria ?? v.super_categoria ?? ""));
            const fissaggi = ambito.filter(w => /sistema di montaggio|graffa|morsetto.*(?:centrale|terminale|intermedio)/.test(testoVoce(w)));
            const giaPrevisto = /morsetto.*(?:terminale|intermedio|centrale)/.test(componente)
              ? fissaggi.some(w => /graffa|morsetto/.test(testoVoce(w)))
              : /struttura di fissaggio/.test(componente) && fissaggi.some(w => /profilo|staff/.test(testoVoce(w)));
            if (giaPrevisto) {
              avvisi.push({ tipo: "gia_nel_computo", voce_id: v.id, messaggio: `«${comp.descrizione}» è già nel sistema di montaggio FV del computo: non si aggiunge la quota generica per modulo.` });
              return false;
            }
          }
          // Solo i componenti a pezzi (comandi, valvole, staffe) contro voci a pezzi: il cemento di un
          // massetto resta anche se accanto c'è una «fornitura di cemento».
          if (!aPezzi(comp.unita_misura)) return true;
          const parola = normalizzaTesto(comp.descrizione).split(/[^a-z0-9]+/).find((w) => w.length >= 5 && !PAROLE_VUOTE.has(w));
          // Il prodotto della voce stessa non si toglie mai: due ventilconvettori di taglie diverse uno
          // accanto all'altro sono due prodotti, non un doppione (prova del 17/11/2026).
          if (parola && teste[i][0]?.startsWith(parola.slice(0, 6))) return true;
          const doppia = parola ? vicine.find((k) => aPezzi(tutte[k].unita_misura) && teste[k][0]?.startsWith(parola.slice(0, 6))) : undefined;
          if (doppia == null) return true;
          avvisi.push({ tipo: "gia_nel_computo", voce_id: v.id,
            messaggio: `«${comp.descrizione}» della voce «${v.descrizione_breve.slice(0, 60)}» è già nel computo come voce sua (${tutte[doppia].numero_ordine ?? tutte[doppia].descrizione_breve.slice(0, 40)}): non si conta due volte` });
          return false;
        });
        if (tenuti.length !== c.scomposizione.componenti.length) scomposizione = { ...c.scomposizione, componenti: tenuti };
      }
      parti.push(...partiDaComponenti(scomposizione, q, base, (x) => origineComputo(x), categoriaVoce(v), c.fattore, `${v.descrizione_breve} ${v.descrizione_estesa ?? ""} ${(v.misure ?? []).map(m => m.descrizione ?? "").join(" ")}`));
    } else if (c.tipo === "fornitura") {
      const vmc = /\bN\.\s*(\d+)\s+Deumidificatore\b/i.exec(v.descrizione_breve);
      if (vmc && /recupero del calore/i.test(v.descrizione_breve)) {
        const zona = (v.misure ?? []).map(m => m.descrizione).filter(Boolean).join(" · ");
        const specifiche = `Lotto voce ${v.numero_ordine ?? v.codice_voce ?? ""}${zona ? ` · ${zona}` : ""}; accessori inclusi nella fornitura: completa la distinta senza duplicarli.`;
        parti.push({ ...base, descrizione: "Deumidificatore con rinnovo aria e recupero del calore", specifiche,
          unita: "pz", netta: q * Number(vmc[1]), conSfrido: q * Number(vmc[1]), sfrido: 0,
          provenienza: origineComputo(q * Number(vmc[1])), categoria: categoriaVoce(v),
          article_template_id: null, supplier_id: null, scomposizione_id: null,
          nota: "Lotto VMC da completare: verifica modello e accessori inclusi prima di acquistare i componenti separatamente." });
        const tubi = /\bN\.\s*(\d+)\s+Tubi di distribuzione[^]*?Bobina\s+L\s*(\d+(?:[.,]\d+)?)\s*m/i.exec(v.descrizione_breve);
        if (tubi) parti.push({ ...base, descrizione: "Tubo di distribuzione VMC", specifiche: `Bobina ${tubi[2]} m · lotto voce ${v.numero_ordine ?? ""}${zona ? ` · ${zona}` : ""} · diametri come da voce`,
          unita: "bobina", netta: q * Number(tubi[1]), conSfrido: q * Number(tubi[1]), sfrido: 0,
          provenienza: origineComputo(q * Number(tubi[1])), categoria: categoriaVoce(v),
          article_template_id: null, supplier_id: null, scomposizione_id: null,
          nota: "Lotto VMC: tubi già inclusi nella fornitura, da coordinare con l'affidamento per non comprarli due volte." });
        continue;
      }
      // Formato, spessore, prestazioni scritte nella voce (23/11/2026): chi ordina le vede accanto al nome.
      const caratteristiche = c.specifiche ? [] : caratteristicheTecniche(`${v.descrizione_breve}. ${v.descrizione_estesa ?? ""}`)
        .filter((x) => !normalizzaTesto(c.nome).includes(normalizzaTesto(x)));
      const notaFornitura = caratteristiche.length ? [nota, `Dal computo: ${caratteristiche.join(" · ")}`].filter(Boolean).join(" — ") : nota;
      parti.push({
        ...base,
        nota: notaFornitura,
        descrizione: c.nome,
        specifiche: c.specifiche ?? (/^(?:isolamento termico|coibentazione)/i.test(v.descrizione_breve) ? v.descrizione_breve : null),
        unita: c.unita ?? normalizzaUnita(v.unita_misura),
        netta: q, conSfrido: q, sfrido: 0,
        provenienza: origineComputo(q, fonte, notaFornitura),
        categoria: categoriaVoce(v),
        article_template_id: null, supplier_id: null, scomposizione_id: null,
      });
      // Quello che la voce dice «compreso»: uno per unità della voce, da controllare.
      const notaCompreso = `Compreso nella voce: uno per ${normalizzaUnita(v.unita_misura) || "unità"}, da controllare`;
      for (const nome of c.compresi ?? []) {
        parti.push({
          ...base, fonte: "compreso", nota: notaCompreso,
          descrizione: nome, specifiche: null, unita: normalizzaUnita(v.unita_misura),
          netta: q, conSfrido: q, sfrido: 0,
          provenienza: origineComputo(q, "compreso", notaCompreso),
          categoria: categoriaVoce(v),
          article_template_id: null, supplier_id: null, scomposizione_id: null,
        });
      }
    } else {
      senzaScomposizione.push(v);
      avvisi.push({
        tipo: "senza_scomposizione", voce_id: v.id,
        messaggio: `«${v.descrizione_breve}» (${q} ${v.unita_misura ?? ""}): manca la scomposizione in materiali`.replace(/\s+\)/, ")"),
      });
    }
  }

  for (const k of input.conteggi ?? []) {
    if (/^(?:A\$C[\dA-F]+|\*U\d+)$/i.test((k.descrizione_legenda || k.simbolo).trim())) {
      avvisi.push({ tipo: "conteggio_senza_scomposizione", conteggio_id: k.id, messaggio: `«${k.simbolo}»: classifica il blocco anonimo prima di proporre materiali.` }); continue;
    }
    const q = Number(k.quantita);
    if (!(q > 0)) continue;
    const testo = normalizzaTesto(`${k.simbolo} ${k.descrizione_legenda ?? ""}`);
    const unita = normalizzaUnita(k.unita ?? "pz");
    // Una lunghezza (m) trova solo le scomposizioni a metro o senza unità;
    // i pezzi si riconoscono come prima.
    const s = (k.scomposizione_id && attive.find((x) => x.id === k.scomposizione_id))
      || trovaScomposizione(attive, { codice: k.simbolo, testo, unita: unita === "m" ? "m" : null });
    const provenienza = (quantita: number): OrigineRiga => ({
      tipo: "planimetria", conteggio_id: k.id, documento_id: k.documento_id ?? null, documento: k.documento_nome ?? null,
      locale: k.locale ?? null, simbolo: k.simbolo, quantita_simbolo: q, quantita, ...(k.pagina ? { pagina: k.pagina } : {}),
    });
    const base = {
      origine: "planimetria" as const, computo_voce_id: null as string | null, documento_id: k.documento_id ?? null,
      documento: k.documento_nome ?? null, locale: k.locale ?? null, phase_id: k.phase_id ?? null,
      fonte: (s ? "tavola" : "tavola_fornitura") as FonteMateriale, nota: null as string | null,
    };
    if (s) {
      parti.push(...partiDaComponenti(s, q, base, provenienza, null));
    } else {
      // Senza scomposizione il simbolo della legenda è già la cosa da comprare
      // (es. «plafoniera LED 600×600 35 W»): una riga nell'unità del
      // conteggio, pezzi o metri (le lunghezze misurate dal disegno CAD).
      const descrizione = (k.descrizione_legenda || k.simbolo).trim();
      parti.push({
        ...base, descrizione, specifiche: null, unita, netta: q, conSfrido: q, sfrido: 0,
        provenienza: provenienza(q), categoria: null, article_template_id: null, supplier_id: null, scomposizione_id: null,
      });
      avvisi.push({
        tipo: "conteggio_senza_scomposizione", conteggio_id: k.id,
        messaggio: unita === "m"
          ? `«${k.simbolo}» (${q} m): presa come fornitura a metri; se è una linea con più materiali (tubo e cavi) serve una scomposizione a metro`
          : `Simbolo «${k.simbolo}» (${q}): preso come fornitura a pezzi; se è un punto (presa, luce…) serve una scomposizione`,
      });
    }
  }

  // Somma delle righe uguali. Le proposte dell'AI non si sommano alle righe sicure:
  // restano a parte, spente, finché un tecnico non le approva.
  const mappa = new Map<string, { parti: Parte[] }>();
  for (const p of parti) {
    const chiave = chiaveRiga(p.descrizione, p.unita, p.specifiche, p.fonte === "proposta_ai" ? `${p.origine}-ai` : p.origine, p.phase_id);
    const g = mappa.get(chiave);
    if (g) g.parti.push(p); else mappa.set(chiave, { parti: [p] });
  }

  const righe: RigaDistintaCalcolata[] = [];
  for (const [chiave, { parti: ps }] of mappa) {
    const prima = ps[0];
    const netta = ps.reduce((s, p) => s + p.netta, 0);
    const conSfrido = ps.reduce((s, p) => s + p.conSfrido, 0);
    const sfridi = new Set(ps.map((p) => p.sfrido));
    const unico = <T,>(f: (p: Parte) => T): T | null => {
      const valori = new Set(ps.map(f));
      return valori.size === 1 ? (ps.map(f)[0] ?? null) : null;
    };
    righe.push({
      chiave,
      descrizione: prima.descrizione,
      specifiche: prima.specifiche,
      unita_misura: prima.unita,
      quantita_netta: Math.round(netta * 10000) / 10000,
      quantita_calcolata: arrotondaPerAcquisto(conSfrido, prima.unita),
      sfrido: sfridi.size === 1 ? prima.sfrido : null,
      origine: prima.origine,
      origini: ps.map((p) => p.provenienza),
      computo_voce_id: prima.computo_voce_id,
      scomposizione_id: unico((p) => p.scomposizione_id),
      planimetria_documento_id: unico((p) => p.documento_id),
      planimetria_documento: unico((p) => p.documento),
      locale: unico((p) => p.locale),
      categoria: ps.map((p) => p.categoria).find(Boolean) ?? null,
      article_template_id: ps.map((p) => p.article_template_id).find(Boolean) ?? null,
      supplier_id: ps.map((p) => p.supplier_id).find(Boolean) ?? null,
      phase_id: prima.phase_id,
      ...fonteRiga(ps),
    });
  }

  // Prodotti su misura contati a superficie (17/11/2026): nel computo la superficie dei serramenti è
  // contabile (minimi di fatturazione per vano), non l'area reale né il numero di pezzi.
  for (const r of righe) {
    if (r.unita_misura !== "mq" || !SU_MISURA_A_SUPERFICIE.test(normalizzaTesto(r.descrizione))) continue;
    r.note = [...r.note, "Superficie contabile del computo (con i minimi per vano): ordina dall'abaco dei vani, non da questi m²."];
  }

  // Più disegni o metodi possono rappresentare lo stesso impianto: nessuna somma presentata come acquisto certo.
  for (const r of righe.filter(r => r.origine === "planimetria")) {
    const gruppi = new Set(r.origini.flatMap(o => {
      if (o.tipo !== "planimetria") return [];
      const c = input.conteggi?.find(c => c.id === o.conteggio_id);
      return [JSON.stringify([o.documento_id || o.documento, c?.pagina || 1, c?.metodo || ""])];
    }));
    if (gruppi.size > 1) {
      const verifica: VerificaAcquisto = { stato: "da_verificare", motivi: ["Quantità da più tavole, pagine o metodi: verifica che siano ambiti distinti prima di sommare. Usa il confronto con gli acquisti per scegliere un riscontro."], campi_mancanti: ["ambito_tavole"] };
      r.verifica_acquisto = verifica; r.origini = r.origini.map(o => ({ ...o, verifica_acquisto: verifica }));
    }
  }

  // Stesso materiale sia dal computo sia dalle planimetrie: possibile doppione.
  const senzaOrigine = (r: RigaDistintaCalcolata) => chiaveRiga(r.descrizione, r.unita_misura, r.specifiche, "", r.phase_id);
  const daComputo = new Map(righe.filter((r) => r.origine === "computo").map((r) => [senzaOrigine(r), r]));
  for (const r of righe.filter((x) => x.origine === "planimetria")) {
    const gemella = daComputo.get(senzaOrigine(r));
    if (gemella) {
      const verifica: VerificaAcquisto = { stato: "da_verificare", motivi: ["Materiale presente anche nel computo: confronta le fonti e scegli una sola quantità prima di acquistare."], campi_mancanti: ["origine_quantita"] };
      r.verifica_acquisto = verifica;
      r.origini = r.origini.map(o => ({ ...o, verifica_acquisto: verifica }));
      avvisi.push({
        tipo: "possibile_doppione",
        messaggio: `«${r.descrizione}» viene sia dal computo (${gemella.quantita_calcolata} ${gemella.unita_misura}) sia dalle tavole (${r.quantita_calcolata} ${r.unita_misura}): tieni una sola delle due quantità`,
      });
    }
  }

  righe.sort((a, b) =>
    (a.origine === b.origine ? 0 : a.origine === "computo" ? -1 : 1)
    || (a.categoria ?? "").localeCompare(b.categoria ?? "", "it")
    || a.descrizione.localeCompare(b.descrizione, "it"));

  return { righe: completaVerificheAcquisto(completaMaterialiDaDocumenti(righe, input.voci, tutte), tutte), escluse, avvisi, senzaScomposizione };
}
