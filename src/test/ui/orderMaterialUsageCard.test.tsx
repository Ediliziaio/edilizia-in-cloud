import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
const state=vi.hoisted(()=>({loading:false,error:false,retry:vi.fn(),data:{rows:[] as unknown[],unlinked:0}}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({effectiveCompany:{id:'demo'}})}));
vi.mock('@/hooks/useOrderMaterialUsage',()=>({useOrderMaterialUsage:()=>({data:state.data,isLoading:state.loading,isError:state.error,refetch:state.retry})}));
import { OrderMaterialUsageCard } from '@/components/orders/OrderMaterialUsageCard';
beforeEach(()=>{state.loading=false;state.error=false;state.data={rows:[],unlinked:0};vi.clearAllMocks();});afterEach(cleanup);
describe('material card',()=>{
  it('does not show a false empty stock state while loading or on failure',()=>{
    state.loading=true;render(<OrderMaterialUsageCard orderId="job" showCosts={false}/>);
    expect(screen.getByRole('status')).toHaveTextContent('Verifico');expect(screen.queryByText(/Nessun materiale/)).toBeNull();cleanup();
    state.loading=false;state.error=true;render(<OrderMaterialUsageCard orderId="job" showCosts={false}/>);
    fireEvent.click(screen.getByRole('button',{name:'Riprova'}));expect(state.retry).toHaveBeenCalledOnce();
  });
  it('does not expose money without cost permission',()=>{
    state.data.rows=[{id:'s',name:'Cemento',unit:'sacchi',delivered:10,used:8,returned:1,remaining:1,review:false,estimatedUsedValue:80}];
    render(<OrderMaterialUsageCard orderId="job" showCosts={false}/>);
    expect(screen.getByText('8 sacchi')).toBeInTheDocument();expect(screen.queryByText(/€/)).toBeNull();
  });
  it('keeps the initial view short but can reveal all articles',()=>{
    state.data.rows=Array.from({length:24},(_,i)=>({id:String(i),name:'Articolo '+i,unit:'pz',delivered:1,used:1,returned:0,remaining:0,review:false,estimatedUsedValue:10}));
    render(<OrderMaterialUsageCard orderId="job" showCosts={true}/>);
    expect(screen.queryByText('Articolo 23')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Tutti gli articoli (24)'}));expect(screen.getByText('Articolo 23')).toBeInTheDocument();
  });
});
