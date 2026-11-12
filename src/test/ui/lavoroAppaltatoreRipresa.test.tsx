import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import CreateLavoroAppaltatore from '@/pages/azienda/CreateLavoroAppaltatore';
import {conservaScritturaLavoro, recuperaScritturaLavoro, type ScritturaLavoro} from '@/lib/appalto/creaLavoro';
const mock=vi.hoisted(()=>({rpc:vi.fn(),navigate:vi.fn(),toast:vi.fn(),collega:vi.fn(),misura:false}));
vi.mock('@/lib/orders/documentImportAi',()=>({collegaOriginaleAi:mock.collega}));
vi.mock('@/components/orders/ContractImportDialog',async()=>{
  const {parseContractExtract}=await import('@/lib/orders/contractExtract');
  return {ContractImportDialog:({onApply,onOpenChange}:{onApply:Function;onOpenChange:Function})=><button onClick={()=>{onApply(parseContractExtract({descrizione_lavori:'[DEMO] Import AI',importo_totale_eur:2000,iva_pct:22,fasi_pagamento:[{descrizione:'Acconto',percentuale:50},{descrizione:'Saldo',percentuale:50}],dati_appalto:{valorizzazione:mock.misura?'a_misura':'a_corpo',stima_eur:4000,tetto_eur:6000}}),null,{bucket:'order-attachments',path:'c/ai-contratti/prova.pdf',name:'prova.pdf',mime:'application/pdf'});onOpenChange(false);}}>Applica contratto demo</button>};
});
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({effectiveCompany:{id:'c'},user:{id:'u'}})}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:mock.toast})}));
vi.mock('@/hooks/useAppaltatoreModule',()=>({useAppaltatoreModuleEnabled:()=>true,APPALTATORE_MODULE_FLAG:'appaltatore_module'}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mock.rpc,from:()=>{const q={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,maybeSingle:async()=>({data:{id:'stato'}})};return q;}}}));
vi.mock('@/lib/geo/geocodeBestEffort',()=>({geocodeBestEffort:vi.fn()}));
vi.mock('react-router-dom',async()=>({...await vi.importActual<typeof import('react-router-dom')>('react-router-dom'),useNavigate:()=>mock.navigate}));
vi.mock('@tanstack/react-query',async()=>({...await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query'),useQuery:({queryKey}:{queryKey:unknown[]})=>({data:queryKey[0]==='appaltatori-list'?[{id:'k',business_name:'Edil Demo'}]:queryKey[0]==='stati-import-appaltatore'?[{id:'stato',name:'Rilievo Tecnico'}]:queryKey[0]==='appalto-contratti-committente'?[{id:'contratto',nome:'Listino Demo',valido_dal:'2020-01-01',valido_al:null as string | null,attivo:true,giorni_pagamento:30,modo_fatturazione:'per_commessa',include_fornitura:false,riferimento_committente:'DEMO'}]:[],isLoading:false})}));
const tentativo:ScritturaLavoro={ordine:{id:'richiesta',company_id:'c',created_by:'u',customer_id:'k',order_type:'appaltatore_lavoro',valorizzazione:'a_corpo',description:'Demo recupero',total_amount:1000,vat_rate:22},rate:[{id:'r',order_id:'richiesta',position:0,type:'balance',label:'Saldo',amount:1220,is_paid:false}]};
const draw=()=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{mutations:{retry:false}}})}><MemoryRouter initialEntries={['/?committente=k']}><CreateLavoroAppaltatore/></MemoryRouter></QueryClientProvider>);
it.each([false,true])('import AI nel modulo nativo: scelta stato esplicita, originale e rate coerenti, misura=%s',async(misura)=>{
  mock.misura=misura;mock.rpc.mockResolvedValue({data:{success:true,id:'ordine-ai'}});draw();
  fireEvent.click(screen.getByRole('button',{name:'Carica contratto (AI)'}));
  fireEvent.click(await screen.findByRole('button',{name:'Applica contratto demo'}));
  expect(screen.getByRole('button',{name:'Crea il lavoro'})).toBeDisabled();
  fireEvent.click(screen.getByLabelText(/Ho verificato committente/));
  expect(screen.getByRole('button',{name:'Crea il lavoro'})).toBeDisabled();
  fireEvent.click(screen.getByRole('combobox',{name:'Stato iniziale da confermare'}));
  fireEvent.click(await screen.findByRole('option',{name:'Rilievo Tecnico'}));
  fireEvent.click(screen.getByRole('button',{name:'Crea il lavoro'}));
  await waitFor(()=>expect(mock.navigate).toHaveBeenCalledWith('/azienda/ordini/ordine-ai'));
  const p=mock.rpc.mock.calls[0][1];
  expect(p.p_order_data.current_status_id).toBe('stato');
  expect(p.p_order_data.valorizzazione).toBe(misura?'a_misura':'a_corpo');
  expect(p.p_installments.map((r:{amount:number})=>r.amount)).toEqual(misura?[]:[1220,1220]);
  expect(mock.collega).toHaveBeenCalledWith(expect.anything(),'ordine-ai','c','u',expect.objectContaining({name:'prova.pdf'}));
});
beforeEach(()=>{vi.stubGlobal('ResizeObserver',class {observe(){} unobserve(){} disconnect(){}});HTMLElement.prototype.scrollIntoView=vi.fn();localStorage.clear();vi.clearAllMocks();mock.misura=false;mock.collega.mockResolvedValue(undefined);});
afterEach(cleanup);
it('ricaricamento e doppio submit: una richiesta, modulo protetto, poi esito recuperato',async()=>{
  conservaScritturaLavoro(tentativo,'u');
  let resolve!:(v:unknown)=>void;mock.rpc.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
  draw();expect(screen.getByDisplayValue('Demo recupero')).toBeDisabled();
  const b=screen.getByRole('button',{name:'Verifica e completa'});
  fireEvent.click(b);fireEvent.submit(b.closest('form')!);
  await waitFor(()=>expect(mock.rpc).toHaveBeenCalledTimes(1));
  resolve({error:{message:'Connessione interrotta'}});
  await waitFor(()=>expect(mock.toast).toHaveBeenCalled());
  expect(recuperaScritturaLavoro('c','u')).toEqual(tentativo);
  cleanup();mock.rpc.mockResolvedValue({data:{success:true,id:'ordine-server',gia_creata:true}});draw();
  fireEvent.click(screen.getByRole('button',{name:'Verifica e completa'}));
  await waitFor(()=>expect(mock.navigate).toHaveBeenCalledWith('/azienda/ordini/ordine-server'));
  expect(recuperaScritturaLavoro('c','u')).toBeNull();
  expect(mock.rpc.mock.calls[0]).toEqual(mock.rpc.mock.calls[1]);
});
it('rifiuto esplicito del database: sblocca la correzione, senza lasciare un tentativo irrisolvibile',async()=>{
  conservaScritturaLavoro(tentativo,'u');mock.rpc.mockResolvedValue({error:{code:'22023',message:'Le rate devono coincidere'}});draw();
  fireEvent.click(screen.getByRole('button',{name:'Verifica e completa'}));
  await waitFor(()=>expect(screen.getByDisplayValue('Demo recupero')).toBeEnabled());
  expect(recuperaScritturaLavoro('c','u')).toBeNull();expect(mock.navigate).not.toHaveBeenCalled();
});
it('un importo errato non scompare al blur e non diventa zero',()=>{
  draw();const input=screen.getByLabelText('Importo totale (€) — netto');
  fireEvent.change(input,{target:{value:'abc'}});fireEvent.blur(input);
  expect(input).toHaveValue('abc');expect(screen.getByText(/Inserisci un importo valido/)).toBeVisible();
});
it('un acconto digitato senza blur ricalcola il saldo; un testo errato blocca subito',()=>{
  draw();fireEvent.change(screen.getByLabelText('Importo totale (€) — netto'),{target:{value:'1000'}});
  fireEvent.keyDown(screen.getByRole('tab',{name:'Rateale'}),{key:'Enter'});
  const acconto=screen.getAllByLabelText('Importo IVA inclusa (€)')[0];
  fireEvent.change(acconto,{target:{value:'200,50'}});
  expect(screen.getByDisplayValue('1.019,50')).toBeDisabled();
  fireEvent.change(acconto,{target:{value:'errore'}});
  expect(screen.getByText(/Controlla gli importi delle rate/)).toBeVisible();
});

