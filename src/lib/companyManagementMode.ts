import type { Permissions } from '@/hooks/usePermissions';

export type CompanyManagementMode = 'complete' | 'accounting';
const accountingAreas = [
  'attivita','email','chat','cruscotto','documenti','fatturazione','tesoreria',
  'scadenzario','prima-nota','contabilita-generale','costi','previsionale','controllo-gestione',
  'analisi-acquisti','clienti','contenuti-multimediali',
];
const accountingSettings = new Set([
  'mio-profilo','profilo','sedi','documenti-azienda','branding','abbonamento',
  'persone','utenti','notifiche','sicurezza-privacy','esporta-dati',
  'listino','tariffe','bundle','fornitori','categorie-costi','modelli-pagamento',
  'automazioni-finanza','finanziamenti','modelli-pdf','template-preventivi',
  'contratti-e-condizioni','integrazioni','api','webhook','dominio-email',
  'fatturazione','banca',
]);

/** Il profilo azienda semplifica le aree disponibili; i permessi personali
 * continuano a decidere cosa ciascuno può fare dentro quelle aree. */
export function isCompanyPathAvailable(mode: CompanyManagementMode | undefined, url: string): boolean {
  if (mode !== 'accounting') return true;
  const path=url.split(/[?#]/)[0].replace(/\/$/,'');
  if (path==='/azienda/impostazioni') return true;
  if (path.startsWith('/azienda/impostazioni/')) return accountingSettings.has(path.split('/')[3]);
  return accountingAreas.some(area=>path===`/azienda/${area}` || path.startsWith(`/azienda/${area}/`));
}

export function accountingHome(p: Permissions): string {
  if (p.isAdmin || p.canViewPrimaNota) return '/azienda/prima-nota';
  if (p.canViewBilling) return '/azienda/documenti';
  if (p.canViewTesoreria) return '/azienda/tesoreria';
  if (p.canViewCruscotto) return '/azienda/cruscotto/aziendale';
  return '/azienda/impostazioni/mio-profilo';
}
