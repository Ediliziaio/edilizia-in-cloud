/**
 * Lettura del PDF che manda il consulente del lavoro (Libro Unico del mese):
 * riconosce ogni pagina, la attribuisce a una persona e a un mese, raggruppa le
 * pagine della stessa busta e decide chi deve ricevere cosa.
 *
 * Funzioni pure sulle righe di testo di ogni pagina (le estrae pdfBustePaga.ts
 * con pdfjs): niente AI. I PDF dei programmi paghe sono testo vero, e il codice
 * fiscale stampato su ogni busta è un aggancio più sicuro di qualunque lettura.
 * Tarato su Zucchetti; le parole chiave sono quelle comuni agli altri programmi
 * (TeamSystem, Inaz, Paghe Web…), che si aggiungono qui quando arriva un PDF vero.
 */

export type TipoDocumentoPaghe = "cedolino" | "presenze" | "riepilogo" | "cu" | "f24" | "cassa_edile" | "altro";

export const TIPI_DOCUMENTO: Record<TipoDocumentoPaghe, { label: string; plurale: string; alDipendente: boolean }> = {
  cedolino: { label: "Busta paga", plurale: "buste paga", alDipendente: true },
  cu: { label: "Certificazione Unica", plurale: "certificazioni uniche", alDipendente: true },
  presenze: { label: "Foglio presenze", plurale: "fogli presenze", alDipendente: false },
  riepilogo: { label: "Riepilogo azienda", plurale: "riepiloghi azienda", alDipendente: false },
  f24: { label: "F24", plurale: "F24", alDipendente: false },
  cassa_edile: { label: "Cassa Edile", plurale: "documenti Cassa Edile", alDipendente: false },
  altro: { label: "Da controllare", plurale: "da controllare", alDipendente: false },
};

export interface ImportiBusta {
  netto: number | null;
  lordo: number | null;
  trattenute: number | null;
  ritenute_irpef: number | null;
  contributi_dipendente: number | null;
}

export interface PaginaLetta extends ImportiBusta {
  /** 0-based, nel file d'origine. */
  indice: number;
  tipo: TipoDocumentoPaghe;
  codiceFiscale: string | null;
  nome: string | null;
  anno: number | null;
  mese: number | null;
}

export interface DocumentoLetto extends ImportiBusta {
  tipo: TipoDocumentoPaghe;
  /** Pagine (0-based) del file d'origine che compongono il documento. */
  pagine: number[];
  codiceFiscale: string | null;
  nome: string | null;
  anno: number | null;
  mese: number | null;
}

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
export const NOMI_MESI = MESI.map((m) => m[0].toUpperCase() + m.slice(1));

// Codice fiscale di persona fisica (con omocodie). Quello dell'azienda è numerico: non combacia.
const RE_CF = /\b[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPR-T][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]\b/;
const RE_MESE_ANNO = new RegExp(`\\b(${MESI.join("|")})\\b\\s*\\|?\\s*(20\\d{2})\\b`, "i");
// «1.611,00», «1611,00», «-14,33» e «14,33-» (Zucchetti stampa così i negativi).
// Senza cifre o punti a sinistra: «1611,00» non deve diventare «611,00».
const RE_IMPORTO = /(?<![\d.,])-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}(?!\d)-?/g;

/**
 * Le parole chiave si cercano sul testo «compattato» (senza spazi né separatori):
 * un PDF risalvato spezza le parole lettera per lettera («T | O | T | A | L | E»),
 * e Zucchetti stampa gli spazi delle intestazioni come «s» («NETTOsDELsMESE»).
 */
const compatta = (s: string) => s.replace(/[\s|]+/g, "").toUpperCase();
const intestazione = (parole: string) => new RegExp(parole.split(" ").join("S?"));
const RE_NETTO = intestazione("NETTO DEL MESE");
const RE_NETTO_ALTRI = /NETTO(INBUSTA|APAGARE|DAPAGARE)/;
const RE_COMPETENZE = intestazione("TOTALE COMPETENZE");
const RE_TRATTENUTE = intestazione("TOTALE TRATTENUTE");

/** «1.611,00» → 1611; «14,33-» e «-14,33» → -14.33. */
export function numeroIT(s: string): number {
  const negativo = s.startsWith("-") || s.endsWith("-");
  const n = Number(s.replace(/-/g, "").replace(/\./g, "").replace(",", "."));
  return negativo ? -n : n;
}

function ultimoImporto(riga: string): number | null {
  const m = riga.match(RE_IMPORTO);
  return m ? numeroIT(m[m.length - 1]) : null;
}

