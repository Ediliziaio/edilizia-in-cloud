interface Ordine { id: string; subtotal: number | string | null }
interface Costo { id: string; purchase_order_id: string; amount: number | string | null }
interface Quota { purchase_order_id: string; importo: number | string; fattura: { stato: string | null; company_cost_id: string | null } | null }
interface Nota { company_cost_id: string | null; imponibile_totale: number | string | null }
const n = (v: number | string | null) => Number(v) || 0;

/** La quota prudenziale già inclusa dal conto economico, oltre ai costi registrati.
 * Stessa regola di marginalita_costo_oda: un acconto non cancella l'impegno dell'ordine.
 * Non è una stima delle quantità ancora da consegnare e non è un debito da pagare. */
export function impegniAcquisti(ordini: Ordine[], costi: Costo[], quote: Quota[], note: Nota[]) {
  let impegno = 0;
  let registrato = 0;
  for (const o of ordini) {
    const spese = costi.filter(c => c.purchase_order_id === o.id);
    const costIds = new Set(spese.map(c => c.id));
    const costo = spese.reduce((s, c) => s + n(c.amount), 0);
    const ripartito = quote.filter(q => q.purchase_order_id === o.id && q.fattura?.stato === 'contabilizzata' && q.fattura.company_cost_id)
      .reduce((s, q) => s + n(q.importo), 0);
    const crediti = note.filter(c => c.company_cost_id && costIds.has(c.company_cost_id)).reduce((s, c) => s + Math.abs(n(c.imponibile_totale)), 0);
    registrato += costo + ripartito;
    impegno += Math.max(0, n(o.subtotal) - costo - ripartito - crediti);
  }
  return { registrato: Math.round(registrato * 100) / 100, impegno: Math.round(impegno * 100) / 100 };
}
export type { Ordine as OrdineImpegno, Costo as CostoImpegno, Quota as QuotaImpegno, Nota as NotaImpegno };
