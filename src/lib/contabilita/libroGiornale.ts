/**
 * Libro giornale e scritture in partita doppia (10/11/2026).
 *
 * Le scritture vivono in `contabilita_scritture` + `contabilita_righe`: il
 * database le numera per esercizio, le tiene in quadratura e non le lascia
 * modificare (si stornano). Qui stanno solo i conti che servono a mostrarle e
 * a stamparle: quadratura di una bozza, progressivi del giornale, foglio A4.
 */
import { htmlDocumentoContabile, type AziendaIntestazione } from "./documentoContabile";
import { periodoInLettere } from "./registroPrimaNota";

export interface ContoContabile {
  id: string;
  codice: string;
  descrizione: string;
  natura: "attivo" | "passivo" | "costo" | "ricavo";
  sezione_cee: "SPA" | "SPP" | "CE" | null;
  voce_cee: string | null;
  mastro_id: string | null;
  movimentabile: boolean;
  attivo: boolean;
  /** Su un piano proprio: il ruolo del piano standard (05.01 clienti, 20.01 ricavi…) per le scritture dai documenti. */
  codice_standard?: string | null;
  /** Cosa resta da confermare (voce CEE proposta all'importazione…). */
  nota?: string | null;
}

export interface RigaScrittura {
  riga: number;
  conto_id: string;
  dare: number;
  avere: number;
  descrizione: string | null;
}

export interface Scrittura {
  id: string;
  esercizio: number;
  numero: number;
  data_registrazione: string;
  causale: string;
  descrizione: string | null;
  documento_numero: string | null;
  documento_data: string | null;
  origine: string;
  storno_di: string | null;
  contabilita_righe: RigaScrittura[];
}

/** Una riga della bozza che si sta scrivendo: importi come testo, come nei campi. */
export interface RigaBozza {
  conto_id: string;
  dare: string;
  avere: string;
  descrizione: string;
}

const cent = (n: number) => Math.round(n * 100);

