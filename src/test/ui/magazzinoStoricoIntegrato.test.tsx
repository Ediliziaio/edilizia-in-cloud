import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
const state=vi.hoisted(()=>({costs:true,csv:vi.fn(),rows:[
 {id:'a',stock_item_id:'s',movement_type:'carico',rientro_commessa:true,quantity:1.25,itemName:'Cavo',unit:'m',created_at:'2026-11-17T10:00:00Z',unit_cost:10,notes: null as null,order_id: null as null,orderCode: null as null},
 {id:'b',stock_item_id:'t',movement_type:'carico',rientro_commessa:false,quantity:10,itemName:'Pompe',unit:'pz',created_at:'2026-11-17T10:00:00Z',unit_cost:20,notes: null as null,order_id: null as null,orderCode: null as null},
]}));
vi.mock('@/hooks/usePermissions',()=>({usePermissions:()=>({canViewCosts:state.costs,isLoading:false})}));
vi.mock('@tanstack/react-query',()=>({useQuery:()=>({data:state.rows,isLoading:false,isError:false,isFetching:false})}));
vi.mock('@/lib/csvExport',()=>({exportToCSV:state.csv}));
import WarehouseMovementsTab from '@/components/warehouse/WarehouseMovementsTab';
const mount=()=>render(<MemoryRouter><WarehouseMovementsTab companyId="c" warehouseFilter={null}/></MemoryRouter>);
beforeEach(()=>{state.costs=true;state.csv.mockReset();});
describe('Storico del magazzino: resi, unità e costi',()=>{
 it('distingue il reso e conta i movimenti senza sommare metri e pezzi',()=>{
  mount();expect(screen.getByText('Reso da cantiere')).toBeTruthy();expect(screen.getByText('+1,25 m')).toBeTruthy();expect(screen.getByText('+10 pz')).toBeTruthy();
  const card=screen.getByText('Carichi e resi · movimenti').parentElement!;expect(card.textContent).toContain('2');expect(card.textContent).not.toContain('11,25');
 });
 it('esporta le unità e non mostra né esporta valori senza il permesso',()=>{
  state.costs=false;mount();expect(screen.queryByText('Valore movimentato')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'CSV'}));
  const [rows,columns]=state.csv.mock.calls[0];expect(rows[0].unita).toBe('m');expect(rows[0]).not.toHaveProperty('costo_unitario');expect(columns.some((c:{key:string})=>c.key==='valore')).toBe(false);
 });
});
