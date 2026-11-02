/**
 * Una riga del file «Importa Commesse» → cosa va al database (02/11/2026).
 *
 * Prima gli importi passavano da parseFloat: «12.000,50» diventava 12 € senza
 * nessun avviso, l'IVA restava al 22% per tutte e le rate non nascevano. Qui un
 * numero che non si legge ferma la riga invece di diventarne un altro.
 *
 * Come nel modulo Nuova Commessa: il totale è SENZA IVA, le rate sono con l'IVA.
 * Modulo puro: niente React, niente Supabase.
 */
import { buildInstallmentsFromLegacy, type Installment } from "@/lib/orderUtils";
import { parseDecimalIT } from "@/lib/parseDecimalIT";

const arrotonda = (n: number): number => Math.round(n * 100) / 100;

/** Il numero di una cella: null se vuota, NaN se non si legge. */
export function numeroDaCella(cella: string | null | undefined): number | null {
  const testo = (cella ?? "").trim();
  if (!testo) return null;
  if (!/^-?[\d.,\s]+\s*(€|EUR)?$/i.test(testo) || !/\d/.test(testo)) return Number.NaN;
  return parseDecimalIT(testo);
}

/** La data di una cella in formato ISO: gg/mm/aaaa o aaaa-mm-gg; null se vuota, undefined se non si legge. */
export function dataDaCella(cella: string | null | undefined): string | null | undefined {
  const testo = (cella ?? "").trim();
  if (!testo) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(testo);
  const it = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(testo);
  const [anno, mese, giorno] = iso ? [iso[1], iso[2], iso[3]] : it ? [it[3], it[2].padStart(2, "0"), it[1].padStart(2, "0")] : [];
  if (!anno) return undefined;
  const risultato = `${anno}-${mese}-${giorno}`;
  const data = new Date(`${risultato}T12:00:00Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === risultato ? risultato : undefined;
}

export interface ContestoImport {
  aziendaId: string;
  /** Solo i clienti, per email minuscola: un dipendente non può diventare intestatario. */
  clientePerEmail: ReadonlyMap<string, string>;
  /** Codici già presi, minuscoli. */
  codiciEsistenti: ReadonlySet<string>;
  statoPredefinito: string | null;
}

export type EsitoRiga =
  | { errore: string }
  | { ordine: Record<string, unknown>; rate: Installment[]; codice: string | null };

export function commessaDaRiga(riga: Record<string, string>, c: ContestoImport): EsitoRiga {
  const email = riga.customer_email?.trim().toLowerCase();
  if (!email) return { errore: "Email cliente mancante" };
  const cliente = c.clientePerEmail.get(email);
  if (!cliente) return { errore: `Cliente con email "${email}" non trovato` };
  const descrizione = riga.description?.trim();
  if (!descrizione) return { errore: "Descrizione mancante" };
  const codice = riga.order_code?.trim() || null;
  if (codice && c.codiciEsistenti.has(codice.toLowerCase())) return { errore: `Codice commessa "${codice}" già esistente` };

  const totale = numeroDaCella(riga.total_amount);
  if (totale === null || Number.isNaN(totale) || totale <= 0) return { errore: `Importo totale "${riga.total_amount ?? ""}" non valido` };
  const iva = numeroDaCella(riga.vat_rate);
  if (iva === null || Number.isNaN(iva) || iva < 0 || iva > 100) return { errore: `IVA "${riga.vat_rate ?? ""}" non valida: scrivi l'aliquota, per esempio 10 o 22` };

  const celle = { "Acconto 1": riga.deposit_amount, "Acconto 2": riga.deposit_2_amount, Saldo: riga.balance_amount };
  for (const [nome, cella] of Object.entries(celle)) {
    const n = numeroDaCella(cella);
    if (n !== null && (Number.isNaN(n) || n < 0)) return { errore: `${nome} "${cella}" non valido` };
  }
  const acconto1 = numeroDaCella(riga.deposit_amount) ?? 0;
  const acconto2 = numeroDaCella(riga.deposit_2_amount) ?? 0;
  const lordo = arrotonda(totale * (1 + iva / 100));
  const saldo = numeroDaCella(riga.balance_amount) ?? Math.max(0, arrotonda(lordo - acconto1 - acconto2));
  if (acconto1 + acconto2 + saldo > lordo + 1) {
    return { errore: `Acconti e saldo (${arrotonda(acconto1 + acconto2 + saldo)}) superano il totale con l'IVA (${lordo})` };
  }

  const date = {
    expected_date: dataDaCella(riga.expected_date),
    warehouse_arrival_date: dataDaCella(riga.warehouse_arrival_date),
    work_start_date: dataDaCella(riga.work_start_date),
  };
  for (const [campo, valore] of Object.entries(date)) {
    if (valore === undefined) return { errore: `Data "${riga[campo]}" non valida: scrivila come 31/12/2026` };
  }

  return {
    codice,
    ordine: {
      company_id: c.aziendaId,
      customer_id: cliente,
      order_code: codice,
      description: descrizione,
      total_amount: totale,
      vat_rate: iva,
      deposit_amount: acconto1,
      deposit_2_amount: acconto2,
      balance_amount: saldo,
      payment_type: "standard",
      internal_notes: riga.internal_notes?.trim() || null,
      current_status_id: c.statoPredefinito,
      ...date,
    },
    rate: buildInstallmentsFromLegacy({ deposit_amount: acconto1, deposit_2_amount: acconto2, balance_amount: saldo, payment_type: "standard" }),
  };
}
