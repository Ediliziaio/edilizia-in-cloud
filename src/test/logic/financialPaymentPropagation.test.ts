import {describe,it,expect} from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { refreshFinancialQueries } from '@/lib/orders/financialRefresh';
import { riepilogoContratto } from '@/lib/subappaltatori/riconciliazioneContratto';
import { subcontractStatistics } from '@/lib/orders/subcontractStatistics';
describe('Propagazione dei pagamenti',()=>{
  it('invalida fattura, contratto, noleggio, commessa e cassa conservando le query estranee',()=>{
    const q=new QueryClient();
    const keys=[['pagamento-costo','c'],['commessa-fatture-fornitori','o'],['contratti-sub','s'],['sal-sub-tutti','s'],['mezzi-piano-fonti','o'],['order-supplier-payments','o'],['prima-nota'],['scadenzario'],['orders','detail','o']];
    for(const key of keys)q.setQueryData(key,{ok:true});q.setQueryData(['calendar'],{ok:true});
    refreshFinancialQueries(q,false);
    for(const key of keys)expect(q.getQueryState(key)?.isInvalidated).toBe(true);
    expect(q.getQueryState(['calendar'])?.isInvalidated).toBe(false);
  });
  it('mantiene gli acconti SAL coerenti fra contratto e statistiche della commessa',()=>{
    const s={id:'s',contratto_id:'c',importo_lordo:1000,importo_netto:950,ritenuta_importo:50,pagato_registrato:400,stato:'verificato'};
    const c=riepilogoContratto({importo_contrattuale:1000},[s],[],[{importo:50,stato:'trattenuta'}]);
    expect(c.pagato).toBe(400);expect(c.daPagare).toBe(550);expect(c.ritenuteTrattenute).toBe(50);
    const statistiche=subcontractStatistics([{id:'c',importo_contrattuale:1000,stato:'attivo'}],[s]);
    expect(statistiche.paid).toBe(400);
  });
});
