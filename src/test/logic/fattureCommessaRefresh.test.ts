import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { refreshFinancialQueries } from '@/lib/orders/financialRefresh';

describe('Aggiornamento delle fatture nella commessa dopo un incasso',()=>{
  it('rilegge anche la query completa attiva, senza aspettare la scadenza della cache',async()=>{
    const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:120000}}});
    const key=['ordine-fatture','ordine-1','azienda-1','incassi-completi-v2'];
    client.setQueryData(key,[{id:'f1',importo_pagato:0}]);
    const load=vi.fn().mockResolvedValue([{id:'f1',importo_pagato:122}]);
    const observer=new QueryObserver(client,{queryKey:key,queryFn:load,staleTime:120000});
    const unsubscribe=observer.subscribe(()=>{});
    try {
      expect(load).not.toHaveBeenCalled();
      refreshFinancialQueries(client,false);
      await waitFor(()=>expect(client.getQueryData(key)).toEqual([{id:'f1',importo_pagato:122}]));
      expect(load).toHaveBeenCalledTimes(1);
    } finally {unsubscribe();client.clear();}
  });
  it('invalida i collegamenti fattura/commessa e conserva le cache estranee alla contabilità',()=>{
    const client=new QueryClient();
    client.setQueryData(['fattura-ordini','f1','c1'],[{ordine_id:'o1'}]);
    client.setQueryData(['planimetrie','c1'],[{id:'pianta'}]);
    refreshFinancialQueries(client,false);
    expect(client.getQueryState(['fattura-ordini','f1','c1'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['planimetrie','c1'])?.isInvalidated).toBe(false);
    client.clear();
  });
});
