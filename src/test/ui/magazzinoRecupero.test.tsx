import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WarehouseRequestSlot, warehouseRequestScope } from '@/lib/magazzino/protocolloMovimenti';
const state=vi.hoisted(()=>({rpc:vi.fn(),write:true,actor:'u'}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:state.rpc}}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({effectiveCompany:{id:'c'},user:{id:state.actor}})}));
vi.mock('@/hooks/usePermissions',()=>({usePermissions:()=>({isLoading:false,canEditWarehouse:state.write,canEditOrders:state.write,canManagePurchasing:state.write})}));
import { WarehousePendingOperations } from '@/components/warehouse/WarehousePendingOperations';
const payload={p_audit_id:'old-audit'};
function setup(operation='inventory-apply'){
 const scope=warehouseRequestScope('c','u',operation);const slot=new WarehouseRequestSlot(scope,sessionStorage);const id=slot.request(payload);slot.failed(new Error('Failed to fetch'));
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><WarehousePendingOperations/></QueryClientProvider>);return {slot,id,scope};
}
beforeEach(()=>{sessionStorage.clear();state.rpc.mockReset().mockResolvedValue({data:{id:'old-audit',adjustment_applied:true},error:null});state.write=true;state.actor='u';});
describe('Recupero dopo chiusura o ricaricamento',()=>{
 it('ripete la richiesta e la chiave originali solo dopo conferma',async()=>{const {id,slot}=setup();fireEvent.click(screen.getByRole('button',{name:'Verifica rettifica inventario'}));expect(state.rpc).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Verifica / completa registrazione'}));await waitFor(()=>expect(state.rpc).toHaveBeenCalledWith('warehouse_inventory_apply_v3',{...payload,p_request_id:id}));await screen.findByRole('status');expect(slot.hasPending()).toBe(false);});
 it('conserva la richiesta se la rete fallisce ancora',async()=>{state.rpc.mockResolvedValue({data:null,error:{message:'Connessione assente'}});const {id,slot}=setup();fireEvent.click(screen.getByRole('button',{name:'Verifica rettifica inventario'}));fireEvent.click(screen.getByRole('button',{name:'Verifica / completa registrazione'}));await screen.findByRole('alert');expect(slot.pendingRequest()?.id).toBe(id);});
 it('non scambia una risposta nulla per una registrazione riuscita',async()=>{state.rpc.mockResolvedValue({data:null,error:null});const {slot}=setup();fireEvent.click(screen.getByRole('button',{name:'Verifica rettifica inventario'}));fireEvent.click(screen.getByRole('button',{name:'Verifica / completa registrazione'}));await screen.findByRole('alert');expect(slot.hasPending()).toBe(true);});
 it('rispetta la sola lettura',()=>{state.write=false;setup();expect(screen.getByRole('button',{name:'Verifica rettifica inventario'})).toBeDisabled();expect(state.rpc).not.toHaveBeenCalled();});
 it('non mostra le richieste di un altro utente',()=>{state.actor='different';setup();expect(screen.queryByRole('region',{name:'Operazioni da verificare'})).toBeNull();});
});

it('recupera la prenotazione con riga, quantità e chiave originali',async()=>{
 const original={p_order_item_id:'80000000-0000-4000-a000-000000000001',p_quantity:6};
 state.rpc.mockResolvedValue({data:{order_item_id:original.p_order_item_id,reserved:6},error:null});
 const slot=new WarehouseRequestSlot(warehouseRequestScope('c','u','reserve'),sessionStorage);const id=slot.request(original);slot.failed(new Error('Failed to fetch'));
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><WarehousePendingOperations/></QueryClientProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Verifica prenotazione per commessa'}));fireEvent.click(screen.getByRole('button',{name:'Verifica / completa registrazione'}));
 await waitFor(()=>expect(state.rpc).toHaveBeenCalledWith('warehouse_reserve_v2',{...original,p_request_id:id}));
 await screen.findByRole('status');expect(slot.hasPending()).toBe(false);
});
