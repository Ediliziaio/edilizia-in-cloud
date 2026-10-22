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
 * Le righe uguali (stessa descrizione normalizzata, unità e specifiche) si
 * sommano e tengono l'elenco delle voci da cui vengono. Le righe dalle
 * planimetrie restano separate da quelle del computo: la stessa cosa contata
 * due volte sarebbe comprata due volte, e lo segnala un avviso.
 */

export interface VoceComputo {
  id: string;
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
  componenti: ComponenteScomposizione[];
}

export interface ConteggioConfermato {
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

export type OrigineRiga =
  | { tipo: "computo"; voce_id: string; codice: string | null; descrizione: string; quantita_voce: number; unita_voce: string | null; quantita: number }
  | { tipo: "planimetria"; conteggio_id: string; documento_id: string | null; documento: string | null; locale: string | null; simbolo: string; quantita_simbolo: number; quantita: number };

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
  tipo: "senza_scomposizione" | "quantita_mancante" | "possibile_doppione" | "conteggio_senza_scomposizione";
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
  kg: "kg", t: "t", q: "q", l: "l", lt: "l",
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
  dati: { codice?: string | null; codiceTariffa?: string | null; testo: string; unita?: string | null },
): number {
  if (!s.attiva) return 0;
  const codiceS = (s.codice_prezzario ?? "").trim().toUpperCase();
  const codici = [dati.codice, dati.codiceTariffa].map((c) => (c ?? "").trim().toUpperCase()).filter(Boolean);
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
  dati: { codice?: string | null; codiceTariffa?: string | null; testo: string; unita?: string | null },
): Scomposizione | null {
  let migliore: Scomposizione | null = null;
  let max = 0;
  for (const s of scomposizioni) {
    const p = punteggioScomposizione(s, dati);
    if (p > max) { max = p; migliore = s; }
  }
  return migliore;
}

const NON_MATERIALI: { re: RegExp; motivo: string }[] = [
  { re: /\boneri\b|\bsicurezza\b.*\b(psc|cantiere)\b|\bapprestament/, motivo: "Oneri o apprestamenti della sicurezza: non sono materiali da ordinare" },
  { re: /\b(parcell|onorari|progettazion|direzione lavori|coordinamento|collaud|certificaz|asseveraz|relazione tecnica|pratic[ah]e?|spese tecniche|frazionamento|accatastament)/, motivo: "Prestazione tecnica o pratica: non è un materiale" },
  { re: /\b(nolo|noleggio|noli)\b/, motivo: "Nolo: si noleggia, non si acquista" },
  { re: /\b(mano d.?opera|manodopera|operaio (specializzato|qualificato|comune)|ora di (operaio|lavoro))\b/, motivo: "Manodopera" },
  { re: /\b(smaltiment|conferimento a discarica|oneri di discarica|trasporto a (discarica|rifiuto))/, motivo: "Smaltimento o trasporto a discarica" },
  { re: /\b(assistenza muraria|assistenze murarie)\b/, motivo: "Assistenza muraria: lavorazione senza materiali da ordinare" },
];

/** Voci che descrivono una cosa da comprare, non una lavorazione. */
const PREFISSO_FORNITURA = /^(fornitura|f\.?\s?e p\.?|f\.? e p\.? in opera)( e (posa|messa)( in opera)?)?( in opera)?( (di|del|della|dello|dei|degli|delle))?\s+/;
/** Dopo «fornitura e posa di…»: un punto o un impianto è una lavorazione, non un materiale. */
const LAVORAZIONE_DOPO_FORNITURA = /^(punt[oi]|impiant[oi]|realizzazion|esecuzion|opere|lavori|predisposizion|linea|linee|allacci|collegament)/;
const FORNITURA_DIRETTA = /^(cavo|cavi|tubo|tubi|corrugat|guaina|canal(a|ina|ette)|pompa di calore|pompe di calore|modul[oi] (fotovoltaic|fv)|pannell[oi] (fotovoltaic|solar)|inverter|batteri[ae] di accumulo|accumulo|plafonier|lampad|apparecchi[oa]? (illuminant|di illuminazione)|corpo illuminante|quadro elettrico|centrale|rilevator|rivelator|pulsante|segnalatore|interruttore|scatol|cassett|caldaia|radiatore|termosifon|collettore|boiler|scaldacqua|scaldabagno|serbatoio|split|unita (interna|esterna)|climatizzator|ventilconvettor|sanitari|vaso|lavabo|piatto doccia|rubinett|miscelator|serramento|infisso|porta|finestra|tegol|coppi|pannell[oi]|lastr[ae]|profilat|travi?|putrell|tondin|rete elettrosaldata|mattoni|blocchi|laterizi|cemento|calcestruzzo|malta|sabbia|ghiaia|piastrell|gres|parquet|battiscopa|vernice|pittura|idropittura|isolante|lana di (roccia|vetro)|polistirene|eps|xps|membrana|guaina)/;

