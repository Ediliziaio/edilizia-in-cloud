import type { QueryClient } from '@tanstack/react-query';

// Un commit finanziario aggiorna tutti i lettori dello stesso fatto economico.
const prefixes = new Set([
  'costs', 'company-costs', 'cashflow', 'prima-nota', 'primaNota', 'scadenzario',
  'orders', 'order-supplier-payments', 'order-economics-canonical', 'order-subcontract-statistics',
  'oda-contabilita', 'purchase-orders', 'fatture-ricevute', 'fattura-ricevuta-riepilogo', 'sal-sub', 'sal-sub-tutti',
  'contratti-sub', 'ritenute-sub', 'ritenute-sub-tutte', 'subappaltatori-page', 'subappalto-contratti',
  'mezzi-piano-fonti', 'pagamento-costo', 'pagamento-costo-banca', 'pagamento-costo-sal', 'pagamenti-sal-candidati', 'bank-transactions',
  'bank-reconciliation', 'esposizione-commessa', 'suppliers', 'commessa-fatture-fornitori',
  'generale-controllo-forniture', 'generale-cassa-effettiva', 'generale-piano-reale', 'commessa-generale-riepilogo',
  'incassi-registrati', 'incassi-unita', 'generale-unita',
  'commessa-importi-finanziari', 'orders-global-stats', 'orders-monthly-chart', 'mappa-commesse-generali',
]);
export function isFinancialQuery(key: readonly unknown[]) {
  return typeof key[0] === 'string' && prefixes.has(key[0]);
}
export function refreshFinancialQueries(client: QueryClient, broadcast = true) {
  void client.invalidateQueries({ predicate: q => isFinancialQuery(q.queryKey) });
  if (typeof window !== "undefined") window.dispatchEvent(new Event("eic-financial-refresh"));
  if (broadcast && typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('eic-financial-commit');
    channel.postMessage({ event: 'commit' }); // Nessun importo o dato personale tra finestre.
    channel.close();
  }
}
