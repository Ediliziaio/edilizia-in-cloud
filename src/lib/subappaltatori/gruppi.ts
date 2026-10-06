import { dataPlausibile } from "@/lib/dataPlausibile";

/**
 * Subappaltatori raggruppati (06/10/2026): per lavoro, per zona, per stato del
 * DURC. Una lista sola di ditte diventava un «mappazzone» (Green Energy ne ha
 * 140): si raggruppano come gli operai, che stanno nelle loro squadre.
 *
 * - Lavoro: il «tipo lavori» della scheda è testo libero («Impianto
 *   elettrico», «Impianti elettrici», «Rilievi misure e installazione
 *   serramenti»…): una categoria la riconosce dalle parole chiave; quello che
 *   non riconosce resta come scritto, con le maiuscole sistemate.
 * - Zona: la sigla della provincia tra parentesi nell'indirizzo («(PD)», 135
 *   indirizzi su 137 in Green Energy), e da quella la regione.
 */

export interface Categoria {
  chiave: string;
  etichetta: string;
}

/** Le categorie, nell'ordine in cui si riconoscono: la prima che combacia vince. */
const CATEGORIE: Array<{ chiave: string; etichetta: string; parole: RegExp }> = [
  { chiave: "serramenti", etichetta: "Serramenti e infissi", parole: /serrament|infiss|finestr|persian|tapparell|zanzarier/ },
  { chiave: "fotovoltaico", etichetta: "Fotovoltaico e solare", parole: /fotovolt|solar|pannell[io] (fv|solar)|inverter/ },
  { chiave: "elettrico", etichetta: "Impianti elettrici", parole: /elettric|domotic|illuminaz/ },
  { chiave: "clima", etichetta: "Climatizzazione", parole: /climatizz|condizionat|pompa di calore|pompe di calore/ },
  { chiave: "idraulica", etichetta: "Idraulica e termoidraulica", parole: /idraul|termoidraul|riscaldament|caldai|sanitari/ },
  { chiave: "impermeabilizzazioni", etichetta: "Impermeabilizzazioni", parole: /impermeabil|guaina/ },
  { chiave: "isolamento", etichetta: "Isolamento e cappotti", parole: /isolament|cappott|coibent/ },
  // «\btett» e non «tett»: «architetto» non è un tetto.
  { chiave: "coperture", etichetta: "Tetti e coperture", parole: /\btett[oi]\b|copertur|lattoner/ },
  { chiave: "strutture", etichetta: "Strutture e carpenteria", parole: /carpenter|struttur|metallic|ferro|acciaio|saldat/ },
  { chiave: "murature", etichetta: "Murature e opere edili", parole: /muratur|murari|edil|intonac|massett/ },
  { chiave: "cartongesso", etichetta: "Cartongesso", parole: /cartongess/ },
  { chiave: "pavimenti", etichetta: "Pavimenti e rivestimenti", parole: /paviment|rivestiment|piastrell|parquet/ },
  { chiave: "tinteggiature", etichetta: "Tinteggiature", parole: /tinteg|pittur|verniciat|imbianc/ },
  { chiave: "demolizioni", etichetta: "Demolizioni e scavi", parole: /demoliz|scav|movimento terra|sbancament/ },
  { chiave: "ponteggi", etichetta: "Ponteggi", parole: /ponteg/ },
  { chiave: "noleggi", etichetta: "Noleggi e trasporti", parole: /noleggi|trasport|autoscal|\bgru\b|furgon/ },
  { chiave: "giardini", etichetta: "Giardini e verde", parole: /giardin|verde|potatur/ },
  { chiave: "pulizie", etichetta: "Pulizie", parole: /pulizi/ },
];

export const SENZA_CATEGORIA: Categoria = { chiave: "_senza", etichetta: "Senza tipo di lavoro" };

/** I nomi delle categorie, da suggerire quando si scrive il tipo di lavoro di una ditta nuova. */
export const CATEGORIE_SUGGERITE: readonly string[] = CATEGORIE.map((c) => c.etichetta);

const normalizza = (s: string) =>
  s.toLocaleLowerCase("it").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** La categoria di lavoro dal «tipo lavori» scritto nella scheda. */
export function categoriaLavori(tipo: string | null | undefined): Categoria {
  const t = normalizza(tipo ?? "");
  if (!t) return SENZA_CATEGORIA;
  const trovata = CATEGORIE.find((c) => c.parole.test(t));
  if (trovata) return { chiave: trovata.chiave, etichetta: trovata.etichetta };
  // Non riconosciuta: resta com'è scritta, una volta sola per le varianti di maiuscole.
  const pulito = (tipo ?? "").replace(/\s+/g, " ").trim();
  return { chiave: `libera:${t}`, etichetta: pulito.charAt(0).toLocaleUpperCase("it") + pulito.slice(1) };
}

