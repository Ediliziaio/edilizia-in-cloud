/**
 * Normalizzazione dei dati che arrivano dai documenti — componente comune (§7.2).
 *
 * Puro: niente browser, niente Deno, niente database. Lo usano il gestionale,
 * le edge function e i test, e le regole SQL gemelle (`acquisti_numero_documento`,
 * `partner_tax_key`) devono dare lo stesso risultato: lo controlla
 * `src/test/logic/acquistiCollegamentiSql.test.ts`.
 *
 * Il principio: normalizzare vuol dire rendere confrontabile, NON indovinare.
 * Quando un dato non si capisce si restituisce null, mai un valore «probabile».
 */

// ─── Identificativi fiscali ──────────────────────────────────────────────────

/** Solo lettere e cifre, maiuscole. */
export function soloAlfanumerico(v: string | null | undefined): string {
  return String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * La chiave con cui si confrontano partite IVA e codici fiscali: identica a
 * `public.partner_tax_key` nel database. Il prefisso «IT» si toglie solo
 * davanti a 11 cifre (una P.IVA italiana); una P.IVA estera tiene il suo paese,
 * così «DE123456789» e «123456789» restano diverse.
 */
export function chiaveFiscale(v: string | null | undefined): string {
  const x = soloAlfanumerico(v);
  return /^IT\d{11}$/.test(x) ? x.slice(2) : x;
}

/** Carattere di controllo della partita IVA italiana (algoritmo di Luhn modificato). */
export function pivaItalianaValida(v: string): boolean {
  if (!/^\d{11}$/.test(v)) return false;
  if (/^0{11}$/.test(v)) return false;
  let s = 0;
  for (let i = 0; i < 10; i++) {
    const n = Number(v[i]);
    if (i % 2 === 0) s += n;
    else s += n * 2 > 9 ? n * 2 - 9 : n * 2;
  }
  return (10 - (s % 10)) % 10 === Number(v[10]);
}

const DISPARI_CF: Record<string, number> = {
  "0": 1, "1": 0, "2": 5, "3": 7, "4": 9, "5": 13, "6": 15, "7": 17, "8": 19, "9": 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
  N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};

/** Codice fiscale di una persona (16 caratteri) col carattere di controllo giusto. */
export function codiceFiscalePersonaValido(v: string): boolean {
  if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(v)) return false;
  let s = 0;
  for (let i = 0; i < 15; i++) {
    const c = v[i];
    if (i % 2 === 0) s += DISPARI_CF[c];
    else s += /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 65;
  }
  return String.fromCharCode(65 + (s % 26)) === v[15];
}

/**
 * Formati delle partite IVA UE (VIES). Si controlla la FORMA, non l'esistenza:
 * l'esistenza la dice solo il VIES, e qui non si chiama nessuno.
 */
const FORMATI_UE: Record<string, RegExp> = {
  AT: /^U\d{8}$/, BE: /^[01]\d{9}$/, BG: /^\d{9,10}$/, CY: /^\d{8}[A-Z]$/, CZ: /^\d{8,10}$/,
  DE: /^\d{9}$/, DK: /^\d{8}$/, EE: /^\d{9}$/, EL: /^\d{9}$/, GR: /^\d{9}$/, ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/,
  FI: /^\d{8}$/, FR: /^[A-HJ-NP-Z0-9]{2}\d{9}$/, HR: /^\d{11}$/, HU: /^\d{8}$/, IE: /^\d[A-Z0-9+*]\d{5}[A-Z]{1,2}$/,
  LT: /^(\d{9}|\d{12})$/, LU: /^\d{8}$/, LV: /^\d{11}$/, MT: /^\d{8}$/, NL: /^\d{9}B\d{2}$/,
  PL: /^\d{10}$/, PT: /^\d{9}$/, RO: /^\d{2,10}$/, SE: /^\d{12}$/, SI: /^\d{8}$/, SK: /^\d{10}$/,
  SM: /^\d{5}$/, CH: /^(CHE)?\d{9}(MWST|TVA|IVA)?$/,
};

export interface IdentificativoFiscale {
  /** Paese ISO a due lettere (IT se non indicato e il numero ha la forma italiana). */
  paese: string | null;
  /** Il numero senza prefisso di paese. */
  codice: string;
  /** La chiave da confrontare (come `partner_tax_key`). */
  chiave: string;
  tipo: "piva" | "cf_persona" | "sconosciuto";
  /** true/false se il controllo è possibile, null se il paese non ha un formato noto. */
  valido: boolean | null;
}

