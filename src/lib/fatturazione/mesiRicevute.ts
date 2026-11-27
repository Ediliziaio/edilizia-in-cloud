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

/**
 * Quanto del residuo è già scaduto. Con un piano che ha date e importi: le rate
 * con scadenza passata, meno quanto è stato pagato, al massimo il residuo. Così una
 * rata scaduta non pagata conta anche se la successiva deve ancora arrivare: è il
 * caso della rata «segnata pagata» senza pagamento registrato, che il server ha
 * rimesso nel residuo (27/11/2026). Senza importi nel piano: tutto il residuo se
 * anche la prossima scadenza è passata, come prima.
 */
export function scadutoRicevuta(piano: unknown, pagato: number, residuo: number, oggi: string): number {
  if (residuo <= 0) return 0;
  const rate = (Array.isArray(piano) ? piano : []) as Array<{ scadenza?: unknown; importo?: unknown }>;
  const datate = rate.filter((r) => typeof r?.scadenza === "string" && r.scadenza.length >= 10);
  const importi = datate.map((r) => (typeof r.importo === "number" ? r.importo : typeof r.importo === "string" ? Number(r.importo) : NaN));
  if (datate.length && importi.every((n) => Number.isFinite(n))) {
    const scadute = datate.reduce((tot, r, i) => (String(r.scadenza).slice(0, 10) < oggi ? tot + importi[i] : tot), 0);
    return Math.min(residuo, Math.max(0, scadute - pagato));
  }
  const scadenza = prossimaScadenza(piano, oggi);
  return scadenza && scadenza < oggi ? residuo : 0;
}

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
      scaduto += scadutoRicevuta(f.piano_pagamento, saldo.pagato ?? 0, resto, oggi);
    }
    mese.incassato = cent(pagato);
    mese.daIncassare = cent(daPagare);
    mese.scaduto = cent(scaduto);
  }
  return mesi;
}
