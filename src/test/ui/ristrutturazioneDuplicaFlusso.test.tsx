import{cleanup,fireEvent,render,screen,waitFor}from'@testing-library/react';
import{MemoryRouter}from'react-router-dom';import{afterEach,describe,it,expect,vi}from'vitest';
const rpc=vi.hoisted(()=>vi.fn(async(_fn:string,_args:{p_anteprima:boolean;p_source_id:string})=>({data:{numero:'RST-001',materiali:0,voci:2,fasi:2,sottofasi:1,impronta:'v1'},error:null})));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc}}));
vi.mock('@/hooks/useEffectiveCompanyId',()=>({useEffectiveCompanyId:()=> 'company1'}));
vi.mock('@/hooks/useRistrutturazioneProgetto',()=>({useRistrutturazioneProgetti:()=>({data:[{id:'p1',code:'RST-001',stato:'bozza',cliente_nome:'Cliente prova',totale:1220}],isLoading:false,isError:false,refetch:vi.fn()}),useDeleteProgetto:()=>({isPending:false,mutateAsync:vi.fn()})}));
vi.mock('@/components/moduli/ModuloBulkToolbar',()=>({ModuloBulkToolbar:()=>null}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
import RistrutturazioneIndex from '@/pages/azienda/ristrutturazione/RistrutturazioneIndex';
afterEach(()=>{cleanup();rpc.mockClear();});
describe('accesso alla copia dalla lista reale',()=>{
 it('scorciatoia sulla riga apre il riepilogo senza creare una copia',async()=>{render(<MemoryRouter><RistrutturazioneIndex/></MemoryRouter>);fireEvent.click(screen.getByRole('button',{name:'Duplica preventivo RST-001'}));await screen.findByText('Da RST-001');expect(rpc.mock.calls.every(c=>c[1].p_anteprima)).toBe(true);expect(rpc.mock.calls[0][1].p_source_id).toBe("p1");expect(screen.getByRole('button',{name:'Crea copia e apri'})).toBeInTheDocument();});
 it('scelta dalla lista richiede comunque la conferma e consente annullamento',async()=>{render(<MemoryRouter><RistrutturazioneIndex/></MemoryRouter>);fireEvent.click(screen.getByRole('button',{name:/^Duplica.*preventivo$/}));await screen.findByRole('heading',{name:'Scegli il preventivo da duplicare'});fireEvent.click(screen.getByRole('button',{name:/RST-001.*Cliente prova/}));await screen.findByText('Da RST-001');fireEvent.click(screen.getByRole('button',{name:'Annulla'}));await waitFor(()=>expect(screen.queryByRole('heading',{name:'Duplica preventivo'})).not.toBeInTheDocument());});
});