it('salva insieme date, importi digitati e rate senza richiedere il blur',async()=>{
  mock.rpc.mockResolvedValue({data:{success:true,id:'nuovo-server'}});draw();
  fireEvent.change(screen.getByLabelText('Descrizione breve *'),{target:{value:'Demo date e rate'}});
  fireEvent.change(screen.getByLabelText('Data inizio lavori'),{target:{value:'2026-11-11'}});
  fireEvent.change(screen.getByLabelText('Data fine lavori'),{target:{value:'2026-12-20'}});
  fireEvent.change(screen.getByLabelText('Importo totale (€) — netto'),{target:{value:'1000'}});
  fireEvent.keyDown(screen.getByRole('tab',{name:'Rateale'}),{key:'Enter'});
  fireEvent.change(screen.getAllByLabelText('Importo IVA inclusa (€)')[0],{target:{value:'200,50'}});
  const btn=screen.getByRole('button',{name:'Crea il lavoro'});fireEvent.submit(btn.closest('form')!);
  await waitFor(()=>expect(mock.rpc).toHaveBeenCalledTimes(1));
  const p=mock.rpc.mock.calls[0][1];
  expect(p.p_order_data).toMatchObject({work_start_date:'2026-11-11',work_end_date:'2026-12-20',total_amount:1000,order_type:'appaltatore_lavoro'});
  expect(p.p_installments.map((r:{amount:number})=>r.amount)).toEqual([200.5,1019.5]);
  expect(p.p_installments.every((r:{is_paid:boolean})=>!r.is_paid)).toBe(true);
  await waitFor(()=>expect(mock.navigate).toHaveBeenCalledWith('/azienda/ordini/nuovo-server'));
});

it('passando da misura a corpo un tetto errato e nascosto non blocca e non viene salvato',async()=>{
  mock.rpc.mockResolvedValue({data:{success:true,id:'corpo-server'}});draw();
  fireEvent.change(screen.getByLabelText('Descrizione breve *'),{target:{value:'Demo cambio valorizzazione'}});
  fireEvent.change(screen.getByLabelText('Importo totale (€) — netto'),{target:{value:'1000'}});
  fireEvent.click(screen.getByRole('button',{name:/A misura/}));
  fireEvent.change(screen.getByLabelText('Tetto concordato (€)'),{target:{value:'abc'}});
  expect(screen.getByText(/Inserisci un tetto valido/)).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:/A corpo/}));
  expect(screen.queryByText(/Inserisci un tetto valido/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Crea il lavoro'}));
  await waitFor(()=>expect(mock.rpc).toHaveBeenCalled());
  expect(mock.rpc.mock.calls[0][1].p_order_data).toMatchObject({valorizzazione:'a_corpo',tetto_importo:null});
  await waitFor(()=>expect(mock.navigate).toHaveBeenCalledWith('/azienda/ordini/corpo-server'));
});