/**
 * Legge una P.IVA o un codice fiscale secondo il paese. `paese` è quello del
 * documento (IdPaese dell'XML) quando c'è: vince sul prefisso scritto nel numero.
 */
export function identificativoFiscale(v: string | null | undefined, paese?: string | null): IdentificativoFiscale | null {
  let x = soloAlfanumerico(v);
  if (!x) return null;
  let p = soloAlfanumerico(paese) || null;
  const pref = x.match(/^([A-Z]{2})(?=[A-Z0-9]*\d)/)?.[1];
  if (pref && (FORMATI_UE[pref] || pref === "IT") && (!p || p === pref)) {
    const resto = x.slice(2);
    // «IT» davanti a 11 cifre, o un prefisso UE seguito da un formato valido di quel paese.
    if ((pref === "IT" && /^\d{11}$/.test(resto)) || (pref !== "IT" && FORMATI_UE[pref]?.test(resto))) {
      p = pref;
      x = resto;
    }
  }
  if (!p && (/^\d{11}$/.test(x) || /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(x))) p = "IT";
  if (p === "IT") {
    if (/^\d{11}$/.test(x)) return { paese: "IT", codice: x, chiave: x, tipo: "piva", valido: pivaItalianaValida(x) };
    if (x.length === 16) return { paese: "IT", codice: x, chiave: x, tipo: "cf_persona", valido: codiceFiscalePersonaValido(x) };
    return { paese: "IT", codice: x, chiave: x, tipo: "sconosciuto", valido: false };
  }
  const formato = p ? FORMATI_UE[p] : undefined;
  return {
    paese: p,
    codice: x,
    chiave: p ? `${p}${x}` : x,
    tipo: "piva",
    valido: formato ? formato.test(x) : null,
  };
}

/** Due identificativi sono lo stesso soggetto? null = non si può dire (uno manca). */
export function stessoIdentificativo(a: string | null | undefined, b: string | null | undefined): boolean | null {
  const ka = chiaveFiscale(a);
  const kb = chiaveFiscale(b);
  if (!ka || !kb) return null;
  return ka === kb;
}

// ─── Nomi e forme societarie ─────────────────────────────────────────────────

const FORME: Array<[RegExp, string]> = [
  [/\bs\s*r\s*l\s*s\b|\bsrls\b|\bs\s*r\s*l\s+semplificata\b/, "SRLS"],
  [/\bs\s*r\s*[l1i]\b|\bsrl\b|\bsocieta\s+a\s+responsabilita\s+limitata\b/, "SRL"],
  [/\bs\s*a\s*p\s*a\b|\bsapa\b/, "SAPA"],
  [/\bs\s*p\s*a\b|\bspa\b|\bsocieta\s+per\s+azioni\b/, "SPA"],
  [/\bs\s*n\s*c\b|\bsnc\b/, "SNC"],
  [/\bs\s*a\s*s\b|\bsas\b/, "SAS"],
  [/\bs\s*c\s*a\s*r\s*l\b|\bscarl\b|\bsoc\s+coop\b|\bcooperativa\b|\bs\s*c\s*r\s*l\b/, "COOP"],
  [/\bs\s*s\b(?=\s*$)|\bsocieta\s+semplice\b/, "SS"],
  [/\bgmbh\b/, "GMBH"],
  [/\bsarl\b/, "SARL"],
  [/\bltd\b|\blimited\b/, "LTD"],
];

const PAROLE_VUOTE = /\b(societa|soc|ditta|impresa|individuale|unipersonale|in\s+liquidazione|di|e|&|the)\b/g;

