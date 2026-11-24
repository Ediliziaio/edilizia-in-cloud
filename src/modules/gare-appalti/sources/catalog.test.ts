import { expect, it } from 'vitest';
import type { Workspace } from '../types';
import { matchingCatalogLots, readAnacCatalog, tenderForCig } from './catalog';

it('distingue l’oggetto di gara dal lotto, interpreta il CSV ANAC e scarta CIG ripetuti', () => {
 const csv = '\uFEFFCIG;OGGETTO_GARA;OGGETTO_LOTTO;IMPORTO_BASE_DASTA;DATA_SCADENZA_OFFERTA\n'
  + 'bd613d6005;"Manutenzione; patrimonio";Cremona Sud;1800000,50;16/11/2026 10:00\n'
  + 'BD613D6005;Duplicato;Cremona Sud;1800000,50;2026-11-16\n'
  + 'BD613D70D8;Manutenzione;Cremona Nord;0;31/02/2026\n';
 const result = readAnacCatalog(csv);
 expect(result.discarded).toBe(1);
 expect(result.lots[0]).toMatchObject({ cig:'BD613D6005', tenderTitle:'Manutenzione; patrimonio', title:'Cremona Sud', amount:'1800000.50', deadline:'2026-11-16' });
 expect(result.lots[1].deadline).toBe('');
 expect(matchingCatalogLots(result.lots,'patrimonio sud')).toHaveLength(1);
});
it('riconosce un CIG salvato nella descrizione di un lotto senza suggerire un secondo fascicolo', () => {
 const data = {
  lots:[{ tender_id:'t', code:'LOT-0001', title:'Zona Cremona Sud · CIG BD613D6005' }],
  tenders:[{ id:'t', official_id:'PROCEDURA-24' }],
 } as Pick<Workspace,'tenders'|'lots'>;
 expect(tenderForCig(data,'bd613d6005')?.id).toBe('t');
 expect(tenderForCig(data,'BD613D6004')).toBeUndefined();
});
