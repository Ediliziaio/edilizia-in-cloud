import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
const state=vi.hoisted(()=>({write:true,v3:true,save:vi.fn(),snap:{stock_item_id:'s',quantity:10,reserved:2,updated_at:'2026-11-17T10:00:00Z',unit:'m',tracking:'fungible',serials:[] as {id:string;serial_number:string;status:string;updated_at:string}[]},history:[] as {id:string;protocol_version:number;stock_item_id:string;expected_quantity:number;counted_quantity:number;difference:number;adjustment_applied:boolean;created_at:string;notes:string|null}[]}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({effectiveCompany:{id:'c'},user:{id:'u'}})}));
vi.mock('@/hooks/usePermissions',()=>({usePermissions:()=>({isLoading:false,canEditWarehouse:state.write,canManagePurchasing:state.write,canViewCosts:true})}));
vi.mock('@/hooks/useWarehouses',()=>({useWarehouses:()=>({warehouses:[{id:'w1',name:'Principale'},{id:'w2',name:'Secondario'}]})}));
vi.mock('@/hooks/warehouse/useWarehouseOperations',()=>({
 useWarehouseProtocol:()=>({data:{version:state.v3?3:1,atomic_transfers:state.v3,inventory_counts:state.v3,reorder:state.v3},isError:false}),
 useWarehouseOperation:()=>({mutateAsync:state.save,isPending:false}),
 useInventoryPreview:()=>({protocol:{data:{inventory_counts:state.v3},isError:false},snapshot:{data:state.snap,isFetching:false,refetch:vi.fn()}}),
 useInventoryHistory:()=>({data:state.history,isLoading:false,isError:false,refetch:vi.fn()}),
}));
vi.mock('@tanstack/react-query',()=>({useQuery:({queryKey}:{queryKey:string[]})=>({isLoading:false,isError:false,data:queryKey[0]==='warehouse-stock-for-transfer'?
 [{id:'s',name:'Cavo',quantity:10,quantity_available:6,unita_misura:'m',tracking_mode:'fungible'},{id:'p',name:'Pompa',quantity:2,quantity_available:2,unita_misura:'pz',tracking_mode:'serialized'}]:queryKey[1]==='transfer-units'?
 [{id:'u1',stock_item_id:'p',serial_number:'SN-1'},{id:'u2',stock_item_id:'p',serial_number:'SN-2'}]:queryKey[1]==='reorder-preview'?
 [{stockItemId:'s',name:'Cavo',warehouseId:'w1',unit:'m',tracking:'fungible',available:10,reserved:0,minLevel:12.75,incoming:0,deficit:2.75,suggested:2.75,supplierId:'v',supplierName:'Fornitore',unitCost:10}]:[]})}));