/** Provincia → [nome, regione]. Le 107 sigle in uso, più quelle sarde soppresse. */
const PROVINCE: Record<string, [string, string]> = {
  TO: ["Torino", "Piemonte"], VC: ["Vercelli", "Piemonte"], NO: ["Novara", "Piemonte"], CN: ["Cuneo", "Piemonte"],
  AT: ["Asti", "Piemonte"], AL: ["Alessandria", "Piemonte"], BI: ["Biella", "Piemonte"], VB: ["Verbano-Cusio-Ossola", "Piemonte"],
  AO: ["Aosta", "Valle d'Aosta"],
  VA: ["Varese", "Lombardia"], CO: ["Como", "Lombardia"], SO: ["Sondrio", "Lombardia"], MI: ["Milano", "Lombardia"],
  BG: ["Bergamo", "Lombardia"], BS: ["Brescia", "Lombardia"], PV: ["Pavia", "Lombardia"], CR: ["Cremona", "Lombardia"],
  MN: ["Mantova", "Lombardia"], LC: ["Lecco", "Lombardia"], LO: ["Lodi", "Lombardia"], MB: ["Monza e Brianza", "Lombardia"],
  BZ: ["Bolzano", "Trentino-Alto Adige"], TN: ["Trento", "Trentino-Alto Adige"],
  VR: ["Verona", "Veneto"], VI: ["Vicenza", "Veneto"], BL: ["Belluno", "Veneto"], TV: ["Treviso", "Veneto"],
  VE: ["Venezia", "Veneto"], PD: ["Padova", "Veneto"], RO: ["Rovigo", "Veneto"],
  UD: ["Udine", "Friuli-Venezia Giulia"], GO: ["Gorizia", "Friuli-Venezia Giulia"], TS: ["Trieste", "Friuli-Venezia Giulia"],
  PN: ["Pordenone", "Friuli-Venezia Giulia"],
  IM: ["Imperia", "Liguria"], SV: ["Savona", "Liguria"], GE: ["Genova", "Liguria"], SP: ["La Spezia", "Liguria"],
  PC: ["Piacenza", "Emilia-Romagna"], PR: ["Parma", "Emilia-Romagna"], RE: ["Reggio Emilia", "Emilia-Romagna"],
  MO: ["Modena", "Emilia-Romagna"], BO: ["Bologna", "Emilia-Romagna"], FE: ["Ferrara", "Emilia-Romagna"],
  RA: ["Ravenna", "Emilia-Romagna"], FC: ["Forlì-Cesena", "Emilia-Romagna"], RN: ["Rimini", "Emilia-Romagna"],
  MS: ["Massa-Carrara", "Toscana"], LU: ["Lucca", "Toscana"], PT: ["Pistoia", "Toscana"], FI: ["Firenze", "Toscana"],
  LI: ["Livorno", "Toscana"], PI: ["Pisa", "Toscana"], AR: ["Arezzo", "Toscana"], SI: ["Siena", "Toscana"],
  GR: ["Grosseto", "Toscana"], PO: ["Prato", "Toscana"],
  PG: ["Perugia", "Umbria"], TR: ["Terni", "Umbria"],
  PU: ["Pesaro e Urbino", "Marche"], AN: ["Ancona", "Marche"], MC: ["Macerata", "Marche"], AP: ["Ascoli Piceno", "Marche"],
  FM: ["Fermo", "Marche"],
  VT: ["Viterbo", "Lazio"], RI: ["Rieti", "Lazio"], RM: ["Roma", "Lazio"], LT: ["Latina", "Lazio"], FR: ["Frosinone", "Lazio"],
  AQ: ["L'Aquila", "Abruzzo"], TE: ["Teramo", "Abruzzo"], PE: ["Pescara", "Abruzzo"], CH: ["Chieti", "Abruzzo"],
  CB: ["Campobasso", "Molise"], IS: ["Isernia", "Molise"],
  CE: ["Caserta", "Campania"], BN: ["Benevento", "Campania"], NA: ["Napoli", "Campania"], AV: ["Avellino", "Campania"],
  SA: ["Salerno", "Campania"],
  FG: ["Foggia", "Puglia"], BA: ["Bari", "Puglia"], TA: ["Taranto", "Puglia"], BR: ["Brindisi", "Puglia"],
  LE: ["Lecce", "Puglia"], BT: ["Barletta-Andria-Trani", "Puglia"],
  PZ: ["Potenza", "Basilicata"], MT: ["Matera", "Basilicata"],
  CS: ["Cosenza", "Calabria"], CZ: ["Catanzaro", "Calabria"], RC: ["Reggio Calabria", "Calabria"], KR: ["Crotone", "Calabria"],
  VV: ["Vibo Valentia", "Calabria"],
  TP: ["Trapani", "Sicilia"], PA: ["Palermo", "Sicilia"], ME: ["Messina", "Sicilia"], AG: ["Agrigento", "Sicilia"],
  CL: ["Caltanissetta", "Sicilia"], EN: ["Enna", "Sicilia"], CT: ["Catania", "Sicilia"], RG: ["Ragusa", "Sicilia"],
  SR: ["Siracusa", "Sicilia"],
  SS: ["Sassari", "Sardegna"], NU: ["Nuoro", "Sardegna"], CA: ["Cagliari", "Sardegna"], OR: ["Oristano", "Sardegna"],
  SU: ["Sud Sardegna", "Sardegna"], CI: ["Carbonia-Iglesias", "Sardegna"], VS: ["Medio Campidano", "Sardegna"],
  OG: ["Ogliastra", "Sardegna"], OT: ["Olbia-Tempio", "Sardegna"],
};

