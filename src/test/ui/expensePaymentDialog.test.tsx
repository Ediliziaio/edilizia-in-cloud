import { render,screen,fireEvent,waitFor,cleanup } from '@testing-library/react';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { afterEach,beforeEach,describe,it,expect,vi } from 'vitest';
import { ExpensePaymentDialog } from '@/components/orders/ExpensePaymentDialog';
import { SalPaymentDialog } from '@/components/subappaltatori/SalPaymentDialog';
import type { SALSubappaltatore } from '@/types/subappaltatori';
const fake=vi.hoisted(()=>({rpc:vi.fn(),readonly:false,paid:0,fail:false}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:fake.rpc}}));
vi.mock('@/hooks/usePermissions',()=>({usePermissions:()=>({canViewCosts:true,solaLettura:fake.readonly,canViewSubappaltatoriAmministrazione:false,canViewTesoreria:false,canManagePayments:false,isAdmin:false})}));
beforeEach(()=>{
  fake.readonly=false;fake.paid=0;fake.fail=false;fake.rpc.mockReset();
  vi.stubGlobal('BroadcastChannel',undefined);
  fake.rpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>{
    if(name==='dettaglio_pagamento_costo')return {data:{id:'cost',nome:'Fattura DEMO',totale:1220,pagato:fake.paid,residuo:1220-fake.paid,da_verificare:false,movimenti:[]},error:null};
    if(name==='registra_pagamento_costo'){
      if(fake.fail)return {data:null,error:{message:'Connessione interrotta, esito da verificare'}};
      fake.paid+=Number(args.p_importo);return {data:{residuo:1220-fake.paid},error:null};
    }
    throw new Error(`RPC inattesa ${name}`);
  });
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function mount(){const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});render(<QueryClientProvider client={client}><ExpensePaymentDialog costId="cost" onClose={vi.fn()}/></QueryClientProvider>);return client;}
describe('Pagamento contestuale di una spesa',()=>{
  it('registra un acconto e mostra il residuo aggiornato senza uscire dal popup',async()=>{
    mount();fireEvent.click(await screen.findByRole('button',{name:'Registra pagamento'}));
    fireEvent.change(screen.getByLabelText('Importo'),{target:{value:'400'}});
    fireEvent.click(screen.getByRole('button',{name:'Conferma pagamento'}));
    await waitFor(()=>expect(screen.getByText('820,00 €',{exact:false})).toBeTruthy());
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(fake.rpc.mock.calls.filter(([name])=>name==='registra_pagamento_costo')).toHaveLength(1);
  });
  it('mantiene la stessa chiave dopo un errore incerto e impedisce importi oltre residuo',async()=>{
    mount();fireEvent.click(await screen.findByRole('button',{name:'Registra pagamento'}));
    fireEvent.change(screen.getByLabelText('Importo'),{target:{value:'1300'}});
    expect((screen.getByRole('button',{name:'Conferma pagamento'}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Importo'),{target:{value:'400'}});fake.fail=true;
    fireEvent.click(screen.getByRole('button',{name:'Conferma pagamento'}));
    await waitFor(()=>expect((screen.getByRole('button',{name:'Conferma pagamento'}) as HTMLButtonElement).disabled).toBe(false));
    fake.fail=false;fireEvent.click(screen.getByRole('button',{name:'Conferma pagamento'}));
    await screen.findByRole('button',{name:'Registra pagamento'});
    const calls=fake.rpc.mock.calls.filter(([name])=>name==='registra_pagamento_costo');
    expect(calls).toHaveLength(2);expect(calls[0][1].p_richiesta).toBe(calls[1][1].p_richiesta);
  });
  it('permette la consultazione in sola lettura senza offrire la registrazione',async()=>{
    fake.readonly=true;mount();await screen.findByText('Fattura DEMO');
    expect(screen.queryByRole('button',{name:'Registra pagamento'})).toBeNull();
  });
  it('nel SAL propone il pagamento esistente e precompila la sola quota disponibile',async()=>{
    fake.rpc.mockImplementation(async(name:string)=>({error:null,data:name==='pagamenti_sal_candidati'?{documenti:[{id:'cost',numero:'F1'}],pagamenti:[{id:'payment',data:'2026-10-01',disponibile:100,riferimento:'CRO DEMO'}]}:{}}));
    const saved=vi.fn();const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
    const sal={id:'sal',numero_sal:1,importo_netto:950,ritenuta_importo:50,pagato_registrato:0} as SALSubappaltatore;
    render(<QueryClientProvider client={client}><SalPaymentDialog sal={sal} onClose={vi.fn()} onSaved={saved}/></QueryClientProvider>);
    const button=await screen.findByRole('button',{name:'Collega pagamento'});
    expect((screen.getByLabelText('Importo da attribuire al SAL') as HTMLInputElement).value).toBe('100');
    fireEvent.click(button);await waitFor(()=>expect(saved).toHaveBeenCalledOnce());
    const call=fake.rpc.mock.calls.find(([name])=>name==='registra_pagamento_sal_sub');
    expect(call?.[1]).toMatchObject({p_esistente:'payment',p_importo:100,p_data:'2026-10-01'});
    expect(fake.rpc.mock.calls.some(([name])=>name==='registra_pagamento_costo')).toBe(false);
  });
});
