import {render,screen,cleanup} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {afterEach,describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({steps:[] as any[]}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:(table:string)=>{state.steps.push(['from',table]);const chain:any=new Proxy({},{get:(_,key)=>key==='then'?(ok:any)=>Promise.resolve({data:[{id:'note',source_kind:'crm_trial',created_at:'2026-11-10T12:00:00Z',note:'Il cliente conferma: la maniglia è ancora dura. <script>nessuna esecuzione</script>'}],error:null}).then(ok):(...args:any[])=>{state.steps.push([key,...args]);return chain;}});return chain;}}}));
vi.mock('@/hooks/useEffectiveCompanyId',()=>({useEffectiveCompanyId:(): null=>null}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:null as {id: string} | null})}));
import {FishHandoffDetails} from '@/components/telephony/SchedaPassaggioChiamata';
import {TicketAIActivity} from '@/components/tickets/TicketAIActivity';
afterEach(()=>{cleanup();state.steps=[];});
describe('Case context in the CRM',()=>{
 it('shows verified ticket context and the next step for the colleague',()=>{render(<MemoryRouter><FishHandoffDetails context={{identity_verified:true,ticket:{id:'ticket',reference:'ABC123',subject:'Finestra',status:'aperto'},next_step:'Chiarire il prossimo aggiornamento'}}/></MemoryRouter>);expect(screen.getByRole('link')).toHaveAttribute('href','/azienda/assistenza/ticket');expect(screen.getByText('Nome e indirizzo verificati')).toBeInTheDocument();expect(screen.getByText(/Chiarire il prossimo aggiornamento/)).toBeInTheDocument();});
 it('never shows a ticket link for an unverified identity',()=>{render(<MemoryRouter><FishHandoffDetails context={{identity_verified:false,ticket:{id:'foreign',reference:'FOREIGN',subject:'Nascosto',status:'aperto'}}}/></MemoryRouter>);expect(screen.queryByRole('link')).not.toBeInTheDocument();expect(screen.getByText('Identità da verificare con il cliente')).toBeInTheDocument();});
 it('reads notes only for the current company and ticket, renders plain text',async()=>{render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><TicketAIActivity companyId='own' ticketId='ticket'/></QueryClientProvider>);expect(await screen.findByText(/Il cliente conferma/)).toBeInTheDocument();expect(state.steps).toContainEqual(['eq','company_id','own']);expect(state.steps).toContainEqual(['eq','ticket_id','ticket']);expect(document.querySelector('script')).toBeNull();expect(screen.getByText(/Collaudo dal gestionale/)).toBeInTheDocument();});
});