export interface Zona {
  /** Sigla della provincia, «PD». */
  provincia: string;
  nomeProvincia: string;
  regione: string;
}

export const ZONA_NON_INDICATA = "Zona non indicata";

/** La zona dalla sigla della provincia tra parentesi nell'indirizzo: «Via Roma 1, 35100 Padova (PD)». */
export function zonaDa(indirizzo: string | null | undefined): Zona | null {
  const m = (indirizzo ?? "").match(/\(\s*([A-Za-z]{2})\s*\)/);
  if (!m) return null;
  const sigla = m[1].toUpperCase();
  const voce = PROVINCE[sigla];
  return voce ? { provincia: sigla, nomeProvincia: voce[0], regione: voce[1] } : null;
}

/** «errata»: una data impossibile, come il 20/02/60930 della demo (un tasto in più nel campo data). */
export type StatoDurc = "ok" | "in_scadenza" | "scaduto" | "mancante" | "errata";

const GIORNO_MS = 86_400_000;

/**
 * Lo stato del DURC a oggi: in scadenza entro 30 giorni; mancante se la data
 * non c'è; errata se la data è impossibile (prima la pagina la diceva «ok»).
 */
export function statoDurc(scadenza: string | null | undefined, oggi: string): { stato: StatoDurc; giorni: number | null } {
  if (!scadenza) return { stato: "mancante", giorni: null };
  if (!dataPlausibile(scadenza)) return { stato: "errata", giorni: null };
  const giorni = Math.round((Date.parse(`${scadenza.slice(0, 10)}T00:00:00Z`) - Date.parse(`${oggi}T00:00:00Z`)) / GIORNO_MS);
  if (Number.isNaN(giorni)) return { stato: "errata", giorni: null };
  if (giorni < 0) return { stato: "scaduto", giorni };
  if (giorni <= 30) return { stato: "in_scadenza", giorni };
  return { stato: "ok", giorni };
}

/** Da guardare: DURC scaduto, in scadenza o mancante (senza DURC il subappalto non si può affidare). */
export function durcDaGuardare(scadenza: string | null | undefined, oggi: string): boolean {
  return statoDurc(scadenza, oggi).stato !== "ok";
}

export interface Gruppo<T> {
  chiave: string;
  etichetta: string;
  righe: T[];
}

/**
 * Raggruppa le righe: i gruppi più numerosi prima, a parità in ordine
 * alfabetico; quello «senza» (chiave che comincia con «_») sempre in fondo.
 * Dentro il gruppo, le righe nell'ordine di `confronta`.
 */
export function raggruppa<T>(
  righe: ReadonlyArray<T>,
  gruppoDi: (r: T) => { chiave: string; etichetta: string },
  confronta?: (a: T, b: T) => number,
): Gruppo<T>[] {
  const mappa = new Map<string, Gruppo<T>>();
  for (const r of righe) {
    const g = gruppoDi(r);
    const esistente = mappa.get(g.chiave);
    if (esistente) esistente.righe.push(r);
    else mappa.set(g.chiave, { chiave: g.chiave, etichetta: g.etichetta, righe: [r] });
  }
  const gruppi = [...mappa.values()];
  if (confronta) for (const g of gruppi) g.righe.sort(confronta);
  return gruppi.sort((a, b) => {
    const sa = a.chiave.startsWith("_");
    const sb = b.chiave.startsWith("_");
    if (sa !== sb) return sa ? 1 : -1;
    return b.righe.length - a.righe.length || a.etichetta.localeCompare(b.etichetta, "it");
  });
}

export type VistaDitte = "lavoro" | "zona" | "cantieri" | "elenco";

/**
 * La vista con cui aprire la pagina, dai dati di quell'azienda: per lavoro se
 * almeno metà delle ditte ha il tipo di lavoro, per zona se almeno metà ha la
 * provincia nell'indirizzo, altrimenti l'elenco.
 */
