/**
 * I dodici mesi delle fatture ricevute, nella stessa forma delle emesse.
 * Pagato e residuo usano gli stessi saldi della tabella. Le rifiutate non contano.
 */
import { imponibileIvaFornitori, importoFornitori, nonSiPaga } from "@/lib/fatturazione/noteDiCredito";
import { prossimaScadenza } from "@/lib/fatturazione/colonneRicevute";
import type { MonthSummary } from "@/hooks/billing/useMonthlyTimeline";

const NOMI = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export interface RicevutaPerMesi {
  id: string;
  data_fattura: string | null;
  stato?: string | null;
  tipo_documento?: string | null;
  totale_documento?: number | null;
  imponibile_totale?: number | null;
  iva_totale?: number | null;
  netto_a_pagare?: number | null;
  piano_pagamento?: unknown;
}

const cent = (n: number) => Math.round(n * 100) / 100;

export function mesiRicevute(
  fatture: ReadonlyArray<RicevutaPerMesi>, anno: number,
  saldi: ReadonlyMap<string, { pagato: number | null; residuo: number | null }>, oggi: string,
): MonthSummary[] {
  const mesi: MonthSummary[] = NOMI.map((label, i) => ({
    year: anno, month: i + 1, label, key: `${anno}-${String(i + 1).padStart(2, "0")}`,
    docCount: 0, totalAmount: 0, imponibile: 0, iva: 0, incassato: 0, daIncassare: 0, scaduto: 0,
  }));
  const perMese = new Map<number, RicevutaPerMesi[]>();
  for (const f of fatture) {
    if (!f.data_fattura || f.stato === "rifiutata") continue;
    if (Number(f.data_fattura.slice(0, 4)) !== anno) continue;
    const m = Number(f.data_fattura.slice(5, 7));
    if (!(m >= 1 && m <= 12)) continue;
    const lista = perMese.get(m) ?? [];
    lista.push(f);
    perMese.set(m, lista);
  }
  for (const [m, lista] of perMese) {
    const mese = mesi[m - 1];
    mese.docCount = lista.length;
    mese.totalAmount = importoFornitori(lista);
    const { imponibile, iva } = imponibileIvaFornitori(lista);
    mese.imponibile = imponibile;
    mese.iva = iva;
    let pagato = 0;
    let daPagare = 0;
    let scaduto = 0;
    for (const f of lista) {
      if (nonSiPaga(f.tipo_documento)) continue;
      const saldo = saldi.get(f.id);
      if (!saldo) continue;
      pagato += saldo.pagato ?? 0;
      const resto = saldo.residuo ?? 0;
      daPagare += resto;
      const scadenza = prossimaScadenza(f.piano_pagamento, oggi);
      if (scadenza && scadenza < oggi) scaduto += resto;
    }
    mese.incassato = cent(pagato);
    mese.daIncassare = cent(daPagare);
    mese.scaduto = cent(scaduto);
  }
  return mesi;
}
