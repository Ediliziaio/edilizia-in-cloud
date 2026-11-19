import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
const mock=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mock.rpc}}));
vi.mock('@/hooks/useEffectiveCompanyId',()=>({useEffectiveCompanyId:()=> 'c1'}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
import { useCreateMovimento, useDeleteMovimento } from '@/hooks/useMovimentiCassa';
afterEach(()=>{cleanup();vi.resetAllMocks();});

it.each(['incasso','storno'] as const)('%s aggiorna fatture, quote e riepiloghi già in cache nella commessa',async action=>{
 const qc=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
 const keys=[['ordine-fatture','o1','c1','incassi-completi-v2'],['orders','installments','o1','quote-v1'],['rate-fatture-disponibili','c1','o1'],['order-supplier-payments','quadro','o1'],['movimenti-cassa','c1'],['incassi-fattura','f1']];
 keys.forEach(k=>qc.setQueryData(k,{value:'precedente'}));
 qc.setQueryData(['planimetrie','c1'],[{id:'pianta'}]);
 mock.rpc.mockResolvedValue({error:null,data:'m1'});
 const wrapper=({children}:{children:ReactNode})=><QueryClientProvider client={qc}>{children}</QueryClientProvider>;
 const hook=renderHook(()=>({create:useCreateMovimento(),remove:useDeleteMovimento()}),{wrapper});
 await act(async()=>{
  if(action==='incasso')await hook.result.current.create.mutateAsync({documento_id:'f1',importo:250,metodo:'bonifico',data_movimento:'2026-11-18'});
  else await hook.result.current.remove.mutateAsync('m1');
 });
 expect(mock.rpc).toHaveBeenCalledTimes(1);
 expect(mock.rpc.mock.calls[0][0]).toBe(action==='incasso'?'registra_incasso_atomico':'storna_incasso_atomico');
 keys.forEach(k=>expect(qc.getQueryState(k)?.isInvalidated,JSON.stringify(k)).toBe(true));
 expect(qc.getQueryState(['planimetrie','c1'])?.isInvalidated).toBe(false);
 qc.clear();
});