export function vistaPredefinita(ditte: ReadonlyArray<{ tipo_lavori: string | null; indirizzo: string | null }>): VistaDitte {
  if (ditte.length === 0) return "lavoro";
  const conTipo = ditte.filter((d) => categoriaLavori(d.tipo_lavori).chiave !== SENZA_CATEGORIA.chiave).length;
  if (conTipo * 2 >= ditte.length) return "lavoro";
  const conZona = ditte.filter((d) => zonaDa(d.indirizzo)).length;
  if (conZona * 2 >= ditte.length) return "zona";
  return "elenco";
}

/** I documenti del fascicolo di una ditta (subappaltatori_documenti, non sostituiti). */
export interface FascicoloDitta {
  /** Quanti documenti in tutto. */
  n: number;
  /** I tipi presenti: «durc», «visura», «dvr», «pos», «polizza_rc»… */
  tipi: ReadonlySet<string>;
}

export interface Mancanza {
  chiave: "durc" | "visura" | "dvr" | "pos" | "polizza_rc" | "piva";
  /** Come si dice nella pagina: «visura camerale». */
  etichetta: string;
  /** Come si chiede alla ditta: «visura camerale aggiornata». */
  richiesta: string;
}

/**
 * Cosa manca a una ditta per lavorare in subappalto (06/10/2026): i documenti
 * di idoneità (D.Lgs. 81/2008, art. 26 e allegato XVII) e la partita IVA. Il
 * DURC manca se è scaduto, mancante o con una data impossibile (lo dice anche
 * la pastiglia); in scadenza si chiede il rinnovo. Il POS serve solo a chi è
 * su un cantiere.
 */
export function mancanzeDitta(
  d: { durc_scadenza: string | null; piva: string | null },
  fascicolo: FascicoloDitta,
  cantieriInCorso: number,
  oggi: string,
): Mancanza[] {
  const out: Mancanza[] = [];
  const durc = statoDurc(d.durc_scadenza, oggi).stato;
  if (durc !== "ok") {
    out.push({ chiave: "durc", etichetta: durc === "in_scadenza" ? "DURC da rinnovare" : "DURC", richiesta: "DURC in corso di validità" });
  }
  if (!fascicolo.tipi.has("visura")) out.push({ chiave: "visura", etichetta: "visura camerale", richiesta: "visura camerale aggiornata" });
  if (!fascicolo.tipi.has("dvr")) out.push({ chiave: "dvr", etichetta: "DVR", richiesta: "DVR (o autocertificazione per chi non ha dipendenti)" });
  if (cantieriInCorso > 0 && !fascicolo.tipi.has("pos")) out.push({ chiave: "pos", etichetta: "POS", richiesta: "POS del cantiere" });
  if (!fascicolo.tipi.has("polizza_rc")) out.push({ chiave: "polizza_rc", etichetta: "polizza RC", richiesta: "polizza RC in corso" });
  if (!d.piva?.trim()) out.push({ chiave: "piva", etichetta: "P.IVA", richiesta: "partita IVA" });
  return out;
}

/**
 * Il messaggio per chiedere alla ditta quello che manca: oggetto e testo, uguali
 * per email e WhatsApp. Lo manda chi usa l'app, dal suo programma.
 */
export function richiestaDocumenti(
  d: { ragione_sociale: string; responsabile: string | null },
  mancanze: ReadonlyArray<Mancanza>,
  azienda: string,
): { oggetto: string; testo: string } {
  const saluto = d.responsabile?.trim() ? `Buongiorno ${d.responsabile.trim()},` : "Buongiorno,";
  const elenco = mancanze.map((m) => `- ${m.richiesta}`).join("\n");
  return {
    oggetto: `Documenti per il subappalto — ${d.ragione_sociale}`,
    testo: `${saluto}\nper i lavori in subappalto con ${azienda} ci servono:\n${elenco}\n\nPotete mandarceli rispondendo a questo messaggio? Grazie.\n${azienda}`,
  };
}

/**
 * Il numero per WhatsApp («393334455667»), solo se è un cellulare italiano o un
 * numero col prefisso internazionale: un fisso («06 5551234») WhatsApp non ce l'ha.
 */
export function numeroWhatsApp(telefono: string | null | undefined): string | null {
  const t = (telefono ?? "").trim();
  if (!t) return null;
  let cifre = t.replace(/[^\d+]/g, "");
  if (cifre.startsWith("+")) cifre = cifre.slice(1);
  else if (cifre.startsWith("00")) cifre = cifre.slice(2);
  else if (cifre.startsWith("3")) cifre = `39${cifre}`;
  else return null;
  if (cifre.startsWith("39") && !cifre.startsWith("393")) return null; // fisso italiano
  return cifre.length >= 10 && cifre.length <= 15 ? cifre : null;
}