function classifica(testo: string): TipoDocumentoPaghe {
  const t = compatta(testo);
  if (/RIEPILOGOS?GENERALE|RIEPILOGOS?(AZIENDALE|DITTA)|PROSPETTOS?CONTABILE|TOTALIS?AZIENDA/.test(t)) return "riepilogo";
  if (/CERTIFICAZIONES?UNICA/.test(t)) return "cu";
  if (/MODELLOS?DIS?PAGAMENTOS?UNIFICATO|MODELLOS?F24/.test(t)) return "f24";
  if (/GIUSTIFICATIVI/.test(t) && /TIMBRATURE|GIORNO/.test(t) && !RE_NETTO.test(t)) return "presenze";
  if (RE_NETTO.test(t) || RE_NETTO_ALTRI.test(t) || RE_COMPETENZE.test(t)) return "cedolino";
  // Una busta edile cita la Cassa Edile fra le voci: qui arriva solo ciò che busta non è.
  if (/CASSAS?EDILE|EDILCASSA|DENUNCIAS?MENSILE/.test(t)) return "cassa_edile";
  return "altro";
}

/** Il nome è la cella prima del codice fiscale, se è fatta di lettere (non un mese, non un codice). */
function nomeVicinoAlCf(righe: string[], cf: string): string | null {
  for (const riga of righe) {
    if (!riga.includes(cf)) continue;
    const celle = riga.split("|").map((c) => c.trim());
    const i = celle.findIndex((c) => c.includes(cf));
    const prima = celle[i - 1];
    if (prima && /^[A-ZÀ-Ü' ]{5,}$/i.test(prima) && !MESI.includes(prima.toLowerCase())) return prima.toUpperCase();
  }
  return null;
}

function leggiImporti(righe: string[]): ImportiBusta {
  const out: ImportiBusta = { netto: null, lordo: null, trattenute: null, ritenute_irpef: null, contributi_dipendente: null };
  let contributi = 0;
  let trovatiContributi = false;
  righe.forEach((riga, i) => {
    const c = compatta(riga);
    if (out.netto == null && (RE_NETTO.test(c) || RE_NETTO_ALTRI.test(c))) {
      // Il netto sta sulla riga stessa o su una delle successive, con il simbolo €.
      for (const r of [riga, ...righe.slice(i + 1, i + 4)]) {
        if (/€/.test(r) || r !== riga) {
          const n = ultimoImporto(r);
          if (n != null) { out.netto = n; break; }
        }
      }
    }
    if (out.lordo == null && RE_COMPETENZE.test(c)) out.lordo = ultimoImporto(riga);
    if (out.trattenute == null && RE_TRATTENUTE.test(c)) out.trattenute = ultimoImporto(riga);
    if (out.ritenute_irpef == null && /RITENUTES?IRPEF/.test(c) && !/TASS/.test(c)) out.ritenute_irpef = ultimoImporto(riga);
    // Contributi a carico del dipendente: le trattenute in percentuale (INPS, FIS, Cassa Edile…).
    if (/\|\s*%\s*\|/.test(riga) && !/IRPEF/i.test(riga)) {
      const n = ultimoImporto(riga);
      if (n != null) { contributi += n; trovatiContributi = true; }
    }
  });
  if (trovatiContributi) out.contributi_dipendente = Math.round(contributi * 100) / 100;
  return out;
}

/** Legge una pagina: tipo, persona, mese, importi. `righe` = celle unite da « | ». */
/**
 * Il mese di retribuzione: prima vicino all'intestazione «PERIODO…» (busta e
 * foglio presenze), solo dopo il primo «mese anno» della pagina. Una pagina può
 * citare altri mesi (tredicesima, conguagli, arretrati) che non sono il suo.
 */
function trovaPeriodo(righe: string[]): RegExpMatchArray | null {
  const i = righe.findIndex((r) => /PERIODO/.test(compatta(r)));
  if (i >= 0) {
    for (const r of righe.slice(i, i + 4)) {
      const m = r.match(RE_MESE_ANNO);
      if (m) return m;
    }
  }
  return righe.join("\n").match(RE_MESE_ANNO);
}

export function leggiPagina(righe: string[], indice: number): PaginaLetta {
  const testo = righe.join("\n");
  const tipo = classifica(testo);
  const cf = tipo === "riepilogo" ? null : (testo.match(RE_CF)?.[0] ?? null);
  const periodo = trovaPeriodo(righe);
  return {
    indice,
    tipo,
    codiceFiscale: cf,
    nome: cf ? nomeVicinoAlCf(righe, cf) : null,
    mese: periodo ? MESI.indexOf(periodo[1].toLowerCase()) + 1 : null,
    anno: periodo ? Number(periodo[2]) : null,
    ...(tipo === "cedolino" ? leggiImporti(righe) : { netto: null, lordo: null, trattenute: null, ritenute_irpef: null, contributi_dipendente: null }),
  };
}

/**
 * Pagine consecutive dello stesso tipo, persona e mese diventano un documento
 * solo: una busta lunga sta su due pagine, e il netto è solo sull'ultima.
 */
export function raggruppaPagine(pagine: PaginaLetta[]): DocumentoLetto[] {
  const docs: DocumentoLetto[] = [];
  for (const p of pagine) {
    const ultimo = docs[docs.length - 1];
    const stesso = ultimo && ultimo.tipo === p.tipo && ultimo.codiceFiscale === p.codiceFiscale
      && (p.mese == null || ultimo.mese === p.mese) && (p.anno == null || ultimo.anno === p.anno)
      && ultimo.pagine[ultimo.pagine.length - 1] === p.indice - 1;
    if (stesso) {
      ultimo.pagine.push(p.indice);
      ultimo.nome ??= p.nome;
      for (const k of ["netto", "lordo", "trattenute", "ritenute_irpef", "contributi_dipendente"] as const) {
        if (p[k] != null) ultimo[k] = k === "contributi_dipendente" ? Math.round(((ultimo[k] ?? 0) + p[k]!) * 100) / 100 : p[k];
      }
    } else {
      const { indice, ...resto } = p;
      docs.push({ ...resto, pagine: [indice] });
    }
  }
  return docs;
}

/** Il foglio presenze stampa il codice fiscale ma non sempre il nome: lo prende dalla busta della stessa persona. */
export function completaNomi<T extends Pick<DocumentoLetto, "codiceFiscale" | "nome">>(docs: T[]): T[] {
  const nomi = new Map<string, string>();
  for (const d of docs) if (d.codiceFiscale && d.nome) nomi.set(d.codiceFiscale, d.nome);
  return docs.map((d) => (d.nome || !d.codiceFiscale || !nomi.has(d.codiceFiscale) ? d : { ...d, nome: nomi.get(d.codiceFiscale)! }));
}

export interface ProfiloPerAbbinamento {
  id: string;
  nome: string | null;
  cognome: string | null;
  codice_fiscale: string | null;
  employee_id: string | null;
  user_id: string | null;
}

const parole = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");

/**
 * A chi è intestato un documento: prima per codice fiscale; se nessun profilo lo
 * ha, per nome e cognome (in qualunque ordine), ma solo se il nome è di uno solo.
 */
export function abbinaProfilo(doc: Pick<DocumentoLetto, "codiceFiscale" | "nome">, profili: ProfiloPerAbbinamento[]): { profilo: ProfiloPerAbbinamento; per: "codice_fiscale" | "nome" } | null {
  if (doc.codiceFiscale) {
    const perCf = profili.find((p) => p.codice_fiscale?.toUpperCase() === doc.codiceFiscale);
    if (perCf) return { profilo: perCf, per: "codice_fiscale" };
  }
  if (doc.nome) {
    const cercato = parole(doc.nome);
    const perNome = profili.filter((p) => parole(`${p.nome ?? ""} ${p.cognome ?? ""}`) === cercato
      // Un profilo con un altro codice fiscale non è la stessa persona, anche se si chiama uguale.
      && (!p.codice_fiscale || !doc.codiceFiscale || p.codice_fiscale.toUpperCase() === doc.codiceFiscale));
    if (perNome.length === 1) return { profilo: perNome[0], per: "nome" };
  }
  return null;
}

/** Il mese prevalente fra i documenti (le buste di un caricamento sono di un mese). */
export function periodoPrevalente(docs: Pick<DocumentoLetto, "anno" | "mese">[]): { anno: number; mese: number } | null {
  const conti = new Map<string, number>();
  for (const d of docs) if (d.anno && d.mese) conti.set(`${d.anno}-${d.mese}`, (conti.get(`${d.anno}-${d.mese}`) ?? 0) + 1);
  const top = [...conti.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  const [anno, mese] = top[0].split("-").map(Number);
  return { anno, mese };
}

/** Il programma paghe che ha prodotto il file, se si riconosce. */
export function riconosciProgramma(testo: string): string | null {
  if (/ZUCCHETTI/i.test(testo)) return "Zucchetti";
  if (/TEAMSYSTEM|TEAM\s*SYSTEM/i.test(testo)) return "TeamSystem";
  if (/INAZ/i.test(testo)) return "Inaz";
  if (/PAGHE\s*WEB|DATAPAGHE|CENTRO\s+PAGHE/i.test(testo)) return "Paghe";
  return null;
}
