/**
 * I dodici mesi delle fatture ricevute, per la striscia e i sei numeri sopra l'elenco
 * (16/11/2026), nella stessa forma delle emesse (`MonthSummary`). Si calcolano dalle
 * fatture già caricate dalla pagina: nessuna query in più.
 *
 * Stesse regole della tabella:
 * - totale, imponibile e IVA con `importoFornitori`/`imponibileIvaFornitori` (la nota di
 *   credito toglie, l'autofattura non ha IVA da pagare al fornitore);
 * - «pagato» e «da pagare» solo per i documenti che si pagano (non note di credito né
 *   autofatture, non stornate del tutto): pagata = per intero; a rate = la quota delle rate
 *   pagate; il resto è da pagare, sul netto a pagare se c'è (ritenuta);
 * - «scaduto»: da pagare con tutte le scadenze del piano già passate.
 * Le rifiutate non contano.
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

export interface StatoPagamento {
  /** pagata per intero (sul costo o segnata) */
  pagata: (f: RicevutaPerMesi) => boolean;
  /** stornata del tutto da note di credito */
  stornata: (f: RicevutaPerMesi) => boolean;
  /** rate pagate su rate totali, se a rate e pagata in parte */
  rate?: (f: RicevutaPerMesi) => { pagate: number; totali: number } | undefined;
}

const cent = (n: number) => Math.round(n * 100) / 100;

export function mesiRicevute(
  fatture: ReadonlyArray<RicevutaPerMesi>, anno: number, stato: StatoPagamento, oggi: string,
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
      if (nonSiPaga(f.tipo_documento) || stato.stornata(f)) continue;
      const dovuto = Math.max(f.netto_a_pagare ?? f.totale_documento ?? 0, 0);
      if (stato.pagata(f)) { pagato += dovuto; continue; }
      const r = stato.rate?.(f);
      const parte = r && r.totali > 0 ? dovuto * Math.min(r.pagate / r.totali, 1) : 0;
      pagato += parte;
      const resto = dovuto - parte;
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
