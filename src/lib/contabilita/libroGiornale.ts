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
  numero: string;
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
  for (const s of ordinate) {
    const proprie = [...(s.contabilita_righe ?? [])].sort((a, b) => a.riga - b.riga);
    proprie.forEach((r, i) => {
      totDare += cent(Number(r.dare) || 0);
      totAvere += cent(Number(r.avere) || 0);
      progressivo += 1;
      righe.push({
        progressivo,
        numero: `${s.numero}/${s.esercizio}`,
        data: s.data_registrazione,
        causale: [s.causale, s.documento_numero ? `doc. ${s.documento_numero}` : ""].filter(Boolean).join(" · "),
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

/** Il foglio A4 del libro giornale del periodo. */
export function htmlLibroGiornale(d: {
  azienda: AziendaIntestazione;
  scritture: readonly Scrittura[];
  conti: readonly ContoContabile[];
  dal: string;
  al: string;
}): string {
  const g = costruisciGiornale(d.scritture, d.conti);
  return htmlDocumentoContabile<RigaGiornale>({
    titolo: "Libro giornale",
    periodo: periodoInLettere(d.dal, d.al),
    sottotitolo:
      "Scritture in partita doppia in ordine di data e numero. Ogni scrittura quadra; le correzioni sono storni, non cancellazioni.",
    azienda: d.azienda,
    riepilogo: [
      { etichetta: "Scritture", valore: String(g.scritture) },
      { etichetta: "Totale dare", valore: euro(g.totaleDare) },
      { etichetta: "Totale avere", valore: euro(g.totaleAvere) },
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
    righe: g.righe,
    totali: [
      { etichetta: "Totale dare", valore: euro(g.totaleDare) },
      { etichetta: "Totale avere", valore: euro(g.totaleAvere), forte: true },
    ],
    vuoto: "Nessuna scrittura in questo periodo.",
  });
}
