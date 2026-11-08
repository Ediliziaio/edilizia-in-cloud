import { describe,it,expect } from 'vitest';
import { accountingHome,isCompanyPathAvailable } from '@/lib/companyManagementMode';
import type { Permissions } from '@/hooks/usePermissions';
describe('Profilo contabile e permessi personali',()=>{
 it('tiene fatturazione, finanza e listino, esclude cantieri, personale e CRM anche da URL diretti',()=>{
  for(const path of ['/azienda/prima-nota','/azienda/documenti/fatture-ricevute','/azienda/tesoreria','/azienda/controllo-gestione','/azienda/impostazioni/listino?tab=materiali','/azienda/impostazioni/fornitori']) expect(isCompanyPathAvailable('accounting',path),path).toBe(true);
  for(const path of ['/azienda/ordini/123','/azienda/personale','/azienda/manodopera','/azienda/marketing/contatti','/azienda/giornale-lavori','/azienda/impostazioni/calendari-lavori']) expect(isCompanyPathAvailable('accounting',path),path).toBe(false);
 });
 it('conserva le aree delle società complete e apre una home concessa ai contabili',()=>{
  expect(isCompanyPathAvailable('complete','/azienda/manodopera')).toBe(true);
  expect(isCompanyPathAvailable(undefined,'/azienda/ordini')).toBe(true);
  expect(accountingHome({canViewPrimaNota:true} as Permissions)).toBe('/azienda/prima-nota');
  expect(accountingHome({canViewBilling:true} as Permissions)).toBe('/azienda/documenti');
  expect(accountingHome({} as Permissions)).toBe('/azienda/impostazioni/mio-profilo');
 });
});