/** Un importo scritto all'italiana («1.234,56») o col punto («1234.56»). */
export function importo(testo: string): number {
  const t = testo.trim();
  if (!t) return 0;
  const n = /,/.test(t) ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

export interface EsitoBozza {
  dare: number;
  avere: number;
  differenza: number;
  /** Cosa manca per poterla registrare; vuoto = si può. */
  problemi: string[];
}

/** Quadra? Lo stesso controllo del database, detto prima di provarci. */
export function controllaBozza(righe: readonly RigaBozza[], conti: readonly ContoContabile[]): EsitoBozza {
  const problemi: string[] = [];
  let dare = 0;
  let avere = 0;
  const usate = righe.filter((r) => r.conto_id || r.dare.trim() || r.avere.trim());
  usate.forEach((r, i) => {
    const d = importo(r.dare);
    const a = importo(r.avere);
    const n = i + 1;
    if (!r.conto_id) problemi.push(`Riga ${n}: manca il conto`);
    else {
      const c = conti.find((x) => x.id === r.conto_id);
      if (!c || !c.movimentabile) problemi.push(`Riga ${n}: scegli un conto, non un mastro`);
    }
    if (Number.isNaN(d) || Number.isNaN(a) || d < 0 || a < 0) problemi.push(`Riga ${n}: importo non valido`);
    else if ((d > 0) === (a > 0)) problemi.push(`Riga ${n}: un importo in dare oppure in avere`);
    else {
      dare += d;
      avere += a;
    }
  });
  if (usate.length < 2) problemi.push("Servono almeno due righe");
  const differenza = (cent(dare) - cent(avere)) / 100;
  if (differenza !== 0) problemi.push(`Non quadra: differenza di ${euro(Math.abs(differenza))}`);
  return { dare: cent(dare) / 100, avere: cent(avere) / 100, differenza, problemi };
}

/** Una riga del libro giornale: la testata ripetuta su ogni riga, come nei libri. */
export interface RigaGiornale {
  progressivo: number;
  /** Numero di giornale: progressivo per esercizio in ordine di data, come vuole la tenuta del libro. */
  numero: string;
  /** Numero di registrazione dato al momento dell'inserimento (resta sulla scrittura e nei riferimenti). */
  registrazione: string;
  data: string;
  causale: string;
  conto: string;
  descrizione: string;
  dare: number | null;
  avere: number | null;
  /** Totale progressivo del dare (uguale a quello dell'avere: le scritture quadrano). */
  progressivoDare: number;
  primaDellaScrittura: boolean;
}

export function costruisciGiornale(scritture: readonly Scrittura[], conti: readonly ContoContabile[], riporto = 0) {
  const nomi = new Map(conti.map((c) => [c.id, `${c.codice} ${c.descrizione}`]));
  const ordinate = [...scritture].sort((a, b) =>
    a.data_registrazione.localeCompare(b.data_registrazione) || a.esercizio - b.esercizio || a.numero - b.numero);
  const righe: RigaGiornale[] = [];
  let totDare = cent(riporto);
  let totAvere = cent(riporto);
  let progressivo = 0;
  // Una scrittura inserita dopo, con una data precedente, ha un numero di registrazione «fuori posto»:
  // nel giornale conta l'ordine di data, quindi il numero si ricalcola per esercizio.
  const perEsercizio = new Map<number, number>();
  for (const s of ordinate) {
    const nGiornale = (perEsercizio.get(s.esercizio) ?? 0) + 1;
    perEsercizio.set(s.esercizio, nGiornale);
    const fuoriPosto = nGiornale !== s.numero;
    const proprie = [...(s.contabilita_righe ?? [])].sort((a, b) => a.riga - b.riga);
    proprie.forEach((r, i) => {
      totDare += cent(Number(r.dare) || 0);
      totAvere += cent(Number(r.avere) || 0);
      progressivo += 1;
      righe.push({
        progressivo,
        numero: `${nGiornale}/${s.esercizio}`,
        registrazione: `${s.numero}/${s.esercizio}`,
        data: s.data_registrazione,
        causale: [s.causale, s.documento_numero ? `doc. ${s.documento_numero}` : "", fuoriPosto ? `reg. n. ${s.numero}` : ""]
          .filter(Boolean).join(" · "),
        conto: nomi.get(r.conto_id) ?? "conto non trovato",
        descrizione: r.descrizione ?? s.descrizione ?? "",
        dare: Number(r.dare) > 0 ? Number(r.dare) : null,
        avere: Number(r.avere) > 0 ? Number(r.avere) : null,
        progressivoDare: totDare / 100,
        primaDellaScrittura: i === 0,
      });
    });
  }
  return { righe, totaleDare: totDare / 100, totaleAvere: totAvere / 100, scritture: ordinate.length };
}

const euro = (n: number | null): string =>
  n === null ? "" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(n);

const dataIT = (iso: string): string => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

/** Il piè di pagina dei libri tenuti qui: non è il prospetto «da consegnare» degli altri fogli. */
export const PIEDE_LIBRO =
  "Contabilità in partita doppia tenuta con Edilizia in Cloud: scritture numerate per esercizio, sempre in quadratura, corrette solo per storno.";

/**
 * Il foglio A4 del libro giornale. Le righe sono quelle con data fra `dal` e `al`, ma numeri e
 * progressivi vengono dall'intero esercizio: una stampa da aprile continua la numerazione e
 * porta il riporto dei totali di gennaio–marzo. `definitiva` la intesta come stampa definitiva.
 */
export function htmlLibroGiornale(d: {
  azienda: AziendaIntestazione;
  scritture: readonly Scrittura[];
  conti: readonly ContoContabile[];
  dal: string;
  al: string;
  definitiva?: boolean;
}): string {
  const tutto = costruisciGiornale(d.scritture, d.conti);
  const prima = tutto.righe.filter((r) => r.data < d.dal);
  const righe = tutto.righe.filter((r) => r.data >= d.dal && r.data <= d.al);
  const riporto = prima.length ? prima[prima.length - 1].progressivoDare : 0;
  const totale = righe.length ? righe[righe.length - 1].progressivoDare : riporto;
  const scritture = righe.filter((r) => r.primaDellaScrittura).length;
  return htmlDocumentoContabile<RigaGiornale>({
    titolo: d.definitiva ? "Libro giornale — stampa definitiva" : "Libro giornale",
    periodo: periodoInLettere(d.dal, d.al),
    sottotitolo:
      "Scritture in partita doppia in ordine di data, numerate per esercizio. Ogni scrittura quadra; le correzioni sono storni, non cancellazioni.",
    azienda: d.azienda,
    piede: PIEDE_LIBRO,
    riepilogo: [
      { etichetta: "Scritture", valore: String(scritture) },
      ...(riporto ? [{ etichetta: "Riporto (dare = avere)", valore: euro(riporto) }] : []),
      { etichetta: "Progressivo dare", valore: euro(totale) },
      { etichetta: "Progressivo avere", valore: euro(totale) },
    ],
    colonne: [
      { intestazione: "Rigo", valore: (x) => String(x.progressivo), allinea: "destra", compatta: true, larghezza: "5%" },
      { intestazione: "N.", valore: (x) => (x.primaDellaScrittura ? x.numero : ""), compatta: true, larghezza: "7%" },
      { intestazione: "Data", valore: (x) => (x.primaDellaScrittura ? dataIT(x.data) : ""), compatta: true, larghezza: "9%" },
      { intestazione: "Causale", valore: (x) => (x.primaDellaScrittura ? x.causale : ""), larghezza: "17%" },
      { intestazione: "Conto", valore: (x) => x.conto, larghezza: "24%" },
      { intestazione: "Descrizione", valore: (x) => x.descrizione, larghezza: "16%" },
      { intestazione: "Dare", valore: (x) => euro(x.dare), allinea: "destra", compatta: true, larghezza: "11%" },
      { intestazione: "Avere", valore: (x) => euro(x.avere), allinea: "destra", compatta: true, larghezza: "11%" },
    ],
    righe,
    totali: [
      ...(riporto ? [{ etichetta: "Riporto", valore: euro(riporto) }] : []),
      { etichetta: "Totale dare del periodo", valore: euro(Math.round((totale - riporto) * 100) / 100) },
      { etichetta: "Progressivo dare e avere", valore: euro(totale), forte: true },
    ],
    vuoto: "Nessuna scrittura in questo periodo.",
  });
}

/** Una cella CSV: separatore «;», decimali con la virgola, testo fra virgolette se serve. */
const cella = (v: string | number | null | undefined): string => {
  if (v === null || v === undefined) return "";
  const t = typeof v === "number" ? v.toFixed(2).replace(".", ",") : String(v);
  return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/**
 * Il libro giornale per il programma dello studio: una riga per movimento, con il codice del
 * conto, in CSV all'italiana (i programmi di contabilità lo importano con un tracciato
 * configurabile). Il numero è quello del giornale; la registrazione resta nella sua colonna.
 */
export function csvGiornale(scritture: readonly Scrittura[], conti: readonly ContoContabile[]): string {
  const perId = new Map(conti.map((c) => [c.id, c]));
  const ordinate = [...scritture].sort((a, b) =>
    a.data_registrazione.localeCompare(b.data_registrazione) || a.esercizio - b.esercizio || a.numero - b.numero);
  const giornale = new Map<string, number>();
  const perEsercizio = new Map<number, number>();
  for (const s of ordinate) {
    const n = (perEsercizio.get(s.esercizio) ?? 0) + 1;
    perEsercizio.set(s.esercizio, n);
    giornale.set(s.id, n);
  }
  const righe = [["Esercizio", "N. giornale", "N. registrazione", "Data", "Causale", "Descrizione", "N. documento", "Data documento",
    "Codice conto", "Conto", "Descrizione riga", "Dare", "Avere", "Origine"].join(";")];
  for (const s of ordinate) {
    for (const r of [...(s.contabilita_righe ?? [])].sort((a, b) => a.riga - b.riga)) {
      const c = perId.get(r.conto_id);
      righe.push([
        s.esercizio, giornale.get(s.id), s.numero, dataIT(s.data_registrazione), s.causale, s.descrizione, s.documento_numero,
        s.documento_data ? dataIT(s.documento_data) : "", c?.codice, c?.descrizione, r.descrizione,
        Number(r.dare) || 0, Number(r.avere) || 0, s.origine,
      ].map((v) => cella(v as string | number | null | undefined)).join(";"));
    }
  }
  return righe.join("\r\n");
}

/** Il piano dei conti in CSV, con la voce CEE e il ruolo: per allinearlo a quello dello studio. */
export function csvPianoDeiConti(conti: readonly ContoContabile[]): string {
  const perId = new Map(conti.map((c) => [c.id, c]));
  return [["Codice", "Descrizione", "Mastro", "Natura", "Sezione CEE", "Voce CEE", "Movimentabile", "Ruolo"].join(";"),
    ...conti.map((c) => [c.codice, c.descrizione, c.mastro_id ? perId.get(c.mastro_id)?.codice : "", c.natura, c.sezione_cee,
      c.voce_cee, c.movimentabile ? "sì" : "no", c.codice_standard].map((v) => cella(v as string | null)).join(";")),
  ].join("\r\n");
}
