import { useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FinancialSummaryReadOnly } from '@/components/orders/FinancialSummary';
import { FattureIncassiElenco } from '@/components/orders/FattureIncassiElenco';
import { SegnaPagataDialog } from '@/components/fatturazione/SegnaPagataDialog';
import type { DocumentoFiscale } from '@/types/fatturazione';
import type { FatturaCommessa } from '@/lib/orders/fattureCommessa';
import type { Installment } from '@/lib/orderUtils';
import { scadenze30_30_40 } from '@/lib/fatturazione/scadenzeFattura';
const m=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:(...a:unknown[])=>m.rpc(...a)}}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({effectiveCompany:{id:'c1'}})}));
vi.mock('@/components/orders/RegistraIncassoPrimaNota',()=>({RegistraIncassoPrimaNota:():null=>null,useIncassiRegistrati:()=>({data:{}})}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn(),warning:vi.fn()}}));
const TOTALE = 10000;
const fattura=(pagato:number):DocumentoFiscale & FatturaCommessa=>({company_id:'c1',numero_progressivo:1,anno:2026,scadenze_pagamento:scadenze30_30_40(TOTALE,new Date(2026,10,18),'MP05'),righe:[],riepilogo_iva:[],subtotale:TOTALE,imponibile_totale:TOTALE,iva_totale:0,created_at:'2026-11-18',updated_at:'2026-11-18',cliente_snapshot:{ragione_sociale:'Cliente demo',tipo_cliente:'B2C'},id:'f1',numero:'FT-1',data_emissione:'2026-11-18',tipo:'fattura',stato:pagato>=TOTALE?'pagata':pagato>0?'parzialmente_pagata':'emessa',totale_documento:TOTALE,totale_da_pagare:TOTALE,importo_pagato:pagato,importo_associato:null});
let versamenti:number[]=[];
let cliente:QueryClient;
let termina: (()=>void)|undefined;
let attendi=false;
function Flusso() {
 const [aperto,setAperto]=useState(false);
 const documenti=useQuery({queryKey:['ordine-fatture','o1','c1','incassi-completi-v2'],queryFn:async()=>[fattura(versamenti.reduce((a,b)=>a+b,0))]});
 const scheda=useQuery({queryKey:['orders','o1'],queryFn:async():Promise<Installment[]>=>[{id:'r1',position:0,label:'Saldo lavoro',type:'deposit',amount:TOTALE,is_paid:versamenti.reduce((a,b)=>a+b,0)>=TOTALE,documento_fiscale_id:'f1',fattura:{id:'f1',numero:'FT-1',stato:'emessa',importo_pagato:versamenti.reduce((a,b)=>a+b,0)}},{id:'r2',position:1,label:'Rata senza fattura',type:'deposit',amount:220,is_paid:false}]});
 if(!documenti.data||!scheda.data)return null;
 return <><FinancialSummaryReadOnly totalAmount={TOTALE + 220} vatRate={0} paymentType="standard" installments={scheda.data} elencoUnificato={piano=><FattureIncassiElenco documents={documenti.data} piano={piano} onRetry={()=>{}} onDownload={()=>{}}/>}/><button onClick={()=>setAperto(true)}>Nuovo versamento</button><SegnaPagataDialog open={aperto} onOpenChange={setAperto} fatture={[documenti.data[0]]}/></>;
}
beforeEach(()=>{
 versamenti=[];attendi=false;termina=undefined;m.rpc.mockReset();
 m.rpc.mockImplementation(async(fn:string,args:Record<string,unknown>)=>{
  if(fn!=='registra_incasso_atomico')throw new Error(`RPC inattesa: ${fn}`);
  if(attendi)await new Promise<void>(resolve=>{termina=resolve;});
  versamenti.push(Number(args.p_importo));return {data:null,error:null};
 });
 cliente=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:120000},mutations:{retry:false}}});
});
afterEach(()=>{cleanup();cliente.clear();});
const monta=()=>render(<MemoryRouter><QueryClientProvider client={cliente}><Flusso/></QueryClientProvider></MemoryRouter>);
async function incassa(importo:string){
 fireEvent.click(await screen.findByRole('button',{name:'Nuovo versamento'}));
 fireEvent.change(screen.getByRole('textbox',{name:'Importo incassato'}),{target:{value:importo}});
 fireEvent.click(screen.getByRole('button',{name:'Registra incasso'}));
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
}
it('una sola fattura, tre versamenti e una rata senza fattura: totali e residui si aggiornano senza ricaricare',async()=>{
 monta();await screen.findByRole('list',{name:'Rate e fatture del cliente'});
 const riepilogo=()=>screen.getByLabelText('Riepilogo fatture e incassi');
 const statiScadenze = () => within(screen.getByRole('list',{name:'Scadenze fattura FT-1'}))
  .getAllByRole('listitem').map(rata => rata.querySelector('[data-status]')?.textContent);
 expect(riepilogo()).toHaveTextContent('Incassato0,00');
 expect(statiScadenze()).toEqual(['Da incassare', 'Da incassare', 'Da incassare']);
 await incassa('3000');
 await waitFor(()=>expect(riepilogo()).toHaveTextContent('Incassato3.000,00'));
 expect(screen.getByLabelText('Incassi fattura FT-1')).toHaveTextContent('Residuo7.000,00');
 expect(riepilogo()).toHaveTextContent('Da incassare sul piano7.220,00');
 expect(statiScadenze()).toEqual(['Pagata', 'Da incassare', 'Da incassare']);
 await incassa('3000');
 await waitFor(()=>expect(riepilogo()).toHaveTextContent('Incassato6.000,00'));
 expect(screen.getByLabelText('Incassi fattura FT-1')).toHaveTextContent('Residuo4.000,00');
 expect(riepilogo()).toHaveTextContent('Da incassare sul piano4.220,00');
 expect(statiScadenze()).toEqual(['Pagata', 'Pagata', 'Da incassare']);
 await incassa('4000');
 await waitFor(()=>expect(riepilogo()).toHaveTextContent('Incassato10.000,00'));
 expect(riepilogo()).toHaveTextContent('Da incassare sul piano220,00');
 expect(screen.getByLabelText('Incassi fattura FT-1')).toHaveTextContent('Residuo0,00');
 expect(statiScadenze()).toEqual(['Pagata', 'Pagata', 'Pagata']);
 expect(screen.getByRole('list',{name:'Rate e fatture del cliente'}).children).toHaveLength(2);
 expect(screen.getAllByRole('link',{name:'Fattura FT-1'})).toHaveLength(1);
 expect(screen.getByText('Rata senza fattura')).toBeInTheDocument();
 expect(versamenti).toEqual([3000,3000,4000]);expect(m.rpc).toHaveBeenCalledTimes(3);
 for(const call of m.rpc.mock.calls)expect(call[1]).toMatchObject({p_documento_id:'f1',p_company_id:'c1'});
});
it('il doppio clic su un incasso parziale non registra due pagamenti',async()=>{
 attendi=true;monta();fireEvent.click(await screen.findByRole('button',{name:'Nuovo versamento'}));
 fireEvent.change(screen.getByRole('textbox',{name:'Importo incassato'}),{target:{value:'3000'}});
 const button=screen.getByRole('button',{name:'Registra incasso'});
 fireEvent.click(button);fireEvent.click(button);
 await waitFor(()=>expect(m.rpc).toHaveBeenCalledTimes(1));
 await act(async()=>{termina?.();});
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 await waitFor(()=>expect(screen.getByLabelText('Incassi fattura FT-1')).toHaveTextContent('Residuo7.000,00'));
 expect(versamenti).toEqual([3000]);
});
