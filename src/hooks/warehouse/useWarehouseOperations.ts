import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { warehouseResponseVerified, warehouseCapabilities, warehouseRpc, warehouseRequestScope, warehouseRequestStorage, WarehouseRequestSlot } from '@/lib/magazzino/protocolloMovimenti';
import { queryKeys } from '@/lib/queryKeys';

export function useWarehouseProtocol(companyId: string | undefined, enabled = true) {
  return useQuery({queryKey:['warehouse','protocol',companyId],enabled:enabled&&!!companyId,staleTime:30_000,retry:false,queryFn:()=>warehouseCapabilities(companyId!)});
}
export interface InventorySnapshot {
 stock_item_id:string;quantity:number;reserved:number;updated_at:string;unit:string|null;tracking:string;
 serials:{id:string;serial_number:string;status:string;updated_at:string}[];
}
export interface InventoryCount {
 id:string;stock_item_id:string;expected_quantity:number;counted_quantity:number;difference:number;
 adjustment_applied:boolean;created_at:string;notes:string|null;protocol_version:number;
}
export interface ReorderCandidate {
 updatedAt?:string;pricePending?:boolean;
 stockItemId:string;name:string;warehouseId:string|null;unit:string|null;tracking:string;
 available:number;reserved:number;minLevel:number;incoming:number;deficit:number;suggested:number;
 supplierId:string|null;supplierName:string|null;unitCost:number|null;
}
export function useInventoryPreview(companyId:string|undefined,stockId:string|undefined,enabled:boolean) {
 const protocol=useWarehouseProtocol(companyId,enabled);
 const snapshot=useQuery({queryKey:['warehouse','inventory-preview',companyId,stockId,protocol.data?.version],enabled:enabled&&!!stockId&&!!protocol.data,
  retry:false,staleTime:0,queryFn:async():Promise<InventorySnapshot>=>{
   if(protocol.data?.inventory_counts){const r=await warehouseRpc('warehouse_inventory_preview_v3',{p_stock_item_id:stockId});if(r.error)throw r.error;return r.data as InventorySnapshot;}
   const {data,error}=await supabase.from('warehouse_stock').select('id,quantity,quantity_reserved,updated_at,unita_misura,tracking_mode').eq('id',stockId!).eq('company_id',companyId!).single();
   if(error)throw error;return {stock_item_id:data.id,quantity:Number(data.quantity),reserved:Number(data.quantity_reserved),updated_at:data.updated_at,unit:data.unita_misura,tracking:data.tracking_mode,serials:[]};
  }});
 return {protocol,snapshot};
}
export function useInventoryHistory(companyId:string|undefined,stockId:string|undefined,enabled:boolean) {
 const protocol=useWarehouseProtocol(companyId,enabled);
 return useQuery({queryKey:['warehouse','inventory-history',companyId,stockId,protocol.data?.version],enabled:enabled&&!!companyId&&!!stockId&&!!protocol.data,retry:false,queryFn:async():Promise<InventoryCount[]>=>{
  if(protocol.data?.inventory_counts){const r=await warehouseRpc('warehouse_inventory_list_v3',{p_company_id:companyId,p_stock_item_id:stockId});if(r.error)throw r.error;return r.data as InventoryCount[];}
  const {data,error}=await supabase.from('inventory_audits').select('*').eq('company_id',companyId!).eq('stock_item_id',stockId!).order('created_at',{ascending:false});
  if(error)throw error;return (data??[]).map(row=>({...row,protocol_version:1}));
 }});
}
/** Shared request identity; errors never fall back from a new RPC to a legacy write. */
export function useWarehouseOperation(operation:string) {
 const {effectiveCompany,user}=useAuth();const qc=useQueryClient();
 return useMutation({retry:false,mutationFn:async({rpc,payload,legacy=false}:{rpc:string;payload:Record<string,unknown>;legacy?:boolean})=>{
  if(!effectiveCompany?.id)throw new Error('Seleziona un’azienda.');
  const slot=new WarehouseRequestSlot(warehouseRequestScope(effectiveCompany.id,user?.id,operation),warehouseRequestStorage());
  try {const r=await warehouseRpc(rpc,legacy?payload:{...payload,p_request_id:slot.request(payload)});if(r.error)throw r.error;
   if(!legacy&&!warehouseResponseVerified(operation,r.data,payload))throw new Error('Esito operazione non disponibile: verifica prima di riprovare.');
   if(!legacy)slot.succeeded();return r.data;
  }catch(error){if(!legacy)slot.failed(error);throw error;}
 },onSuccess:()=>{
  for(const key of [queryKeys.warehouse.all,['warehouse-stock'],['warehouse-movements'],['stock-movements'],['warehouse-transfers'],['warehouse-stock-for-transfer'],['magazzino-live'],['low-stock-reorder-meta'],['purchase-orders'],['order-items'],['uscita-order-items-prefill']])void qc.invalidateQueries({queryKey:key});
 }});
}
