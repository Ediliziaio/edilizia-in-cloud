import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({rpc:vi.fn(),success:vi.fn(),error:vi.fn(),warning:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:state.rpc}}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({effectiveCompany:{id:'company'},user:{id:'actor'}})}));
vi.mock('@/lib/magazzino/protocolloMovimenti',async original=>({...await original<object>(),warehouseCapabilities:vi.fn(async()=>({version:1}))}));
vi.mock('sonner',()=>({toast:{success:state.success,error:state.error,warning:state.warning}}));
import { useReceiveFromOda } from '@/hooks/warehouse/useReceiveFromOda';
const input={odaId:'oda',warehouseId:'wh',entries:[{stockItemId:'s',quantity:1,serialNumbers:[],rawCode:'a'}] as never};
beforeEach(()=>{vi.clearAllMocks();});
it.each([null,{},[{shipped_items:-1,created_units:0,oda_now_complete:false,errors:[]}]])('non mostra successi per risposte assenti o invalide: %j',async data=>{
 state.rpc.mockResolvedValue({data,error:null});const client=new QueryClient();const {result}=renderHook(()=>useReceiveFromOda(),{wrapper:({children})=><QueryClientProvider client={client}>{children}</QueryClientProvider>});
 await act(async()=>{await expect(result.current.mutateAsync(input)).rejects.toThrow(/Esito della ricezione/);});expect(state.success).not.toHaveBeenCalled();
});
it('mantiene la ricezione parziale verificata',async()=>{
 state.rpc.mockResolvedValue({data:[{shipped_items:1,created_units:0,oda_now_complete:false,errors:[]}],error:null});const {result}=renderHook(()=>useReceiveFromOda(),{wrapper:({children})=><QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>});
 await act(async()=>{await result.current.mutateAsync(input);});expect(state.success).toHaveBeenCalledWith('Ricezione parziale (1 righe)',expect.anything());
});


it("non conferma una ricezione se tutte le righe della scansione sono fallite", async () => {
  state.rpc.mockResolvedValue({ data: [{ shipped_items: 0, created_units: 0, oda_now_complete: false, errors: [{ error: "Riga non disponibile" }] }], error: null });
  const client = new QueryClient();
  const { result } = renderHook(() => useReceiveFromOda(), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  await act(async () => { await result.current.mutateAsync(input); });
  expect(state.success).not.toHaveBeenCalled();
  expect(state.warning).toHaveBeenCalledWith("Nessuna riga ricevuta", expect.anything());
});
