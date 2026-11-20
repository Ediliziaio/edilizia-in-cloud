import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
const m=vi.hoisted(()=>({rpc:vi.fn(),refresh:vi.fn(),from:vi.fn(),data:true}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:m.rpc,from:m.from}}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({effectiveCompany:{id:'c'},user:{id:'u'}})}));
vi.mock('@/lib/orders/refreshWorkQueries',()=>({refreshWorkQueries:m.refresh}));
vi.mock('sonner',()=>({toast:{error:vi.fn(),success:vi.fn()}}));
vi.mock('@tanstack/react-query',async importOriginal=>{
  const actual=await importOriginal<typeof import('@tanstack/react-query')>();
  return {...actual,useQuery:({queryKey}:{queryKey:unknown[]})=>({data:queryKey[0]==='order_work_phases' ? (m.data ? {phases:[{id:'a',assignments:[] as PhaseAssignment[]},{id:'b',assignments:[] as PhaseAssignment[]}],unassigned:[] as PhaseAssignment[],all:[] as PhaseAssignment[]} : undefined) : [],isLoading:false,isError:false,refetch:vi.fn()})};
});
import { useOrderWorkPhases, type PhaseAssignment } from '@/hooks/useOrderWorkPhases';
beforeEach(()=>{vi.clearAllMocks();m.data=true;m.rpc.mockResolvedValue({data:2,error:null});});afterEach(cleanup);
function open(){const qc=new QueryClient({defaultOptions:{mutations:{retry:false}}});return renderHook(()=>useOrderWorkPhases('ordine'),{wrapper:({children}:{children:ReactNode})=><QueryClientProvider client={qc}>{children}</QueryClientProvider>});}
it('riordina in una sola richiesta con la sequenza letta come versione attesa',async()=>{
  const {result}=open();await act(()=>result.current.riordinaFasi.mutateAsync(['b','a']));
  expect(m.rpc).toHaveBeenCalledExactlyOnceWith('riordina_fasi_commessa',{p_order_id:'ordine',p_fasi:['b','a'],p_ordine_atteso:['a','b']});
  expect(m.from).not.toHaveBeenCalled();expect(m.refresh).toHaveBeenCalled();
});
it('rilegge le fasi anche se la risposta è persa dopo un possibile commit',async()=>{
  m.rpc.mockRejectedValue(new TypeError('Failed to fetch'));const {result}=open();
  await act(async()=>{await expect(result.current.riordinaFasi.mutateAsync(['b','a'])).rejects.toThrow('Failed to fetch');});
  expect(m.refresh).toHaveBeenCalled();expect(m.rpc).toHaveBeenCalledTimes(1);
});
it('senza una versione letta chiede di ricaricare e non scrive',async()=>{
  m.data=false;const {result}=open();await act(async()=>{await expect(result.current.riordinaFasi.mutateAsync(['b','a'])).rejects.toThrow(/Ricarica/);});
  expect(m.rpc).not.toHaveBeenCalled();
});