vi.mock('@/components/ui/select',()=>({
 Select:({children,value,onValueChange}:{children:React.ReactNode;value:string;onValueChange:(v:string)=>void})=><select value={value} onChange={e=>onValueChange(e.target.value)}><option value="">Scegli</option>{children}</select>,
 SelectContent:({children}:{children:React.ReactNode})=><>{children}</>,SelectItem:({children,value,disabled}:{children:React.ReactNode;value:string;disabled?:boolean})=><option value={value} disabled={disabled}>{children}</option>,SelectTrigger:():null=>null,SelectValue:():null=>null,
}));
import { WarehouseTransferPanel } from '@/components/warehouse/WarehouseTransferPanel';
import InventoryAuditDialog from '@/components/warehouse/InventoryAuditDialog';
import { LowStockReorderDialog } from '@/components/warehouse/LowStockReorderDialog';
beforeEach(()=>{state.write=true;state.v3=true;state.save.mockReset().mockImplementation(async({rpc}:{rpc:string})=>rpc.includes('reorder')?{purchase_order_id:'po',oda_number:'ODA-001',righe:1,gia_in_ordine:[]}:{id:'a',transfer_id:'t'});state.snap={stock_item_id:'s',quantity:10,reserved:2,updated_at:'2026-11-17T10:00:00Z',unit:'m',tracking:'fungible',serials:[]};state.history=[];});
const prepareTransfer=(stock='s',qty='2,75')=>{
 render(<WarehouseTransferPanel open onOpenChange={vi.fn()}/>);
 fireEvent.change(screen.getAllByRole('combobox')[0],{target:{value:'w1'}});fireEvent.change(screen.getAllByRole('combobox')[1],{target:{value:'w2'}});
 fireEvent.click(screen.getByRole('button',{name:'Aggiungi articolo'}));fireEvent.change(screen.getAllByRole('combobox')[2],{target:{value:stock}});fireEvent.change(screen.getByLabelText('Quantità riga 1'),{target:{value:qty}});
};
describe('Trasferimenti completi',()=>{
 it('mantiene i decimali e scrive solo dopo la conferma',async()=>{prepareTransfer();fireEvent.click(screen.getByRole('button',{name:'Controlla trasferimento'}));expect(state.save).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Conferma trasferimento'}));await waitFor(()=>expect(state.save).toHaveBeenCalledWith(expect.objectContaining({rpc:'warehouse_transfer_v3',payload:expect.objectContaining({p_items:[expect.objectContaining({quantity:2.75})]})})));});
 it('considera il disponibile, non la giacenza fisica',()=>{prepareTransfer('s','7');expect(screen.getByRole('button',{name:'Controlla trasferimento'})).toBeDisabled();expect(screen.getAllByText(/disponibili 6 m/).length).toBeGreaterThan(0);});
 it('richiede la matricola e invia soltanto quella selezionata',async()=>{prepareTransfer('p','1');expect(screen.getByRole('button',{name:'Controlla trasferimento'})).toBeDisabled();fireEvent.click(screen.getByRole('checkbox',{name:'SN-2'}));fireEvent.click(screen.getByRole('button',{name:'Controlla trasferimento'}));fireEvent.click(screen.getByRole('button',{name:'Conferma trasferimento'}));await waitFor(()=>expect(state.save).toHaveBeenCalledWith(expect.objectContaining({payload:expect.objectContaining({p_items:[expect.objectContaining({serial_numbers:['SN-2']})]})})));});
 it('blocca frazioni sul servizio precedente',()=>{state.v3=false;prepareTransfer();expect(screen.getByRole('button',{name:'Controlla trasferimento'})).toBeDisabled();});
});
const inventory=()=>render(<InventoryAuditDialog open onOpenChange={vi.fn()} companyId="c" stockItem={{id:'s',name:'Cavo',quantity:10}}/>);
describe('Conteggi e rettifiche separati',()=>{
 it('registra la frazione senza applicarla automaticamente',async()=>{inventory();fireEvent.change(screen.getByLabelText('Quantità conteggiata fisicamente'),{target:{value:'8,75'}});fireEvent.click(screen.getByRole('button',{name:'Controlla conteggio'}));expect(state.save).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Registra conteggio'}));await waitFor(()=>expect(state.save).toHaveBeenCalledWith(expect.objectContaining({rpc:'warehouse_inventory_count_v3',payload:expect.objectContaining({p_counted:8.75,p_snapshot:state.snap})})));expect(state.save).toHaveBeenCalledOnce();});
 it('accetta zero ma non lo confonde con il campo vuoto',()=>{state.snap.reserved=0;inventory();expect(screen.getByRole('button',{name:'Controlla conteggio'})).toBeDisabled();fireEvent.change(screen.getByLabelText('Quantità conteggiata fisicamente'),{target:{value:'0'}});expect(screen.getByRole('button',{name:'Controlla conteggio'})).toBeEnabled();});
 it('non scende sotto gli impegni',()=>{inventory();fireEvent.change(screen.getByLabelText('Quantità conteggiata fisicamente'),{target:{value:'1,5'}});expect(screen.getByRole('button',{name:'Controlla conteggio'})).toBeDisabled();expect(screen.getByText(/inferiore alla quantità prenotata/)).toBeTruthy();});
 it('applica soltanto dal riepilogo e usa l’identità del conteggio',async()=>{state.history=[{id:'audit',protocol_version:3,stock_item_id:'s',expected_quantity:10,counted_quantity:8.75,difference:-1.25,adjustment_applied:false,created_at:'2026-11-17T10:00:00Z',notes:null}];inventory();fireEvent.click(screen.getByRole('button',{name:'Prepara rettifica'}));expect(state.save).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Applica rettifica'}));await waitFor(()=>expect(state.save).toHaveBeenCalledWith({rpc:'warehouse_inventory_apply_v3',payload:{p_audit_id:'audit'},legacy:false}));});
 it('rispetta la sola lettura',()=>{state.write=false;inventory();fireEvent.change(screen.getByLabelText('Quantità conteggiata fisicamente'),{target:{value:'8'}});expect(screen.getByRole('button',{name:'Controlla conteggio'})).toBeDisabled();});
});
describe('Riordino con unità corrette',()=>{
 it('prepara la frazione, conferma una bozza e non invia al fornitore',async()=>{render(<LowStockReorderDialog open companyId="c" onOpenChange={vi.fn()}/>);expect(screen.getByLabelText('Quantità da ordinare Cavo')).toHaveValue('2.75');fireEvent.click(screen.getByRole('button',{name:'Controlla riordino'}));expect(state.save).not.toHaveBeenCalled();expect(screen.getByText('Bozza · nessun invio')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Crea ODA in bozza'}));await waitFor(()=>expect(state.save).toHaveBeenCalledWith(expect.objectContaining({rpc:'warehouse_reorder_v3',payload:expect.objectContaining({p_lines:[{stock_item_id:'s',quantity:2.75}]})})));expect(await screen.findByText('Bozza ODA-001')).toBeTruthy();expect(screen.getByRole('link',{name:'Apri bozza ODA'})).toHaveAttribute('href','/azienda/ordini-acquisto/po');});
 it('non trasforma un valore invalido in una quantità ordinabile',()=>{render(<LowStockReorderDialog open companyId="c" onOpenChange={vi.fn()}/>);fireEvent.change(screen.getByLabelText('Quantità da ordinare Cavo'),{target:{value:'2,75x'}});expect(screen.getByRole('button',{name:'Controlla riordino'})).toBeDisabled();expect(state.save).not.toHaveBeenCalled();});
});

it('mantiene il conteggio confermato anche se la giacenza si aggiorna durante il riepilogo',async()=>{
 const view=inventory();fireEvent.change(screen.getByLabelText('Quantità conteggiata fisicamente'),{target:{value:'8,75'}});fireEvent.click(screen.getByRole('button',{name:'Controlla conteggio'}));
 state.snap={...state.snap,quantity:20,updated_at:'2026-11-18T10:00:00Z'};
 view.rerender(<InventoryAuditDialog open onOpenChange={vi.fn()} companyId="c" stockItem={{id:'s',name:'Cavo',quantity:20}}/>);
 expect(screen.getByText('-1,25 m')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Registra conteggio'}));
 await waitFor(()=>expect(state.save).toHaveBeenCalledWith(expect.objectContaining({payload:expect.objectContaining({p_counted:8.75,p_snapshot:expect.objectContaining({quantity:10})})})));
});
