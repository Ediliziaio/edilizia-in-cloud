import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { changeFormControl } from '@/test/helpers/changeFormControl';
const m=vi.hoisted(()=>({rpc:vi.fn(),error:vi.fn(),readError:false,role:'company_staff',report:{} as Record<string,unknown>,from:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:m.from,rpc:m.rpc}}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({effectiveCompany:{id:'c'},user:{id:'u'},role:m.role})}));
vi.mock('@/hooks/useRapportiniMese',()=>({useNomiFasiCommessa:()=>({data:new Map()})}));
vi.mock('@/lib/orders/refreshWorkQueries',()=>({refreshWorkQueries:vi.fn()}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:m.error}}));
import { CorreggiRapportino } from '@/components/orders/CorreggiRapportino';
beforeEach(()=>{
 m.readError=false;m.role='company_staff';m.rpc.mockReset().mockResolvedValue({error:null as null});m.error.mockReset();
 m.report={id:'r',company_id:'c',order_id:'o',user_id:'other',updated_at:'versione-1',descrizione_lavori:'Testo errato',presenze:[{employee_id:'p1',nome:'Primo SIM',ore:8}],mezzi_usati:[{mezzo_id:'m1',nome:'Mezzo SIM',ore:2}],materiali_usati:[{nome:'Materiale errato',quantita:2,unita:'cad'}]};
 m.from.mockImplementation((t:string)=>{
  const chain={select:()=>chain,eq:()=>chain,is:()=>chain,maybeSingle:async()=>({data:m.readError?null:m.report,error:m.readError?new Error('Lettura fallita'):null}),order:async()=>({data:t==='employees'?[{id:'p1',first_name:'Primo',last_name:'SIM'},{id:'p2',first_name:'Secondo',last_name:'SIM'}]:[{id:'m1',nome:'Mezzo SIM'},{id:'m2',nome:'Altro mezzo SIM'}],error:null as null})};return chain;
 });
});
afterEach(cleanup);
function apri(){const qc=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});render(<QueryClientProvider client={qc}><CorreggiRapportino rapportinoId="r" orderId="o"/></QueryClientProvider>);fireEvent.click(screen.getByRole('button',{name:'Modifica rapportino'}));return qc;}
it('non carica dati e anagrafiche finché il modulo è chiuso',()=>{
 render(<QueryClientProvider client={new QueryClient()}><CorreggiRapportino rapportinoId="r" orderId="o"/></QueryClientProvider>);expect(m.from).not.toHaveBeenCalled();
});
it('corregge testi e materiali, sostituisce un operaio e aggiunge o toglie mezzi',async()=>{
 apri(); await screen.findByLabelText('Lavoro svolto');await waitFor(()=>expect(m.from).toHaveBeenCalledWith('employees'));
 fireEvent.change(screen.getByLabelText('Lavoro svolto'),{target:{value:'Testo corretto'}});
 fireEvent.change(screen.getByLabelText('Descrizione materiale 1'),{target:{value:'Materiale corretto'}});
 changeFormControl(screen.getByRole('combobox',{name:'Operaio 1'}),{target:{value:'p2'}});
 fireEvent.change(screen.getByLabelText('Ore di Secondo SIM'),{target:{value:'6,5'}});
 fireEvent.click(screen.getByRole('button',{name:'Togli Mezzo SIM'}));
 changeFormControl(screen.getByRole('combobox',{name:'Aggiungi mezzo'}),{target:{value:'m2'}});
 fireEvent.change(screen.getByLabelText('Altro mezzo SIM: ore'),{target:{value:'3'}});
 fireEvent.click(screen.getByRole('button',{name:'Salva'}));
 await waitFor(()=>expect(m.rpc).toHaveBeenCalledTimes(1));
 expect(m.rpc).toHaveBeenCalledWith('rapportino_correggi',expect.objectContaining({p_updated_at:'versione-1',p_campi:expect.objectContaining({descrizione_lavori:'Testo corretto',presenze:[{employee_id:'p2',nome:'Secondo SIM',ore:6.5}],mezzi_usati:[{mezzo_id:'m2',nome:'Altro mezzo SIM',ore:3}],materiali_usati:[{nome:'Materiale corretto',quantita:2,unita:'cad'}]})}));
});
it('togliendo tutte le presenze azzera anche le ore aggregate',async()=>{
 apri();await screen.findByLabelText('Lavoro svolto');fireEvent.click(screen.getByRole('button',{name:'Togli Primo SIM'}));fireEvent.click(screen.getByRole('button',{name:'Salva'}));
 await waitFor(()=>expect(m.rpc).toHaveBeenCalledWith('rapportino_correggi',expect.objectContaining({p_campi:expect.objectContaining({presenze:[],ore_lavorate:0,ore_straordinario:0})})));
});
it('rifiuta ore non valide e non le trasforma in zero',async()=>{
 apri();await screen.findByLabelText('Lavoro svolto');fireEvent.change(screen.getByLabelText('Ore di Primo SIM'),{target:{value:'abc'}});fireEvent.click(screen.getByRole('button',{name:'Salva'}));await waitFor(()=>expect(m.error).toHaveBeenCalled());expect(m.rpc).not.toHaveBeenCalled();
});
it('mostra errore e Riprova, senza lasciare Carico per sempre',async()=>{
 m.readError=true;apri();await screen.findByRole('alert');expect(screen.getByRole('button',{name:'Salva'})).toBeDisabled();m.readError=false;fireEvent.click(screen.getByRole('button',{name:'Riprova'}));await screen.findByLabelText('Lavoro svolto');
});
it('espone il conflitto del server e mantiene il testo per poterlo recuperare',async()=>{
 m.rpc.mockResolvedValue({error:{message:'Il rapportino è cambiato: riaprilo prima di correggerlo.'}});apri();await screen.findByLabelText('Lavoro svolto');fireEvent.click(screen.getByRole('button',{name:'Salva'}));await waitFor(()=>expect(m.error).toHaveBeenCalledWith(expect.stringContaining('è cambiato')));expect(screen.getByLabelText('Lavoro svolto')).toHaveValue('Testo errato');
});
it('spiega allo staff che il proprio approvato richiederà una nuova approvazione',async()=>{
 m.report={...m.report,user_id:'u',approvato:true};apri();await screen.findByText(/un altro utente dell’ufficio/);expect(screen.getByRole('button',{name:'Salva'})).toBeDisabled();fireEvent.change(screen.getByLabelText('Motivo della correzione'),{target:{value:'Errore'}});expect(screen.getByRole('button',{name:'Salva'})).toBeEnabled();
});
