/**
 * La prima nota come registro da stampare (09/11/2026).
 *
 * Nella pagina i movimenti si leggono dal più recente, e il «progressivo» è
 * quello della pagina a video: riparte da zero ogni cinquanta righe. Su carta
 * un registro si legge al contrario — dal primo giorno all'ultimo — e la
 * colonna del saldo deve partire da quello che c'era prima del periodo e
 * arrivare a quello che resta alla fine. Altrimenti sono numeri in fila.
 */
import {
  htmlDocumentoContabile,
  type AziendaIntestazione,
} from "./documentoContabile";

export interface MovimentoPrimaNota {
  entry_date: string;
  direction: "entrata" | "uscita";
  category: string;
  description: string;
  amount: number;
  payment_method?: string | null;
  reference_number?: string | null;
  account_label?: string | null;
  notes?: string | null;
  is_auto?: boolean;
}

/** Una riga del registro: col numero progressivo e il saldo dopo il movimento. */
export interface RigaRegistro extends MovimentoPrimaNota {
  numero: number;
  entrata: number | null;
  uscita: number | null;
  saldo: number;
}

export interface RegistroPrimaNota {
  righe: RigaRegistro[];
  saldoIniziale: number;
  totaleEntrate: number;
  totaleUscite: number;
  saldoFinale: number;
}

const arrotonda = (n: number) => Math.round(n * 100) / 100;

/**
 * Dal più vecchio al più nuovo, col saldo che cammina.
 * `saldoIniziale` è quello che c'era prima del primo giorno del periodo: chi
 * chiama lo sa, qui non si inventa.
 */
export function costruisciRegistro(
  movimenti: readonly MovimentoPrimaNota[],
  saldoIniziale = 0,
): RegistroPrimaNota {
  const ordinati = [...movimenti].sort(
    (a, b) =>
      a.entry_date.localeCompare(b.entry_date) ||
      a.description.localeCompare(b.description, "it"),
  );
  let saldo = arrotonda(saldoIniziale);
  let totaleEntrate = 0;
  let totaleUscite = 0;
  const righe = ordinati.map((m, i) => {
    const entrata = m.direction === "entrata" ? arrotonda(m.amount) : null;
    const uscita = m.direction === "uscita" ? arrotonda(m.amount) : null;
    if (entrata !== null) totaleEntrate = arrotonda(totaleEntrate + entrata);
    if (uscita !== null) totaleUscite = arrotonda(totaleUscite + uscita);
    saldo = arrotonda(saldo + (entrata ?? 0) - (uscita ?? 0));
    return { ...m, numero: i + 1, entrata, uscita, saldo };
  });
  return {
    righe,
    saldoIniziale: arrotonda(saldoIniziale),
    totaleEntrate,
    totaleUscite,
    saldoFinale: saldo,
  };
}

// `useGrouping: "always"`: senza, il browser lascia «1500,00 €» accanto a
// «12.200,00 €» — raggruppa solo da cinque cifre in su. In una colonna di
// importi incolonnati si vede subito, e su un documento contabile stona.
const euro = (n: number | null): string =>
  n === null
    ? ""
    : new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        useGrouping: "always",
      }).format(n);

const dataIT = (iso: string): string => {
  const [a, m, g] = (iso ?? "").slice(0, 10).split("-");
  return g && m && a ? `${g}/${m}/${a}` : iso;
};

/** «1 gennaio – 31 marzo 2026», o «dal 01/01/2026» quando manca un estremo. */
export function periodoInLettere(dal: string, al: string): string {
  if (!dal && !al) return "Tutto lo storico";
  if (!dal) return `Fino al ${dataIT(al)}`;
  if (!al) return `Dal ${dataIT(dal)}`;
  return `Dal ${dataIT(dal)} al ${dataIT(al)}`;
}

const CASSA_O_BANCA: Record<string, string> = { cassa: "Cassa", banca: "Banca" };

/** Il foglio A4 della prima nota, pronto da stampare. */
export function htmlRegistroPrimaNota(d: {
  azienda: AziendaIntestazione;
  movimenti: readonly MovimentoPrimaNota[];
  saldoIniziale?: number;
  dal: string;
  al: string;
  /** «Cassa», «Banca», o niente quando il registro le tiene insieme. */
  conto?: string | null;
}): string {
  const r = costruisciRegistro(d.movimenti, d.saldoIniziale ?? 0);
  const conto = d.conto ? (CASSA_O_BANCA[d.conto] ?? d.conto) : null;
  return htmlDocumentoContabile<RigaRegistro>({
    titolo: conto ? `Prima nota · ${conto}` : "Prima nota",
    periodo: periodoInLettere(d.dal, d.al),
    sottotitolo:
      "Movimenti in ordine di data, col saldo progressivo. Le registrazioni segnate «auto» nascono da fatture, incassi o movimenti di banca già registrati nel gestionale.",
    azienda: d.azienda,
    riepilogo: [
      { etichetta: "Saldo iniziale", valore: euro(r.saldoIniziale) },
      { etichetta: "Entrate del periodo", valore: euro(r.totaleEntrate) },
      { etichetta: "Uscite del periodo", valore: euro(r.totaleUscite) },
      { etichetta: "Saldo finale", valore: euro(r.saldoFinale) },
    ],
    colonne: [
      { intestazione: "N.", valore: (x) => String(x.numero), allinea: "destra", compatta: true, larghezza: "4%" },
      { intestazione: "Data", valore: (x) => dataIT(x.entry_date), compatta: true, larghezza: "9%" },
      { intestazione: "Descrizione", valore: (x) => x.description, larghezza: "33%" },
      { intestazione: "Categoria", valore: (x) => x.category, larghezza: "12%" },
      { intestazione: "Rif.", valore: (x) => x.reference_number ?? "", larghezza: "10%" },
      { intestazione: "Entrate", valore: (x) => euro(x.entrata), allinea: "destra", compatta: true, larghezza: "11%" },
      { intestazione: "Uscite", valore: (x) => euro(x.uscita), allinea: "destra", compatta: true, larghezza: "11%" },
      { intestazione: "Saldo", valore: (x) => euro(x.saldo), allinea: "destra", compatta: true, larghezza: "10%" },
    ],
    righe: r.righe,
    totali: [
      { etichetta: "Saldo iniziale", valore: euro(r.saldoIniziale) },
      { etichetta: `Entrate del periodo (${r.righe.filter((x) => x.entrata !== null).length} movimenti)`, valore: euro(r.totaleEntrate) },
      { etichetta: `Uscite del periodo (${r.righe.filter((x) => x.uscita !== null).length} movimenti)`, valore: euro(-r.totaleUscite) },
      { etichetta: "Saldo finale", valore: euro(r.saldoFinale), forte: true },
    ],
    vuoto: "Nessun movimento in questo periodo.",
  });
}

/** Le colonne del foglio Excel: le stesse della stampa, coi numeri veri. */
export function righeExcelPrimaNota(r: RegistroPrimaNota) {
  return r.righe.map((x) => ({
    numero: x.numero,
    data: dataIT(x.entry_date),
    descrizione: x.description,
    categoria: x.category,
    riferimento: x.reference_number ?? "",
    metodo: x.payment_method ?? "",
    conto: x.account_label ? (CASSA_O_BANCA[x.account_label] ?? x.account_label) : "",
    entrate: x.entrata ?? 0,
    uscite: x.uscita ?? 0,
    saldo: x.saldo,
    origine: x.is_auto ? "Automatica" : "A mano",
    note: x.notes ?? "",
  }));
}
