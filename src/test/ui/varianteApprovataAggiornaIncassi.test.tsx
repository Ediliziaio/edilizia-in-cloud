import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
const mock=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:mock.invoke}}}));
import { useVariationWorkflow } from '@/hooks/useVariationWorkflow';
afterEach(()=>{cleanup();vi.resetAllMocks();});

it('la conferma della variante rilegge contratto e incassi già aperti, senza scrivere altre rate o pagamenti',async()=>{
 const qc=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:120000}}});
 const keys=[['orders','o1'],['order-economics-canonical','o1'],['order-supplier-payments','quadro','o1'],['ordine-fatture','o1','c1']];
 let approvata=false;
 const refresh=vi.fn(async()=>({contratto:approvata?1220:1000,incassato:1070,residuo:150}));
 const observers=keys.map(key=>{
  qc.setQueryData(key,{contratto:1000,incassato:1070,residuo:150});
  const observer=new QueryObserver(qc,{queryKey:key,queryFn:refresh,staleTime:120000});
  return observer.subscribe(()=>{});
 });
 qc.setQueryData(['ordini-variazione','o1','c1'],[{id:'v1',status:'bozza'}]);
 qc.setQueryData(['planimetrie','c1'],[{id:'p1'}]);
 mock.invoke.mockImplementation(async()=>{approvata=true;return {data:{success:true,variation:{id:'v1',order_id:'o1',company_id:'c1',status:'approvato'},workspace:null,document:null},error:null};});
 const wrapper=({children}:{children:ReactNode})=><QueryClientProvider client={qc}>{children}</QueryClientProvider>;
 const hook=renderHook(()=>useVariationWorkflow('o1','c1'),{wrapper});
 try {
  expect(refresh).not.toHaveBeenCalled();
  await act(async()=>{await hook.result.current.request('v1','approve_offline',{confirmed:true});});
  keys.forEach(k=>expect(qc.getQueryData(k)).toEqual({contratto:1220,incassato:1070,residuo:150}));
  expect(qc.getQueryState(['ordini-variazione','o1','c1'])?.isInvalidated).toBe(true);
  expect(qc.getQueryState(['planimetrie','c1'])?.isInvalidated).toBe(false);
  expect(mock.invoke).toHaveBeenCalledTimes(1);
  expect(mock.invoke).toHaveBeenCalledWith('variante-commessa',{body:{action:'approve_offline',order_id:'o1',id:'v1',confirmed:true}});
 } finally {observers.forEach(stop=>stop());qc.clear();}
});
