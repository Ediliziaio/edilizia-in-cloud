/**
 * outreach-template — motore di personalizzazione PURO (niente Deno/Supabase).
 * Condiviso tra dispatcher/enqueuer (Deno) e UI (Vite). Testato in vitest.
 *
 *  • Variabili:  {{first_name}}  {{first_name|amico}} (fallback se vuoto/assente)
 *  • Spintax:    {Ciao|Salve|Buongiorno}  → scelta deterministica per seed
 *
 * Lo spintax fa variare i messaggi tra destinatari: meno pattern ripetuti =
 * meno spam. Il seed (es. hash dell'email) rende la scelta stabile per contatto.
 */

export interface TemplateVars { [key: string]: string | null | undefined; }

/** Hash stabile di una stringa → intero non negativo (per seedare lo spintax per-contatto). */
export function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\|\s*([^}]*?))?\s*\}\}/g;
const SPINTAX_RE = /\{([^{}]*\|[^{}]*)\}/g;
/**
 * Blocco condizionale `{{#var}}testo{{/var}}`: il testo compare solo se la
 * variabile ha un valore. Primo uso (16/09/2026): «Ho trovato il vostro
 * contatto sul sito aziendale» nelle email di Edilizia in Cloud, solo a chi un
 * sito ce l'ha — a chi non ce l'ha sarebbe una frase falsa.
 */