const UNITA_MATERIALE = new Set(["cad", "pz", "m", "mq", "mc", "kg", "t", "q", "l"]);

export type ClassificazioneVoce =
  | { tipo: "esclusa"; motivo: string }
  | { tipo: "scomposta"; scomposizione: Scomposizione }
  | { tipo: "fornitura" }
  | { tipo: "senza_scomposizione" };

export function classificaVoce(v: VoceComputo, scomposizioni: Scomposizione[]): ClassificazioneVoce {
  if (v.is_included === false) return { tipo: "esclusa", motivo: "Voce tolta dal computo" };
  if (v.is_sicurezza) return { tipo: "esclusa", motivo: "Oneri della sicurezza: non sono materiali da ordinare" };
  if (v.is_detrazione) return { tipo: "esclusa", motivo: "Voce in detrazione" };
  const q = Number(v.quantita ?? 0);
  if (!(q > 0)) return { tipo: "esclusa", motivo: "Quantità zero o mancante" };

  const testo = testoVoce(v);
  const s = trovaScomposizione(scomposizioni, { codice: v.codice_prezzario, codiceTariffa: v.codice_tariffa, testo, unita: v.unita_misura });
  if (s) return { tipo: "scomposta", scomposizione: s };

  const breve = normalizzaTesto(v.descrizione_breve);
  for (const { re, motivo } of NON_MATERIALI) if (re.test(breve) || re.test(testo)) return { tipo: "esclusa", motivo };
  const um = normalizzaUnita(v.unita_misura);
  if (um === "h") return { tipo: "esclusa", motivo: "Manodopera (a ore)" };

  if (UNITA_MATERIALE.has(um) && !v.a_corpo) {
    const prefisso = PREFISSO_FORNITURA.exec(breve);
    const resto = prefisso ? breve.slice(prefisso[0].length) : breve;
    if (prefisso && !LAVORAZIONE_DOPO_FORNITURA.test(resto)) return { tipo: "fornitura" };
    if (!prefisso && FORNITURA_DIRETTA.test(resto)) return { tipo: "fornitura" };
  }
  if (v.a_corpo || um === "a corpo") return { tipo: "esclusa", motivo: "A corpo senza scomposizione: va scomposta per sapere cosa comprare" };
  return { tipo: "senza_scomposizione" };
}

// ─── Generazione ───────────────────────────────────────────────────────────

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
}

function categoriaVoce(v: VoceComputo): string | null {
  return v.categoria || v.super_categoria || v.capitolo_nome || null;
}

function partiDaComponenti(
  s: Scomposizione,
  quantitaBase: number,
  base: Omit<Parte, "descrizione" | "specifiche" | "unita" | "netta" | "conSfrido" | "sfrido" | "provenienza" | "categoria" | "article_template_id" | "supplier_id" | "scomposizione_id">,
  provenienza: (q: number) => OrigineRiga,
  categoriaRiserva: string | null,
): Parte[] {
  return s.componenti
    .filter((c) => Number(c.quantita_per_unita) > 0 && c.descrizione.trim())
    .map((c) => {
      const netta = quantitaBase * Number(c.quantita_per_unita);
      const sfrido = Math.max(0, Number(c.sfrido_percentuale ?? 0));
      const conSfrido = netta * (1 + sfrido / 100);
      return {
        ...base,
        descrizione: c.descrizione.trim(),
        specifiche: c.specifiche?.trim() || null,
        unita: normalizzaUnita(c.unita_misura),
        netta,
        conSfrido,
        sfrido,
        provenienza: provenienza(conSfrido),
        categoria: c.categoria || s.categoria || categoriaRiserva,
        article_template_id: c.article_template_id ?? null,
        supplier_id: c.supplier_id ?? null,
        scomposizione_id: s.id,
      };
    });
}

