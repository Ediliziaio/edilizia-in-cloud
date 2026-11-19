import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({rpc:vi.fn(),timeout:false,modern:true}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({effectiveCompany:{id:'company-receipts'},user:{id:'actor'}})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:state.rpc,auth:{getUser:async()=>({data:{user:{id:'actor'}}})}}}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn(),warning:vi.fn()}}));
import { useCreateDdtFromUscita } from '@/hooks/warehouse/useWarehouseUscita';
import { useReceiveFromOda } from '@/hooks/warehouse/useReceiveFromOda';
import { useGoodsReceipt } from '@/hooks/warehouse/useGoodsReceipt';
const input={odaId:'oda',warehouseId:'wh',entries:[{stockItemId:'s',odaItemId:'oi',quantity:1,serialNumbers:[],rawCode:'a'}] as never};
const goods={order_item_id:'oi',warehouse_id:'wh',quantity_received:1,quality_check_status:'ok' as const};
const wrapper=({children}:React.PropsWithChildren)=><QueryClientProvider client={new QueryClient({defaultOptions:{mutations:{retry:false}}})}>{children}</QueryClientProvider>;
beforeEach(()=>{sessionStorage.clear();state.timeout=false;state.modern=true;state.rpc.mockReset();state.rpc.mockImplementation(async(name:string)=>{
 if(name==='warehouse_capabilities_v2')return {data:{version:3,idempotent_oda_receipts:state.modern,idempotent_goods_receipts:state.modern},error:null};
 if(state.timeout){state.timeout=false;return {data:null,error:{message:'Failed to fetch'}};}
 return {data:name.includes('goods')?{receipt_id:'00000000-0000-0000-0000-000000000001'}:{shipped_items:1,created_units:0,oda_now_complete:false,errors:[]},error:null};
});});
it('ripete una ricezione ODA incerta con la stessa chiave e mai con la RPC precedente',async()=>{
 const {result}=renderHook(useReceiveFromOda,{wrapper});state.timeout=true;
 await act(async()=>{await result.current.mutateAsync(input).catch(()=>{});});await act(async()=>{await result.current.mutateAsync(input);});
 const calls=state.rpc.mock.calls.filter(([name])=>name==='warehouse_receive_oda_v3');expect(calls).toHaveLength(2);expect(calls[0][1].p_request_id).toBe(calls[1][1].p_request_id);expect(state.rpc.mock.calls.some(([name])=>name==='receive_from_oda_via_scans')).toBe(false);
});
it('impedisce di cambiare la ricezione mentre la precedente ha esito incerto',async()=>{
 const {result}=renderHook(useReceiveFromOda,{wrapper});state.timeout=true;await act(async()=>{await result.current.mutateAsync(input).catch(()=>{});});
 await act(async()=>{await expect(result.current.mutateAsync({...input,ddtNumber:'altro'})).rejects.toThrow(/precedente/);});
 expect(state.rpc.mock.calls.filter(([name])=>name==='warehouse_receive_oda_v3')).toHaveLength(1);
});
it('conserva la compatibilità quando il backend non dichiara ricezioni idempotenti',async()=>{
 state.modern=false;const {result}=renderHook(useReceiveFromOda,{wrapper});await act(async()=>{await result.current.mutateAsync(input);});expect(state.rpc).toHaveBeenCalledWith('receive_from_oda_via_scans',expect.not.objectContaining({p_request_id:expect.anything()}));
});
it('ripete una ricezione merce incerta con la stessa chiave',async()=>{
 const {result}=renderHook(useGoodsReceipt,{wrapper});state.timeout=true;await act(async()=>{await result.current.createGoodsReceipt(goods).catch(()=>{});});await act(async()=>{await result.current.createGoodsReceipt(goods);});
 const calls=state.rpc.mock.calls.filter(([name])=>name==='warehouse_goods_receipt_v3');expect(calls).toHaveLength(2);expect(calls[0][1].p_request_id).toBe(calls[1][1].p_request_id);
});
it('blocca due invii ODA immediati nello stesso render',async()=>{
 const {result}=renderHook(useReceiveFromOda,{wrapper});await act(async()=>{const r=await Promise.allSettled([result.current.mutateAsync(input),result.current.mutateAsync(input)]);expect(r.filter(x=>x.status==='rejected')).toHaveLength(1);});expect(state.rpc.mock.calls.filter(([name])=>name==='warehouse_receive_oda_v3')).toHaveLength(1);
});

it('non dichiara creato un DDT quando la risposta è incompleta',async()=>{
 state.rpc.mockResolvedValue({data:null,error:null});const {result}=renderHook(useCreateDdtFromUscita,{wrapper});await act(async()=>{await expect(result.current.mutateAsync({uscitaId:'uscita'})).rejects.toThrow(/Esito DDT non verificato/);});
});