const BLOCCO_RE = /\{\{#\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}([\s\S]*?)\{\{\/\s*\1\s*\}\}/g;

/** Sostituisce variabili e spintax. Variabili PRIMA (usano `{{ }}`), poi spintax (`{ }`). */
export function renderTemplate(template: string, vars: TemplateVars = {}, opts: { seed?: number } = {}): string {
  if (!template) return "";

  let out = template.replace(BLOCCO_RE, (_m, key: string, dentro: string) => {
    const v = vars[key];
    return v != null && String(v).trim() ? dentro : "";
  });

  out = out.replace(VAR_RE, (_m, key: string, fallback?: string) => {
    const v = vars[key];
    const val = v == null ? "" : String(v).trim();
    return val || (fallback ?? "").trim();
  });

  let i = 0;
  out = out.replace(SPINTAX_RE, (_m, group: string) => {
    const options = group.split("|");
    const seed = opts.seed ?? 0;
    return options[(seed + i++) % options.length];
  });

  // ripulisce gli artefatti lasciati da variabili vuote
  return out.replace(/[ \t]{2,}/g, " ").replace(/ +([.,;:!?])/g, "$1").trim();
}

/** Elenco delle variabili presenti in un template (per la UI / validazione). */
export function extractVariables(template: string): string[] {
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(VAR_RE.source, "g");
  while ((m = re.exec(template || "")) !== null) found.add(m[1]);
  return [...found];
}

/**
 * htmlToPlainText — deriva una versione text/plain LEGGIBILE da un corpo HTML,
 * pensata per il part `text/plain` del multipart cold (deliverability).
 *
 * A differenza di un semplice strip-tag, QUI i link vengono mantenuti come URL:
 *   <a href="https://x/y">Disiscriviti</a>  →  "Disiscriviti (https://x/y)"
 * Se il testo dell'anchor È già l'URL (o l'anchor è vuoto) si tiene il solo URL,
 * senza duplicare. Questo è importante per il cold: una text-part senza i link
 * (es. disiscrizione, pixel a parte) sembra spam/troncata ai filtri.
 *
 * Pura e deterministica (niente DOM): regex best-effort, output "decent enough",
 * non RFC-perfect. <br>/</p> → newline, entità comuni decodificate, whitespace
 * collassato. Robusta su input vuoto/non-stringa.
 */
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return "";
  let out = String(html)
    // blocchi non testuali: via del tutto (incl. contenuto)
    .replace(/<(script|style|head|title)[\s\S]*?<\/\1>/gi, "")
    // commenti HTML
    .replace(/<!--[\s\S]*?-->/g, "");

  // anchor → "testo (url)" mantenendo l'URL. Se il testo coincide con l'URL
  // (o è vuoto) si tiene solo l'URL per non duplicare.
  out = out.replace(
    /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi,
    (_m, dq, sq, uq, inner) => {
      const url = (dq ?? sq ?? uq ?? "").trim();
      const label = String(inner).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (!url) return label;
      // ignora ancore/azioni non navigabili nel plain (mailto/tel restano utili)
      if (/^(#|javascript:)/i.test(url)) return label;
      if (!label || label === url) return url;
      return `${label} (${url})`;
    },
  );

  return out
    // a-capo strutturali
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    // strippa i tag rimanenti
    .replace(/<[^>]+>/g, "")
    // decodifica entità comuni (numeriche + nominali)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;|&#x0*27;/gi, "'")
    .replace(/&#0*160;/gi, " ")
    // pulizia spazi
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Variabili standard di un contatto marketing. */
/** Parole che smascherano una ragione sociale travestita da nome di persona. */
const FORME_SOCIETARIE =
  /(\bs\.?\s?r\.?\s?l\b|\bs\.?\s?p\.?\s?a\b|\bs\.?\s?n\.?\s?c\b|\bs\.?\s?a\.?\s?s\b|\bsocieta|\bsocietà|\bimpresa\b|\bditta\b|\bcostruzion|\bedil|\bserrament|\binfiss|\bfalegnam|\bofficin|\bgroup\b|\b& ?c\b)/i;

/** Caselle di posta usate come nome: «Buongiorno Info» brucia il contatto. */
const NOMI_DI_CASELLA =
  /^(info|amministrazione|commerciale|ufficio|contatti|contatto|direzione|segreteria|preventivi|acquisti|vendite|staff|mail|posta|admin|sales|office|noreply|no-reply)$/i;

/**
 * Il nome da usare nel saluto — vuoto quando NON è il nome di una persona.
 *
 * Nelle liste comprate il campo `first_name` contiene quasi sempre la ragione
 * sociale: su 7.821 contatti dell'outreach ThermoDMR, 7.268 avevano nome uguale
 * alla ragione sociale. Con `{{first_name}}` nel saluto sarebbe partito
 * «Buongiorno OFFICINE TABARELLI S.R.L.,» al 93% della lista — e un saluto così
 * dice al destinatario, in tre parole, che è un invio automatico.
 *
 * Chi resta senza nome riceve «Buongiorno,»: il motore toglie da solo la virgola
 * orfana e lo spazio doppio (vedi la ripulitura in renderTemplate).
 */
export function nomeSaluto(c: { first_name?: string | null; company_name?: string | null }): string {
  const n = (c.first_name ?? "").trim();
  if (n.length < 2 || n.length > 20) return "";
  if (/[0-9@._\-\/&]/.test(n)) return "";                       // codici, email, sigle
  if (NOMI_DI_CASELLA.test(n)) return "";
  if (FORME_SOCIETARIE.test(n)) return "";
  if (n === n.toUpperCase() && n.length > 3) return "";          // TUTTO MAIUSCOLO = insegna
  const azienda = (c.company_name ?? "").trim().toLowerCase();
  if (azienda && n.toLowerCase() === azienda) return "";
  if (n.split(/\s+/).length > 2) return "";                      // «Marangoni Scale Di Sergio»
  return n;
}

/**
 * Forma giuridica e code della ragione sociale: si taglia dalla prima che
 * compare, se prima c'è un nome. I confini a destra e a sinistra lasciano
 * stare «SASSI» e «SPAZIO».
 */
const CODA_RAGIONE_SOCIALE = new RegExp(
  "(?:^|[\\s,\\-–(])(?:" + [
    "s\\.?\\s?r\\.?\\s?l(?:\\.?\\s?s)?",       // srl, s.r.l., srls
    "s\\.?\\s?a\\.?\\s?p\\.?\\s?a",
    "s\\.?\\s?n\\.?\\s?c",
    "s\\.?\\s?a\\.?\\s?s",
    "s\\.?\\s?p\\.?\\s?a",
    "s\\.\\s?s",                               // s.s. solo col punto
    "s\\.?\\s?c\\.?\\s?a?\\.?\\s?r\\.?\\s?l",  // scarl, scrl
    "soc\\.?\\s?coop",
    "societ(?:a|à)['’]?",
    "unipersonale",
    "con\\s+unico\\s+socio",
    "a\\s+socio\\s+unico",
    "in\\s+liquidazione",
    "ltd", "gmbh", "sagl",
  ].join("|") + ")(?=$|[\\s.,\\-–)])",
  "i",
);

/** «& C.» o «e C.» in fondo: la società di persone «X di Rossi Paolo & C.». */
const E_COMPAGNI = /\s*(?:&|\be)\s*c\.?$/i;

const PARTICELLE = new Set(["di", "del", "dei", "degli", "della", "delle", "dello", "da", "dal", "dalla", "e", "ed", "in", "a", "al", "alla", "per", "con", "su"]);
const APOSTROFATA = /^(dell|dall|nell|all|sull|d|l)(['’])(.+)$/;

// Almeno due lettere, anche separate da punti: «C.M.A.» è un nome.
const haNome = (s: string): boolean => (s.match(/[a-zà-ù]/gi) ?? []).length >= 2;

function pulisciBordi(s: string): string {
  const t = s.replace(/^[\s\-–—,;:·]+/, "").replace(/[\s\-–—,;:·&(]+$/, "");
  // Il punto finale di «Rossi.» sì, quello di una sigla («C.M.A.») no.
  return /[a-zà-ù]{4}\.$/i.test(t) ? t.slice(0, -1) : t;
}

const iniziale = (s: string): string => s.replace(/[a-zà-ù]/, (c) => c.toUpperCase());

function parolaInTitolo(t: string, prima: boolean): string {
  if (/\d/.test(t)) return t;                                          // «3D», «2000»
  if (/[a-zà-ù]\.[a-zà-ù]/i.test(t)) return t.toUpperCase();           // sigle col punto: «C.M.A.»
  if (t.length <= 4 && !/[aeiouàèéìòù]/i.test(t)) return t.toUpperCase(); // sigle senza vocali: «KLC»
  const basso = t.toLowerCase();
  if (!prima && PARTICELLE.has(basso)) return basso;
  const a = APOSTROFATA.exec(basso);
  if (a) return `${prima ? iniziale(a[1]) : a[1]}${a[2]}${a[3].split("-").map(iniziale).join("-")}`;
  return basso.split("-").map(iniziale).join("-");                     // «Pier-Andrea»
}

/**
 * Il nome dell'azienda da scrivere in un oggetto o in una frase: la var `azienda`.
 *
 * Dal registro arrivano ragioni sociali come «ROSSI COSTRUZIONI DI ROSSI PAOLO
 * & C. S.N.C.» o «NERI INFISSI SOCIETA' A RESPONSABILITA' LIMITATA SEMPLIFICATA».
 * Sulle prime email ThermoDMR in coda il 16/09/2026 erano tutte maiuscole il
 * 58% e avevano la forma giuridica il 53%: in un oggetto dicono che l'email è
 * automatica. Qui diventano «Rossi Costruzioni» e «Neri Infissi»:
 * - via forma giuridica, «unipersonale», «in liquidazione» e quel che segue;
 * - via «di Rossi Paolo & C.» delle società di persone. Senza «& C.» il «di»
 *   resta, perché spesso è un luogo («Vetreria di Mestre»);
 * - sopra i 35 caratteri si tiene il primo pezzo prima di una virgola o di un
 *   trattino, se ha almeno due parole («Mario Rossi, Consulente Energetico…»);
 * - tutto maiuscolo o tutto minuscolo diventa «Iniziali Maiuscole», con le
 *   particelle minuscole e le sigle intatte. Un nome scritto a mano resta com'è.
 * Vuota se non resta un nome, o se è un indirizzo o un nome utente («mrossi4»):
 * il chiamante la tratta come ogni variabile vuota.
 */
export function nomeAzienda(ragioneSociale?: string | null): string {
  let s = (ragioneSociale ?? "").replace(/\s+/g, " ").trim();
  if (!haNome(s) || /@|https?:|www\./i.test(s)) return "";

  const forma = CODA_RAGIONE_SOCIALE.exec(s);
  if (forma && haNome(s.slice(0, forma.index))) s = s.slice(0, forma.index);
  s = pulisciBordi(s);

  if (E_COMPAGNI.test(s)) {
    const senza = s.replace(E_COMPAGNI, "");
    const di = senza.toLowerCase().lastIndexOf(" di ");
    const taglio = di > 0 && haNome(senza.slice(0, di)) ? senza.slice(0, di) : senza;
    if (haNome(taglio)) s = pulisciBordi(taglio);
  }

  if (s.length > 35) {
    const primo = pulisciBordi(s.split(/\s*,\s*|\s+[-–—]\s+/)[0]);
    if (primo.split(" ").length >= 2 && haNome(primo)) s = primo;
  }

  if (/^[a-zà-ù]+\d+$/.test(s)) return "";
  if (s === s.toUpperCase() || s === s.toLowerCase()) {
    s = s.split(" ").map((t, i) => parolaInTitolo(t, i === 0)).join(" ");
  }
  // Solo la forma giuridica («S.R.L.»): non c'è un nome da scrivere.
  const soloForma = /^[\s.]*$/.test(s.replace(CODA_RAGIONE_SOCIALE, ""));
  return haNome(s) && !soloForma ? s : "";
}

/**
 * Sigla di provincia → nome. Serve alla personalizzazione geografica
 * dell'outreach (var `zona`, es. «in provincia di Torino»): copia locale e
 * pura delle 107 province italiane, la stessa lista di `it_province` nel
 * database — duplicata qui perché questo modulo non fa query (vedi intestazione).
 */
const NOME_PROVINCIA: Record<string, string> = {
  AG: "Agrigento", AL: "Alessandria", AN: "Ancona", AO: "Aosta", AP: "Ascoli Piceno",
  AQ: "L'Aquila", AR: "Arezzo", AT: "Asti", AV: "Avellino", BA: "Bari", BG: "Bergamo",
  BI: "Biella", BL: "Belluno", BN: "Benevento", BO: "Bologna", BR: "Brindisi", BS: "Brescia",
  BT: "Barletta-Andria-Trani", BZ: "Bolzano", CA: "Cagliari", CB: "Campobasso", CE: "Caserta",
  CH: "Chieti", CL: "Caltanissetta", CN: "Cuneo", CO: "Como", CR: "Cremona", CS: "Cosenza",
  CT: "Catania", CZ: "Catanzaro", EN: "Enna", FC: "Forlì-Cesena", FE: "Ferrara", FG: "Foggia",
  FI: "Firenze", FM: "Fermo", FR: "Frosinone", GE: "Genova", GO: "Gorizia", GR: "Grosseto",
  IM: "Imperia", IS: "Isernia", KR: "Crotone", LC: "Lecco", LE: "Lecce", LI: "Livorno",
  LO: "Lodi", LT: "Latina", LU: "Lucca", MB: "Monza e Brianza", MC: "Macerata", ME: "Messina",
  MI: "Milano", MN: "Mantova", MO: "Modena", MS: "Massa-Carrara", MT: "Matera", NA: "Napoli",
  NO: "Novara", NU: "Nuoro", OR: "Oristano", PA: "Palermo", PC: "Piacenza", PD: "Padova",
  PE: "Pescara", PG: "Perugia", PI: "Pisa", PN: "Pordenone", PO: "Prato", PR: "Parma",
  PT: "Pistoia", PU: "Pesaro e Urbino", PV: "Pavia", PZ: "Potenza", RA: "Ravenna", RC: "Reggio Calabria",
  RE: "Reggio Emilia", RG: "Ragusa", RI: "Rieti", RM: "Roma", RN: "Rimini", RO: "Rovigo",
  SA: "Salerno", SI: "Siena", SO: "Sondrio", SP: "La Spezia", SR: "Siracusa", SS: "Sassari",
  SU: "Sud Sardegna", SV: "Savona", TA: "Taranto", TE: "Teramo", TN: "Trento", TO: "Torino",
  TP: "Trapani", TR: "Terni", TS: "Trieste", TV: "Treviso", UD: "Udine", VA: "Varese",
  VB: "Verbano-Cusio-Ossola", VC: "Vercelli", VE: "Venezia", VI: "Vicenza", VR: "Verona",
  VT: "Viterbo", VV: "Vibo Valentia",
};

/**
 * «in provincia di Torino», o "" se la sigla manca o non è riconosciuta.
 * Sempre in coda a una frase (mai a inizio riga, che romperebbe la
 * maiuscola): vedi gli usi in ThermoDMR (migrazione 20280914000015).
 */
export function zonaDaProvincia(provincia?: string | null): string {
  const nome = NOME_PROVINCIA[(provincia ?? "").trim().toUpperCase()];
  return nome ? `in provincia di ${nome}` : "";
}

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** Il mese in corso a Roma, minuscolo («gennaio»): la var `mese` delle email di riattivazione. */
export function meseCorrente(oggi: Date = new Date()): string {
  const n = Number(new Intl.DateTimeFormat("it-IT", { month: "numeric", timeZone: "Europe/Rome" }).format(oggi));
  return MESI[n - 1] ?? "";
}

export function contactToVars(c: {
  first_name?: string | null; last_name?: string | null;
  company_name?: string | null; email?: string | null; phone?: string | null;
  province?: string | null; region?: string | null; website?: string | null;
}, oggi: Date = new Date()): TemplateVars {
  return {
    first_name: c.first_name ?? "",
    last_name: c.last_name ?? "",
    company_name: c.company_name ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    // Da usare nei saluti al posto di first_name: vedi nomeSaluto().
    nome: nomeSaluto(c),
    // «Rossi Costruzioni»: la ragione sociale ripulita, per oggetti e frasi. Vedi nomeAzienda().
    azienda: nomeAzienda(c.company_name),
    // "in provincia di X", o "" — vedi zonaDaProvincia().
    zona: zonaDaProvincia(c.province),
    // «Lombardia». La forma bilingue «Trentino-Alto Adige/Südtirol» si ferma alla barra.
    regione: (c.region ?? "").split("/")[0].trim(),
    // «gennaio»: il mese dell'invio (Marketing Edile, riattivazione a 90 giorni).
    mese: meseCorrente(oggi),
    // «rossiserramenti.it», o "" se il sito non c'è: usata nei blocchi {{#sito}}…{{/sito}}.
    sito: sitoDa(c.website),
  };
}

/** Il dominio del sito, senza protocollo, «www.» e percorso. Vuoto se non sembra un sito. */
export function sitoDa(website?: string | null): string {
  const t = (website ?? "").trim().toLowerCase()
    .replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[/?#\s]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(t) ? t : "";
}
