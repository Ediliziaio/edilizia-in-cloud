import { render,screen,fireEvent,waitFor,cleanup,within } from '@testing-library/react';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { afterEach,beforeEach,describe,it,expect,vi } from 'vitest';
import { ExpensePaymentDialog } from '@/components/orders/ExpensePaymentDialog';
import { SalPaymentDialog } from '@/components/subappaltatori/SalPaymentDialog';
import type { SALSubappaltatore } from '@/types/subappaltatori';
Element.prototype.scrollIntoView ??= () => {};
const fake=vi.hoisted(()=>({rpc:vi.fn(),readonly:false,treasury:false,paid:0,total:1220,fail:false,movimenti:[] as {id:string;data:string;importo:number;direzione:string;conto:string;metodo:string;bank_account_id?:string|null;banca:null;riferimento:null;storno_di:null}[],conti:[] as {valore:string;etichetta:string;account_label:string;bank_account_id:string|null;conto_liquidita_id:string|null}[]}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:fake.rpc}}));
vi.mock('@/hooks/useContiPrimaNota',()=>({useContiPrimaNota:()=>({data:fake.conti,isError:false,isFetching:false})}));
vi.mock('@/hooks/usePermissions',()=>({usePermissions:()=>({canViewCosts:true,solaLettura:fake.readonly,canViewSubappaltatoriAmministrazione:false,canViewTesoreria:fake.treasury,canManagePayments:false,isAdmin:false})}));
beforeEach(()=>{
  fake.readonly=false;fake.treasury=false;fake.paid=0;fake.total=1220;fake.fail=false;fake.conti=[];fake.movimenti=[];fake.rpc.mockReset();
  vi.stubGlobal('BroadcastChannel',undefined);
  fake.rpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>{
    if(name==='dettaglio_pagamento_costo')return {data:{id:'cost',nome:'Fattura DEMO',totale:fake.total,pagato:fake.paid,residuo:Math.round((fake.total-fake.paid)*100)/100,da_verificare:false,movimenti:fake.movimenti},error:null};
    if(name==='registra_pagamento_costo'||name==='registra_pagamento_costo_con_conto'){
      if(fake.fail)return {data:null,error:{message:'Connessione interrotta, esito da verificare'}};
      fake.paid+=Number(args.p_importo);
      fake.movimenti.push({id:String(fake.movimenti.length+1),data:String(args.p_data),importo:Number(args.p_importo),direzione:'uscita',conto:args.p_metodo==='contanti'?'Cassa':fake.conti.find(c=>c.bank_account_id===args.p_conto_banca)?.account_label??'Banca',metodo:String(args.p_metodo),bank_account_id:args.p_conto_banca as string|null,banca:null,riferimento:null,storno_di:null});
      return {data:{residuo:Math.round((fake.total-fake.paid)*100)/100},error:null};
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
    fireEvent.change(screen.getByLabelText('Riferimento'),{target:{value:'CRO primo pagamento'}});
    fireEvent.click(screen.getByRole('button',{name:'Conferma pagamento'}));
    await waitFor(()=>expect(screen.getByText('820,00 €',{exact:false})).toBeTruthy());
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(fake.rpc.mock.calls.filter(([name])=>name==='registra_pagamento_costo_con_conto')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button',{name:'Registra pagamento'}));
    expect((screen.getByLabelText('Riferimento') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Importo') as HTMLInputElement).value).toBe('820');
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
    const calls=fake.rpc.mock.calls.filter(([name])=>name==='registra_pagamento_costo_con_conto');
    expect(calls).toHaveLength(2);expect(calls[0][1].p_richiesta).toBe(calls[1][1].p_richiesta);
  });
  it('permette la consultazione in sola lettura senza offrire la registrazione',async()=>{
    fake.readonly=true;mount();await screen.findByText('Fattura DEMO');
    expect(screen.queryByRole('button',{name:'Registra pagamento'})).toBeNull();
  });
  it('registra il conto bancario effettivo, accetta il formato italiano e rifiuta millesimi e date future',async()=>{
    fake.conti=[{valore:'banca:beta',etichetta:'Banca Beta · …5678',account_label:'Banca Beta',bank_account_id:'beta',conto_liquidita_id:null}];
    mount();fireEvent.click(await screen.findByRole('button',{name:'Registra pagamento'}));
    expect(screen.getByRole('button',{name:'Conferma pagamento'})).toBeDisabled();
    fireEvent.keyDown(screen.getByLabelText('Conto del pagamento'),{key:'ArrowDown'});
    fireEvent.click(await screen.findByRole('option',{name:'Banca Beta · …5678'}));
    fireEvent.change(screen.getByLabelText('Importo'),{target:{value:'12,345'}});
    expect(screen.getByRole('button',{name:'Conferma pagamento'})).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Importo'),{target:{value:'1.200,50'}});
    fireEvent.change(screen.getByLabelText('Data'),{target:{value:'2099-01-01'}});
    expect(screen.getByRole('button',{name:'Conferma pagamento'})).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Data'),{target:{value:'2026-01-01'}});
    fireEvent.click(screen.getByRole('button',{name:'Conferma pagamento'}));
    await waitFor(()=>expect(fake.rpc).toHaveBeenCalledWith('registra_pagamento_costo_con_conto',expect.objectContaining({p_conto_banca:'beta',p_importo:1200.5,p_data:'2026-01-01'})));
  });
  it('propone anche una banca con Cassa nel nome senza offrirla come cassa contanti',async()=>{
    fake.treasury=true;fake.conti=[{valore:'banca:cassa',etichetta:'Cassa di Risparmio',account_label:'Cassa di Risparmio',bank_account_id:'banca-cassa',conto_liquidita_id:null}];
    mount();fireEvent.click(await screen.findByRole('button',{name:'Registra pagamento'}));
    fireEvent.keyDown(screen.getByLabelText('Conto del pagamento'),{key:'ArrowDown'});
    fireEvent.click(await screen.findByRole('option',{name:'Cassa di Risparmio'}));
    fireEvent.change(screen.getByLabelText('Importo'),{target:{value:'100'}});
    fireEvent.click(screen.getByRole('button',{name:'Conferma pagamento'}));
    await screen.findByRole('button',{name:'Registra pagamento'});
    expect(fake.rpc).toHaveBeenCalledWith('registra_pagamento_costo_con_conto',expect.objectContaining({p_conto_banca:'banca-cassa',p_metodo:'bonifico'}));
    expect(screen.getByRole('button',{name:'Collega banca'})).toBeVisible();
    fireEvent.click(screen.getByRole('button',{name:'Registra pagamento'}));
    fireEvent.keyDown(screen.getByLabelText('Metodo'),{key:'ArrowDown'});fireEvent.click(await screen.findByRole('option',{name:'Contanti'}));
    expect(screen.queryByLabelText('Conto del pagamento')).toBeNull();expect(screen.getByText('Il movimento sarà registrato in cassa.')).toBeVisible();
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
  it('salda la stessa fattura con contanti e due banche, conservando date, quote e l’ultimo centesimo',async()=>{
    fake.total=1220.01;
    fake.conti=['Alfa','Beta'].map<(typeof fake.conti)[number]>(nome=>({valore:'banca:'+nome,etichetta:'Banca '+nome,account_label:'Banca '+nome,bank_account_id:nome,conto_liquidita_id:null}));
    mount();
    const inizia=async()=>{
      const b=await screen.findByRole('button',{name:'Registra pagamento'});
      await waitFor(()=>expect(b).toBeEnabled());fireEvent.click(b);
    };
    const seleziona=async(label:string,opzione:string)=>{fireEvent.keyDown(screen.getByLabelText(label),{key:'ArrowDown'});fireEvent.click(await screen.findByRole('option',{name:opzione}));};
    const conferma=async()=>{fireEvent.click(screen.getByRole('button',{name:'Conferma pagamento'}));await screen.findByRole('button',{name:'Registra pagamento'});};
    await inizia();fireEvent.click(screen.getByRole('button',{name:'Metà del residuo'}));
    expect(screen.getByLabelText('Importo')).toHaveValue('610');
    fireEvent.change(screen.getByLabelText('Data'),{target:{value:'2025-11-17'}});
    await seleziona('Metodo','Contanti');await conferma();
    await inizia();fireEvent.change(screen.getByLabelText('Importo'),{target:{value:'300'}});
    fireEvent.change(screen.getByLabelText('Data'),{target:{value:'2025-11-18'}});
    await seleziona('Metodo','Bonifico');await seleziona('Conto del pagamento','Banca Alfa');await conferma();
    await inizia();expect(screen.getByLabelText('Importo')).toHaveValue('310.01');
    fireEvent.change(screen.getByLabelText('Data'),{target:{value:'2025-11-19'}});
    await seleziona('Conto del pagamento','Banca Beta');
    fireEvent.click(screen.getByRole('button',{name:'Conferma pagamento'}));
    await waitFor(()=>expect(screen.queryByRole('button',{name:'Registra pagamento'})).toBeNull());
    expect(within(screen.getByLabelText('Situazione dei pagamenti')).getByText('0,00 €')).toBeVisible();
    const t=within(screen.getByRole('table',{name:'Pagamenti già registrati'}));
    for(const conto of ['Cassa','Banca Alfa','Banca Beta'])expect(t.getByText(conto)).toBeVisible();
    const calls=fake.rpc.mock.calls.filter(([name])=>name==='registra_pagamento_costo_con_conto').map(([,args])=>args);
    expect(calls.map(c=>[c.p_importo,c.p_metodo,c.p_conto_banca,c.p_data])).toEqual([[610,'contanti',null,'2025-11-17'],[300,'bonifico','Alfa','2025-11-18'],[310.01,'bonifico','Beta','2025-11-19']]);
    expect(new Set(calls.map(c=>c.p_richiesta)).size).toBe(3);
  });
});
