import type { QueryClient } from '@tanstack/react-query';

// Un commit finanziario aggiorna tutti i lettori dello stesso fatto economico.
const prefixes = new Set([
  'contabilita-generale', 'documenti-fiscali', 'invoices', 'invoice', 'invoice-reconciliations',
  'rate-fatture-disponibili', 'rate-fattura-quote', 'ritenute-attive-commessa', 'ritenute-garanzia', 'commessa-iva', 'ordine-fatture', 'fattura-ordini', 'order-ritenute-for-invoice', 'order-documenti-for-invoice', 'order-sal-for-invoice',
  'incassi-fattura', 'incassi-importate', 'movimenti-cassa', 'ritenute-bonifici',
  'fatture-emesse-importate', 'emessa-importata-dettaglio', 'fatture-ricevute-pagamento', 'fatture-costi-commesse',
  'billing-doc-counts', 'billing-monthly-timeline', 'riba-fornitori', 'sal-matura', 'uscite-senza-fattura',
  'costs', 'company-costs', 'costo-annullo-anteprima', 'cashflow', 'prima-nota', 'primaNota', 'scadenzario',
  'orders', 'ordini-variazione', 'order-supplier-payments', 'order-economics-canonical', 'order-subcontract-statistics',
  'oda-contabilita', 'purchase-orders', 'fatture-ricevute', 'fattura-ricevuta-riepilogo', 'sal-sub', 'sal-sub-tutti',
  'contratti-sub', 'ritenute-sub', 'ritenute-sub-tutte', 'subappaltatori-page', 'subappalto-contratti',
  'mezzi-piano-fonti', 'fattura-collegamenti-pagamenti', 'pagamento-costo', 'pagamento-costo-banca', 'pagamento-costo-sal', 'pagamenti-sal-candidati', 'bank-transactions',
  'bank-reconciliation', 'bank-lotto-movimenti', 'bank-lotto-candidati', 'bank-movimenti-workspace', 'bank-movimento', 'bank-candidati', 'bank-contesto-movimenti', 'esposizione-commessa', 'suppliers', 'commessa-fatture-fornitori',
  'generale-fatture-fornitori', 'generale-controllo-forniture', 'generale-cassa-effettiva', 'generale-piano-reale', 'commessa-generale-riepilogo',
  'incassi-registrati', 'incassi-unita', 'generale-unita',
  'commessa-importi-finanziari', 'orders-global-stats', 'orders-monthly-chart', 'orders-monthly-sales-chart', 'mappa-commesse-generali',
]);
// Gli acquisti cambiano insieme documento, quantità, prezzi e conto economico.
// Nessun polling globale: si avvisano le altre schede soltanto dopo un salvataggio.
const purchasingPrefixes = new Set([
  'material-procurement', 'material-procurement-unmapped', 'po-item-coverage', 'po-item-coverage-panel',
  'linked-purchase-orders', 'oes-oda', 'commessa-bolle-ddt', 'commessa-fatture-fornitori',
  'generale-controllo-forniture', 'generale-piano-reale', 'commessa-generale-riepilogo',
  'ddt-ricezione', 'ddt-consegne', 'ddt-controllo-ordini', 'ddt-righe-ordine', 'oda-residui-destinazioni', 'ddt-righe-ordini-citati',
  'ddt-fatture-collegate', 'ddt-fatture-fornitore', 'ddt-valorizzazioni', 'ddt-fattura-righe',
  'fattura-collegamenti', 'fattura-ddt-riepilogo', 'fattura-collega-commesse', 'fattura-confronto', 'purchase-orders', 'purchase-order-items',
  // Una destinazione DDT può aggiornare anche la ripartizione del costo della fattura.
  'company-costs', 'costs', 'scadenzario', 'fatture-ricevute', 'fattura-ricevuta-riepilogo',
  'order-items', 'order_items', 'materiali-per-fase', 'materiali', 'oda-contabilita',
  'oda-pagamenti-riepilogo', 'commessa-impegni-acquisti', 'order-economics-canonical', 'orders',
]);
export function isPurchasingQuery(key: readonly unknown[]) {
  return typeof key[0] === 'string' && purchasingPrefixes.has(key[0]);
}
function avvisaSchede(event: 'commit' | 'purchasing') {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel('eic-financial-commit');
  channel.postMessage({ event }); // Solo un segnale: nessun documento o dato personale.
  channel.close();
}
export function refreshPurchasingQueries(client: QueryClient, broadcast = true) {
  void client.invalidateQueries({ predicate: q => isPurchasingQuery(q.queryKey) });
  if (broadcast) avvisaSchede('purchasing');
}
export function isFinancialQuery(key: readonly unknown[]) {
  return (typeof key[0] === 'string' && prefixes.has(key[0])) || isPurchasingQuery(key);
}
export function refreshFinancialQueries(client: QueryClient, broadcast = true) {
  void client.invalidateQueries({ predicate: q => isFinancialQuery(q.queryKey) });
  if (typeof window !== "undefined") window.dispatchEvent(new Event("eic-financial-refresh"));
  if (broadcast) avvisaSchede('commit');
}
