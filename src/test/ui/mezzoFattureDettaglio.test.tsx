import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const state = vi.hoisted(()=>({ rows:[] as Record<string,unknown>[], updates:vi.fn(),eq:vi.fn(),result:{data:{id:'l1'} as {id:string}|null,error:null} }));
vi.mock('@/hooks/useEffectiveCompanyId',()=>({useEffectiveCompanyId:()=> 'company-test'}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>{
 const q:any={};q.update=(v:unknown)=>{state.updates(v);return q;};q.select=()=>q;q.eq=(...a:unknown[])=>{state.eq(...a);return q;};q.order=()=>q;q.range=async()=>({data:state.rows,error:null});q.maybeSingle=async()=>state.result;return q;
}}}));
vi.mock('@/components/fatturazione/RiepilogoFatturaRicevuta',()=>({RiepilogoFatturaRicevuta:({fatturaId,onClose}:{fatturaId:string;onClose:()=>void})=><div role="region" aria-label="Dettaglio fattura">{fatturaId}<button onClick={onClose}>Chiudi dettaglio</button></div>}));
import { MezzoFattureSection } from '@/components/mezzi/MezzoFattureSection';
beforeEach(()=>{
 state.updates.mockClear();state.eq.mockClear();state.result={data:{id:'l1'},error:null};
 state.rows=[{id:'l1',fattura_ricevuta_id:'invoice-a',importo:null,confermata:true,origine:'manuale',fatture_ricevute:{numero_fattura:'1',data_fattura:'2025-01-01',cedente_ragione_sociale:'Fornitore A',totale_documento:122}},{id:'l2',fattura_ricevuta_id:'invoice-b',importo:50,confermata:false,origine:'targa',fatture_ricevute:{numero_fattura:'1',data_fattura:'2026-01-01',cedente_ragione_sociale:'Fornitore B',totale_documento:61}}];
});
afterEach(cleanup);
async function setup(edit=true){
 const qc=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
 const invalidate=vi.spyOn(qc,'invalidateQueries');
 render(<QueryClientProvider client={qc}><MezzoFattureSection mezzoId="mezzo-test" puoModificare={edit}/></QueryClientProvider>);
 await screen.findByText('Fornitore A');return invalidate;
}
it('apre per ID la fattura esatta anche con numero uguale e anni diversi',async()=>{
 await setup();fireEvent.click(screen.getAllByRole('button',{name:'Apri fattura 1'})[1]);
 expect(await screen.findByRole('region',{name:'Dettaglio fattura'})).toHaveTextContent('invoice-a');
 fireEvent.click(screen.getByText('Chiudi dettaglio'));expect(screen.getByText('Fornitore A')).toBeInTheDocument();
});
it('segnala le quote mancanti e salva soltanto importo e legame corretto',async()=>{
 const invalidate=await setup();expect(screen.getByRole('status')).toHaveTextContent('Totale incompleto: 1');
 fireEvent.click(screen.getAllByRole('button',{name:'Modifica importo fattura 1'})[1]);
 fireEvent.change(screen.getByLabelText('Importo (€)'),{target:{value:'-20.05'}});
 fireEvent.click(screen.getByRole('button',{name:'Salva importo'}));
 await waitFor(()=>expect(state.updates).toHaveBeenCalledWith({importo:-20.05}));
 expect(state.eq).toHaveBeenCalledWith('company_id','company-test');expect(state.eq).toHaveBeenCalledWith('mezzo_id','mezzo-test');expect(state.eq).toHaveBeenCalledWith('id','l1');
 await waitFor(()=>expect(invalidate).toHaveBeenCalledWith({queryKey:['mezzo-costo-orario']}));
});
it('consultazione: consente il dettaglio ma non la modifica degli importi',async()=>{
 await setup(false);expect(screen.getAllByRole('button',{name:'Apri fattura 1'})).toHaveLength(2);
 expect(screen.queryByRole('button',{name:'Modifica importo fattura 1'})).not.toBeInTheDocument();
});
