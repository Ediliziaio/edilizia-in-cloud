/**
 * Mastrini e partitari (10/11/2026).
 *
 * Il mastrino di un conto: i suoi movimenti in ordine di data col saldo progressivo.
 * Il partitario: lo stesso conto (clienti, fornitori) diviso per soggetto, perché
 * «Crediti verso clienti» è un conto solo e lo studio chiede «quanto ci deve Rossi».
 * Il soggetto è la descrizione della riga: le scritture dai documenti ci mettono la
 * ragione sociale del cliente o del fornitore.
 */
import { htmlDocumentoContabile, type AziendaIntestazione } from "./documentoContabile";
import { periodoInLettere } from "./registroPrimaNota";
import { PIEDE_LIBRO, type ContoContabile, type Scrittura } from "./libroGiornale";

const cent = (n: number) => Math.round((Number(n) || 0) * 100);

export interface MovimentoMastrino {
  scritturaId: string;
  data: string;
  numero: string;
  causale: string;
  descrizione: string;
  dare: number;
  avere: number;
  /** Saldo progressivo dare − avere dopo questo movimento. */
  saldo: number;
}

const ordina = (scritture: readonly Scrittura[]) =>
  [...scritture].sort((a, b) =>
    a.data_registrazione.localeCompare(b.data_registrazione) || a.esercizio - b.esercizio || a.numero - b.numero);

/** I movimenti di un conto (di un solo soggetto, se indicato) con il saldo progressivo. */
export function mastrino(scritture: readonly Scrittura[], contoId: string, soggetto?: string) {
  const movimenti: MovimentoMastrino[] = [];
  let dare = 0;
  let avere = 0;
  for (const s of ordina(scritture)) {
    for (const r of [...(s.contabilita_righe ?? [])].sort((a, b) => a.riga - b.riga)) {
      if (r.conto_id !== contoId) continue;
      const descrizione = r.descrizione ?? s.descrizione ?? "";
      if (soggetto !== undefined && chiaveSoggetto(descrizione) !== soggetto) continue;
      dare += cent(r.dare);
      avere += cent(r.avere);
      movimenti.push({
        scritturaId: s.id,
        data: s.data_registrazione,
        numero: `${s.numero}/${s.esercizio}`,
        causale: [s.causale, s.documento_numero ? `doc. ${s.documento_numero}` : ""].filter(Boolean).join(" · "),
        descrizione,
        dare: cent(r.dare) / 100,
        avere: cent(r.avere) / 100,
        saldo: (dare - avere) / 100,
      });
    }
  }
  return { movimenti, dare: dare / 100, avere: avere / 100, saldo: (dare - avere) / 100 };
}

/**
 * Il nome del soggetto, uguale per le righe della stessa controparte: maiuscole, spazi
 * singoli, senza il «Pagamento …»/«Incasso …» che la prima nota mette davanti al nome.
 */
export function chiaveSoggetto(descrizione: string | null | undefined): string {
  const pulita = (descrizione ?? "")
    .replace(/^\s*(pagamento|incasso|bonifico|saldo|acconto)\s+(a\s+|da\s+|fattura\s+)?/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return pulita || "SENZA NOME";
}

export interface Partita {
  soggetto: string;
  dare: number;
  avere: number;
  saldo: number;
  movimenti: number;
  ultimo: string;
}

/** Il conto diviso per soggetto: dal saldo più grande (in valore assoluto) al più piccolo. */
export function partitario(scritture: readonly Scrittura[], contoId: string): Partita[] {
  const perSoggetto = new Map<string, { dare: number; avere: number; movimenti: number; ultimo: string }>();
  for (const s of scritture) {
    for (const r of s.contabilita_righe ?? []) {
      if (r.conto_id !== contoId) continue;
      const k = chiaveSoggetto(r.descrizione ?? s.descrizione);
      const p = perSoggetto.get(k) ?? { dare: 0, avere: 0, movimenti: 0, ultimo: "" };
      p.dare += cent(r.dare);
      p.avere += cent(r.avere);
      p.movimenti += 1;
      if (s.data_registrazione > p.ultimo) p.ultimo = s.data_registrazione;
      perSoggetto.set(k, p);
    }
  }
  return [...perSoggetto.entries()]
    .map(([soggetto, p]) => ({
      soggetto, dare: p.dare / 100, avere: p.avere / 100, saldo: (p.dare - p.avere) / 100, movimenti: p.movimenti, ultimo: p.ultimo,
    }))
    .sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo) || a.soggetto.localeCompare(b.soggetto));
}

/** I conti dove ha senso il partitario: clienti e fornitori (per ruolo o per descrizione). */
export function contoAPartite(c: Pick<ContoContabile, "codice" | "descrizione" | "codice_standard">): boolean {
  const ruolo = c.codice_standard ?? c.codice;
  return ruolo === "05.01" || ruolo === "13.04" || /\b(clienti|fornitori)\b/i.test(c.descrizione);
}

const euro = (n: number | null): string =>
  n === null ? "" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(n);
const dataIT = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const saldoInLettere = (n: number) => (n === 0 ? euro(0) : `${euro(Math.abs(n))} ${n > 0 ? "dare" : "avere"}`);

/** Il foglio A4 del mastrino (o della scheda di un soggetto). */
export function htmlMastrino(d: {
  azienda: AziendaIntestazione;
  scritture: readonly Scrittura[];
  conto: ContoContabile;
  soggetto?: string;
  dal: string;
  al: string;
}): string {
  const m = mastrino(d.scritture, d.conto.id, d.soggetto);
  return htmlDocumentoContabile<MovimentoMastrino>({
    titolo: d.soggetto ? `Scheda ${d.soggetto}` : `Mastrino ${d.conto.codice}`,
    periodo: periodoInLettere(d.dal, d.al),
    sottotitolo: `${d.conto.codice} ${d.conto.descrizione}${d.soggetto ? ` · ${d.soggetto}` : ""}: movimenti in ordine di data con il saldo progressivo.`,
    azienda: d.azienda,
    piede: PIEDE_LIBRO,
    riepilogo: [
      { etichetta: "Movimenti", valore: String(m.movimenti.length) },
      { etichetta: "Totale dare", valore: euro(m.dare) },
      { etichetta: "Totale avere", valore: euro(m.avere) },
      { etichetta: "Saldo", valore: saldoInLettere(m.saldo) },
    ],
    colonne: [
      { intestazione: "Data", valore: (x) => dataIT(x.data), compatta: true, larghezza: "9%" },
      { intestazione: "N.", valore: (x) => x.numero, compatta: true, larghezza: "8%" },
      { intestazione: "Causale", valore: (x) => x.causale, larghezza: "24%" },
      { intestazione: "Descrizione", valore: (x) => x.descrizione, larghezza: "23%" },
      { intestazione: "Dare", valore: (x) => (x.dare ? euro(x.dare) : ""), allinea: "destra", compatta: true, larghezza: "12%" },
      { intestazione: "Avere", valore: (x) => (x.avere ? euro(x.avere) : ""), allinea: "destra", compatta: true, larghezza: "12%" },
      { intestazione: "Saldo", valore: (x) => saldoInLettere(x.saldo), allinea: "destra", compatta: true, larghezza: "12%" },
    ],
    righe: m.movimenti,
    totali: [
      { etichetta: "Totale dare", valore: euro(m.dare) },
      { etichetta: "Totale avere", valore: euro(m.avere) },
      { etichetta: "Saldo", valore: saldoInLettere(m.saldo), forte: true },
    ],
    vuoto: "Nessun movimento in questo periodo.",
  });
}