export function generaDistinta(input: {
  voci: VoceComputo[];
  scomposizioni: Scomposizione[];
  conteggi?: ConteggioConfermato[];
  /** In quale fase va il materiale di una voce (di solito dal capitolo/categoria). */
  faseVoce?: (v: VoceComputo) => string | null;
}): RisultatoDistinta {
  const attive = input.scomposizioni.filter((s) => s.attiva);
  const parti: Parte[] = [];
  const escluse: VoceEsclusa[] = [];
  const avvisi: AvvisoDistinta[] = [];
  const senzaScomposizione: VoceComputo[] = [];

  for (const v of input.voci) {
    const c = classificaVoce(v, attive);
    const q = Number(v.quantita ?? 0);
    const codice = v.codice_prezzario || v.codice_tariffa || v.numero_ordine || null;
    const origineComputo = (quantita: number): OrigineRiga => ({
      tipo: "computo", voce_id: v.id, codice, descrizione: v.descrizione_breve, quantita_voce: q, unita_voce: v.unita_misura ?? null, quantita,
    });
    const base = {
      origine: "computo" as const, computo_voce_id: v.id, documento_id: null as string | null, documento: null as string | null, locale: null as string | null,
      phase_id: input.faseVoce?.(v) ?? null,
    };
    if (c.tipo === "esclusa") {
      escluse.push({ voce_id: v.id, codice, descrizione: v.descrizione_breve, quantita: v.quantita ?? null, unita_misura: v.unita_misura ?? null, motivo: c.motivo });
    } else if (c.tipo === "scomposta") {
      parti.push(...partiDaComponenti(c.scomposizione, q, base, origineComputo, categoriaVoce(v)));
    } else if (c.tipo === "fornitura") {
      parti.push({
        ...base,
        descrizione: v.descrizione_breve.trim(),
        specifiche: null,
        unita: normalizzaUnita(v.unita_misura),
        netta: q, conSfrido: q, sfrido: 0,
        provenienza: origineComputo(q),
        categoria: categoriaVoce(v),
        article_template_id: null, supplier_id: null, scomposizione_id: null,
      });
    } else {
      senzaScomposizione.push(v);
      avvisi.push({
        tipo: "senza_scomposizione", voce_id: v.id,
        messaggio: `«${v.descrizione_breve}» (${q} ${v.unita_misura ?? ""}): manca la scomposizione in materiali`.replace(/\s+\)/, ")"),
      });
    }
  }

  for (const k of input.conteggi ?? []) {
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
      locale: k.locale ?? null, simbolo: k.simbolo, quantita_simbolo: q, quantita,
    });
    const base = {
      origine: "planimetria" as const, computo_voce_id: null as string | null, documento_id: k.documento_id ?? null,
      documento: k.documento_nome ?? null, locale: k.locale ?? null, phase_id: k.phase_id ?? null,
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

  // Somma delle righe uguali.
  const mappa = new Map<string, { parti: Parte[] }>();
  for (const p of parti) {
    const chiave = chiaveRiga(p.descrizione, p.unita, p.specifiche, p.origine, p.phase_id);
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
    });
  }

  // Stesso materiale sia dal computo sia dalle planimetrie: possibile doppione.
  const senzaOrigine = (r: RigaDistintaCalcolata) => chiaveRiga(r.descrizione, r.unita_misura, r.specifiche, "", r.phase_id);
  const daComputo = new Map(righe.filter((r) => r.origine === "computo").map((r) => [senzaOrigine(r), r]));
  for (const r of righe.filter((x) => x.origine === "planimetria")) {
    const gemella = daComputo.get(senzaOrigine(r));
    if (gemella) {
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

  return { righe, escluse, avvisi, senzaScomposizione };
}
