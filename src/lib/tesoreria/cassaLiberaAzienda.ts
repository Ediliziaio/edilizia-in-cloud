/**
 * «Cassa libera» dell'azienda: quanto dei soldi che hai in banca è davvero tuo.
 *
 * Il saldo del conto è il numero che tutti guardano, ed è quello che inganna di
 * più: dentro ci sono gli acconti dei clienti, che sono lavoro ancora da fare, e
 * fuori ci sono le fatture dei fornitori già arrivate, che hanno solo una data.
 * Un titolare che legge 80.000 € e prende un lavoro nuovo può averne 15.000.
 *
 * Qui i fatti restano separati dalle stime, come nella commessa
 * (`cassaLiberaCommessa`):
 * - `libera` usa solo fatti: saldo dei conti meno le uscite già registrate e
 *   non pagate;
 * - `daIncassare` e `anticipatoDaiCantieri` sono contesto, e NON si sommano:
 *   il credito non è cassa finché non arriva, e l'anticipo dei cantieri è già
 *   dentro al saldo dei conti — sottrarlo lo conterebbe due volte.
 *
 * Modulo puro: niente React, niente Supabase.
 */

export interface ScadenzaCassa {
  /** «entrata» = credito verso il cliente, «uscita» = debito verso il fornitore. */
  direction?: string | null;
  amount?: number | null;
  paid_amount?: number | null;
  due_date?: string | null;
}

export interface CassaLiberaAzienda {
  /** Saldo di tutti i conti attivi, oggi. */
  inBanca: number;
  /** Uscite registrate e non ancora pagate, qualunque sia la scadenza. */
  daPagare: number;
  /** inBanca − daPagare: quello che resta dopo le fatture già arrivate. */
  libera: number;
  /** La parte di `daPagare` che scade entro i giorni dati (scaduto compreso). */
  scadeSubito: number;
  /** La parte di `daPagare` già scaduta. */
  scaduto: number;
  /** Crediti aperti verso i clienti: contesto, non cassa. */
  daIncassare: number;
  /** Quanto i cantieri aperti hanno pagato più di quanto incassato: contesto. */
  anticipatoDaiCantieri: number;
  /** true se la cassa libera copre quello che scade subito. */
  copre: boolean;
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const c = (v: number) => Math.round(v * 100) / 100;
const giorno = (v: string | null | undefined) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;

/** La data di `giorni` giorni dopo `oggi`, in forma `AAAA-MM-GG`. */
export function fraGiorni(oggi: string, giorni: number): string {
  const d = new Date(`${oggi}T00:00:00`);
  d.setDate(d.getDate() + giorni);
  return d.toLocaleDateString("en-CA");
}

export function cassaLiberaAzienda(input: {
  /** Saldi dei conti attivi (uno per conto). */
  saldiConti: readonly (number | null | undefined)[];
  /** Scadenze ancora aperte: residuo = amount − paid_amount. */
  scadenzeAperte: readonly ScadenzaCassa[];
  /** Saldo (incassato − pagato) di ogni cantiere aperto; i negativi sono anticipi tuoi. */
  saldiCantieriAperti?: readonly (number | null | undefined)[];
  /** Oggi, in forma `AAAA-MM-GG`. */
  oggi: string;
  /** Finestra del «scade subito»; 30 giorni se non detto. */
  giorniVicini?: number;
}): CassaLiberaAzienda {
  const inBanca = c(input.saldiConti.reduce<number>((somma, v) => somma + n(v), 0));
  const limite = fraGiorni(input.oggi, Math.max(0, input.giorniVicini ?? 30));

  let daPagare = 0;
  let scadeSubito = 0;
  let scaduto = 0;
  let daIncassare = 0;
  for (const s of input.scadenzeAperte) {
    const residuo = n(s.amount) - n(s.paid_amount);
    if (residuo <= 0) continue;
    const uscita = (s.direction ?? "").trim().toLocaleLowerCase("it-IT") === "uscita";
    if (!uscita) { daIncassare += residuo; continue; }
    daPagare += residuo;
    const scadenza = giorno(s.due_date);
    // Senza data non si può dire che scade subito: resta nel totale e basta.
    if (!scadenza) continue;
    if (scadenza <= limite) scadeSubito += residuo;
    if (scadenza < input.oggi) scaduto += residuo;
  }

  const anticipatoDaiCantieri = c(
    (input.saldiCantieriAperti ?? []).reduce<number>((somma, v) => somma + Math.max(0, -n(v)), 0),
  );
  const libera = c(inBanca - c(daPagare));

  return {
    inBanca,
    daPagare: c(daPagare),
    libera,
    scadeSubito: c(scadeSubito),
    scaduto: c(scaduto),
    daIncassare: c(daIncassare),
    anticipatoDaiCantieri,
    copre: libera >= c(scadeSubito),
  };
}