function senzaAccenti(v: string): string {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** La forma societaria scritta nel nome, o null. */
export function formaSocietaria(nome: string | null | undefined): string | null {
  const s = senzaAccenti(String(nome ?? "")).toLowerCase().replace(/[^a-z0-9&\s]/g, " ").replace(/\s+/g, " ");
  for (const [re, forma] of FORME) if (re.test(s)) return forma;
  return null;
}

/**
 * Il nome ridotto all'osso, per confrontare due denominazioni: senza accenti,
 * punteggiatura, forme societarie e parole che non distinguono («ditta»,
 * «impresa»). «Edil Rossi S.r.l.» e «EDIL ROSSI SRL» diventano «edil rossi».
 *
 * È un CONFRONTO, mai una prova: due ditte possono chiamarsi uguale.
 */
export function nomeConfrontabile(nome: string | null | undefined): string {
  let s = senzaAccenti(String(nome ?? "")).toLowerCase();
  s = s.replace(/[.,'"()·—–\-/]/g, " ");
  for (const [re] of FORME) s = s.replace(new RegExp(re.source, "g"), " ");
  return s.replace(PAROLE_VUOTE, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

// ─── Date ────────────────────────────────────────────────────────────────────

const MESI: Record<string, number> = {
  gen: 1, gennaio: 1, feb: 2, febbraio: 2, mar: 3, marzo: 3, apr: 4, aprile: 4, mag: 5, maggio: 5,
  giu: 6, giugno: 6, lug: 7, luglio: 7, ago: 8, agosto: 8, set: 9, sett: 9, settembre: 9,
  ott: 10, ottobre: 10, nov: 11, novembre: 11, dic: 12, dicembre: 12,
};

function isoSeEsiste(a: number, m: number, g: number): string | null {
  if (a < 1900 || a > 2100 || m < 1 || m > 12 || g < 1 || g > 31) return null;
  const d = new Date(Date.UTC(a, m - 1, g));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== g) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(g).padStart(2, "0")}`;
}

function anno4(a: number): number {
  return a < 100 ? 2000 + a : a;
}

/**
 * Una data scritta all'italiana o in ISO → «AAAA-MM-GG», o null.
 * Formati: 2026-11-15, 15/11/2026, 15-11-26, 15.11.2026, 15 novembre 2026, 15 nov. 26.
 * Giorno e mese all'americana (11/15/2026) NON si accettano: 15 non è un mese,
 * e un 03/04 si leggerebbe al contrario senza accorgersene.
 */
export function dataIso(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[t\s].*)?$/);
  if (m) return isoSeEsiste(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) return isoSeEsiste(anno4(+m[3]), +m[2], +m[1]);
  m = s.match(/^(\d{1,2})\s+([a-z]+)\.?\s+(\d{2}|\d{4})$/);
  if (m && MESI[m[2]]) return isoSeEsiste(anno4(+m[3]), MESI[m[2]], +m[1]);
  return null;
}

/** Giorni fra due date ISO (b − a), o null. */
export function giorniFra(a: string | null | undefined, b: string | null | undefined): number | null {
  const da = dataIso(a);
  const db = dataIso(b);
  if (!da || !db) return null;
  return Math.round((Date.parse(db) - Date.parse(da)) / 86_400_000);
}

// ─── Importi ─────────────────────────────────────────────────────────────────

/**
 * Un importo scritto a mano o su un PDF → numero, o null.
 * «1.234,56» → 1234.56 · «1,234.56» → 1234.56 · «€ 12,5» → 12.5 · «-3,00» e «(3,00)» → -3
 * · «1.234» → 1234 (punto seguito da tre cifre = migliaia, come si scrive in Italia)
 * · «1,234» → 1.234 (la virgola è il decimale italiano).
 */
export function importo(v: string | number | null | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v ?? "").trim();
  if (!s) return null;
  let segno = 1;
  if (/^\(.*\)$/.test(s)) { segno = -1; s = s.slice(1, -1); }
  s = s.replace(/€|eur(o)?/gi, "").replace(/\s/g, "");
  if (s.startsWith("-")) { segno *= -1; s = s.slice(1); }
  if (s.endsWith("-")) { segno *= -1; s = s.slice(0, -1); }
  if (!/^[\d.,']+$/.test(s) || !/\d/.test(s)) return null;
  s = s.replace(/'/g, "");
  const ultimoPunto = s.lastIndexOf(".");
  const ultimaVirgola = s.lastIndexOf(",");
  let n: string;
  if (ultimoPunto >= 0 && ultimaVirgola >= 0) {
    const dec = ultimoPunto > ultimaVirgola ? "." : ",";
    const mig = dec === "." ? "," : ".";
    n = s.split(mig).join("").replace(dec, ".");
  } else if (ultimaVirgola >= 0) {
    if ((s.match(/,/g) ?? []).length > 1) n = s.replace(/,/g, "");
    else n = s.replace(",", ".");
  } else if (ultimoPunto >= 0) {
    const parti = s.split(".");
    if (parti.length > 2 || (parti.length === 2 && parti[1].length === 3)) n = parti.join("");
    else n = s;
  } else n = s;
  const x = Number(n);
  return Number.isFinite(x) ? segno * x : null;
}

/** In centesimi interi: il confronto fra importi si fa qui, mai coi float. */
export function centesimi(v: number): number {
  return Math.round((v + Math.sign(v) * Number.EPSILON) * 100);
}

/** Due importi uguali entro una tolleranza in centesimi (default 1 cent). */
export function stessoImporto(a: number, b: number, tolleranzaCent = 1): boolean {
  return Math.abs(centesimi(a) - centesimi(b)) <= tolleranzaCent;
}

// ─── Unità di misura ─────────────────────────────────────────────────────────

/**
 * Unità canoniche. Attenzione: in edilizia «ml» è il METRO LINEARE, non il
 * millilitro, e resta «M». Il millilitro sui documenti d'acquisto edili non si
 * vede; se servisse, si scriverà «ML_LIQ» a parte.
 */
const UNITA: Record<string, string> = {
  PZ: "PZ", PZI: "PZ", PEZZI: "PZ", PEZZO: "PZ", PC: "PZ", PCS: "PZ", NR: "PZ", N: "PZ", NUM: "PZ", NUMERO: "PZ",
  CAD: "PZ", CADAUNO: "PZ", CAD1: "PZ", UN: "PZ", UNITA: "PZ", U: "PZ", ST: "PZ", STK: "PZ", EA: "PZ",
  MQ: "MQ", M2: "MQ", "M²": "MQ", MQUADRI: "MQ", METRIQUADRI: "MQ", SQM: "MQ",
  M: "M", ML: "M", MT: "M", MTL: "M", METRI: "M", METRO: "M", METROLINEARE: "M", METRILINEARI: "M",
  MC: "MC", M3: "MC", "M³": "MC", METRICUBI: "MC",
  CM: "CM", MM: "MM",
  KG: "KG", KGS: "KG", CHILI: "KG", CHILOGRAMMI: "KG", G: "G", GR: "G", GRAMMI: "G",
  T: "T", TON: "T", TONN: "T", TONNELLATE: "T", Q: "Q", QL: "Q", QLI: "Q", QUINTALI: "Q",
  L: "L", LT: "L", LTR: "L", LITRI: "L", LITRO: "L",
  H: "H", HR: "H", ORE: "H", ORA: "H", HH: "H",
  GG: "GG", GIORNI: "GG", GIORNO: "GG",
  CONF: "CONF", CF: "CONF", CONFEZIONE: "CONF", CONFEZIONI: "CONF", PK: "CONF", PAK: "CONF",
  SAC: "SACCO", SACCO: "SACCO", SACCHI: "SACCO", SC: "SACCO",
  ROT: "ROTOLO", ROTOLO: "ROTOLO", ROTOLI: "ROTOLO", RT: "ROTOLO",
  PAL: "BANCALE", PALLET: "BANCALE", BANCALE: "BANCALE", BANCALI: "BANCALE", BAN: "BANCALE",
  SEC: "SECCHIO", SECCHIO: "SECCHIO", LATTA: "LATTA", LAT: "LATTA",
  CORPO: "CORPO", ACORPO: "CORPO", AC: "CORPO", FORFAIT: "CORPO", FF: "CORPO",
  KM: "KM", VIAGGIO: "VIAGGIO", VIAGGI: "VIAGGIO", VG: "VIAGGIO",
};

/** L'unità scritta sul documento → codice canonico, o null se non si conosce. */
export function unitaCanonica(v: string | null | undefined): string | null {
  const s = senzaAccenti(String(v ?? "")).toUpperCase().replace(/[\s.]/g, "");
  if (!s) return null;
  return UNITA[s] ?? UNITA[s.replace(/[^A-Z0-9²³]/g, "")] ?? null;
}

/** Conversioni fisiche: valgono sempre, non serve autorizzarle. */
const FISICHE: Record<string, Record<string, number>> = {
  KG: { G: 1000, T: 0.001, Q: 0.01 },
  G: { KG: 0.001 },
  T: { KG: 1000, Q: 10 },
  Q: { KG: 100, T: 0.1 },
  M: { CM: 100, MM: 1000, KM: 0.001 },
  CM: { M: 0.01, MM: 10 },
  MM: { M: 0.001, CM: 0.1 },
  KM: { M: 1000 },
};

/** Una conversione che una persona ha autorizzato per un fornitore e un articolo. */
export interface ConversioneAutorizzata {
  da: string;
  a: string;
  /** Quante unità `a` fa una unità `da` (es. 1 BANCALE = 60 SACCHI). */
  fattore: number;
  /** Codice articolo del fornitore, se la conversione vale solo per quello. */
  codiceArticolo?: string | null;
}

/**
 * Il fattore per passare da un'unità all'altra: 1 se sono la stessa, il fattore
 * fisico (KG→T), quello autorizzato per l'articolo, oppure null. Fra unità di
 * famiglie diverse (PZ→MQ, SACCO→KG) senza autorizzazione è sempre null:
 * un sacco non pesa 25 kg finché qualcuno non l'ha scritto.
 */
export function fattoreConversione(
  da: string | null | undefined,
  a: string | null | undefined,
  autorizzate: ConversioneAutorizzata[] = [],
  codiceArticolo?: string | null,
): number | null {
  const ud = unitaCanonica(da);
  const ua = unitaCanonica(a);
  if (!ud || !ua) return null;
  if (ud === ua) return 1;
  const fisica = FISICHE[ud]?.[ua];
  if (fisica) return fisica;
  const art = soloAlfanumerico(codiceArticolo);
  const ok = (c: ConversioneAutorizzata) => !c.codiceArticolo || soloAlfanumerico(c.codiceArticolo) === art;
  const diretta = autorizzate.find((c) => unitaCanonica(c.da) === ud && unitaCanonica(c.a) === ua && c.fattore > 0 && ok(c));
  if (diretta) return diretta.fattore;
  const inversa = autorizzate.find((c) => unitaCanonica(c.da) === ua && unitaCanonica(c.a) === ud && c.fattore > 0 && ok(c));
  if (inversa) return 1 / inversa.fattore;
  return null;
}

// ─── Numeri di documento (DDT, ordini, contratti) ────────────────────────────

export interface NumeroDocumento {
  /** Il progressivo confrontabile: cifre e lettere, senza zeri davanti né anno. */
  chiave: string;
  /** L'anno scritto nel numero (…/2026, …/26, 2026/…), se c'è. */
  anno: number | null;
  /** Una serie in lettere (A/123, 123/B, ODA-…), se c'è. */
  serie: string | null;
  /** Il testo originale, per mostrarlo. */
  originale: string;
}

const PREFISSI_DOC = /^(d\.?\s*d\.?\s*t\.?|ddt|bolla|doc(umento)?|ordine|ord|oda|odv|conf(erma)?|n(r|um(ero)?)?\.?|nr|n°|no\.?)(?:\s*[:.°º#]\s*|\s+)/i;

/**
 * Riferimenti che i gestionali dei fornitori scrivono quando il campo è
 * obbligatorio ma non hanno niente da metterci: non sono numeri d'ordine.
 */
const RIFERIMENTI_VUOTI = /^(\.|-|_|\/|0+|x+|n\.?\s*d\.?|n\.?\s*a\.?|s\.?\s*n\.?|no\.?\s*ord\.?|nessuno|vs\.?\s*ord(ine)?|verbale|telefonico|a\s+voce|come\s+da\s+accordi)$/i;

/**
 * Legge un numero di documento. Ritorna null se il riferimento non vale
 * niente («NO.ORD.», «.», un nome di persona): un riferimento senza nemmeno una
 * cifra non identifica un documento e non deve abbinare nulla.
 */
export function numeroDocumento(v: string | null | undefined): NumeroDocumento | null {
  const originale = String(v ?? "").trim();
  if (!originale || originale.length > 60) return null;
  if (RIFERIMENTI_VUOTI.test(originale)) return null;
  if (!/\d/.test(originale)) return null;
  let s = senzaAccenti(originale).toUpperCase();
  // Le cifre tolgono il dubbio: un prefisso come «DDT n.» o «Ordine» si toglie anche ripetuto.
  for (let i = 0; i < 3; i++) s = s.replace(PREFISSI_DOC, "");
  s = s.replace(/\s+DEL\s+.*$/, "").trim();
  // Serie in testa: lettere separate dal progressivo (A/123, ODA-2026-0039, FV 12).
  let serie: string | null = null;
  let m = s.match(/^([A-Z]{1,6})\s*[/\-\s]\s*(\d[\dA-Z./\-\s]*)$/);
  if (m) {
    serie = m[1];
    s = m[2];
  }
  let anno: number | null = null;
  // Anno in coda: 123/2026, 123-26, 123/26 — solo se separato, e un anno credibile
  // (fra 2000 e 2040: «123-45» non è il 2045, è un altro pezzo di numero).
  m = s.match(/^(.*\d.*?)\s*[/-]\s*(20\d{2}|\d{2})$/);
  if (m && /[A-Z0-9]/.test(m[1]) && anno4(+m[2]) >= 2000 && anno4(+m[2]) <= 2040) {
    anno = anno4(+m[2]);
    s = m[1];
  } else {
    // Anno in testa: 2026/123, 2026-000123.
    m = s.match(/^(20\d{2})\s*[/-]\s*(.*\d.*)$/);
    if (m && +m[1] <= 2040) {
      anno = +m[1];
      s = m[2];
    }
  }
  // Serie in coda: 123/B.
  if (!serie) {
    m = s.match(/^(\d[\d./\-\s]*)\s*[/-]\s*([A-Z]{1,4})$/);
    if (m) {
      serie = m[2];
      s = m[1];
    }
  }
  const chiave = soloAlfanumerico(s).replace(/^0+(?=.)/, "");
  if (!chiave || !/\d/.test(chiave) || chiave === "0") return null;
  return { chiave, anno, serie, originale };
}

export type ConfrontoNumero = "uguale" | "diverso" | "compatibile";

/**
 * Due numeri di documento DELLO STESSO FORNITORE sono lo stesso documento?
 * - «uguale»: stessa chiave, e anno/serie uguali dove scritti su entrambi;
 * - «compatibile»: stessa chiave ma anno o serie scritti solo da una parte
 *   (va confermato con la data);
 * - «diverso»: chiave, anno o serie diversi.
 * Il fornitore NON è qui dentro di proposito: chi chiama deve averlo già confrontato.
 */
export function confrontaNumeri(a: NumeroDocumento | null, b: NumeroDocumento | null): ConfrontoNumero {
  if (!a || !b) return "diverso";
  if (a.chiave !== b.chiave) return "diverso";
  if (a.anno != null && b.anno != null && a.anno !== b.anno) return "diverso";
  if (a.serie != null && b.serie != null && a.serie !== b.serie) return "diverso";
  if ((a.anno == null) !== (b.anno == null) || (a.serie == null) !== (b.serie == null)) return "compatibile";
  return "uguale";
}

// ─── Indirizzi ───────────────────────────────────────────────────────────────

const ABBREVIAZIONI: Array<[RegExp, string]> = [
  [/\bv\.?\s*le\b|\bviale\b/g, "viale"],
  [/\bp\.?\s*zza\b|\bp\.?\s*za\b|\bpiazza\b/g, "piazza"],
  [/\bc\.?\s*so\b|\bcorso\b/g, "corso"],
  [/\bv\.?\s*lo\b|\bvicolo\b/g, "vicolo"],
  [/\bloc\.?\b|\blocalita\b/g, "localita"],
  [/\bfraz\.?\b|\bfrazione\b/g, "frazione"],
  [/\bv\.(?=\s)/g, "via"],
  [/\bs\.?\s*s\.?(?=\s*\d)/g, "strada statale"],
];

/**
 * Indirizzo confrontabile: minuscole, senza accenti né punteggiatura, con le
 * abbreviazioni sciolte e senza CAP. Come per i nomi: è un indizio, non una prova.
 */
export function indirizzoConfrontabile(v: string | null | undefined): string {
  let s = senzaAccenti(String(v ?? "")).toLowerCase();
  for (const [re, x] of ABBREVIAZIONI) s = s.replace(re, x);
  return s
    .replace(/\b\d{5}\b/g, " ")
    .replace(/\bn\.?\s*(?=\d)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
