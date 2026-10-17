import {cleanup,renderHook,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {useSquadre,useSquadreCommessa} from '@/hooks/useOperai';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc}}));
vi.mock('@/hooks/useEffectiveCompanyId',()=>({useEffectiveCompanyId:()=> 'palma'}));
vi.mock('@/hooks/usePermissions',()=>({usePermissions:()=>({})}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe('Lettura squadre senza operazioni di scrittura',()=>{
 it('legge con GET mantenendo azienda e commessa, distingue vuoto da errore',async()=>{
  rpc.mockResolvedValue({data:[],error:null});
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const wrapper=({children}:{children:React.ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook=renderHook(()=>({company:useSquadre(),order:useSquadreCommessa('commessa-palma')}),{wrapper});
  await waitFor(()=>expect(hook.result.current.order.isSuccess).toBe(true));
  await waitFor(()=>expect(hook.result.current.company.isSuccess).toBe(true));
  expect(rpc).toHaveBeenCalledWith('manodopera_squadre',{p_company_id:'palma'},{get:true});
  expect(rpc).toHaveBeenCalledWith('manodopera_squadre_commessa',{p_order_id:'commessa-palma'},{get:true});
  expect(hook.result.current.order.data).toEqual([]);
  rpc.mockResolvedValue({data:null,error:new Error('Lettura non disponibile')});
  await hook.result.current.order.refetch();
  await waitFor(()=>expect(hook.result.current.order.isError).toBe(true));
  client.clear();
 });
});
