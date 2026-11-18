import { fireEvent,render,screen,cleanup,waitFor } from '@testing-library/react';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach,afterEach,it,expect,vi } from 'vitest';
const m=vi.hoisted(()=>({data:[] as unknown[],error:null as {message:string}|null,admin:true}));
vi.mock('@/hooks/useEffectiveCompanyId',()=>({useEffectiveCompanyId:()=> 'c1'}));
vi.mock('@/hooks/usePermissions',()=>({usePermissions:()=>({isAdmin:m.admin,solaLettura:false})}));
vi.mock('@/components/ritenute/NuovaRitenutaDialog',()=>({NuovaRitenutaDialog:({initialOrderId}:{initialOrderId?:string})=><div role="dialog">Nuova ritenuta sulla commessa {initialOrderId}</div>}));
vi.mock('@/components/fatturazione/FiscalReleaseDialog',()=>({FiscalReleaseDialog:({id}:{id:string})=><div role="dialog">Svincolo documentato {id}</div>}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>{const q:Record<string,unknown>={then:(ok:(v:unknown)=>unknown)=>Promise.resolve({data:m.data,error:m.error}).then(ok)};for(const k of ['select','eq','order'])q[k]=()=>q;return q;}}}));
import { RitenuteClienteCommessa, useRitenuteClienteCommessa } from '@/components/ritenute/RitenuteClienteCommessa';
function ClienteDemo() {
 const dati = useRitenuteClienteCommessa('o1');
 return <RitenuteClienteCommessa orderId="o1" dati={dati}/>;
}
function show(){render(<MemoryRouter><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ClienteDemo/></QueryClientProvider></MemoryRouter>);}
beforeEach(()=>{m.admin=true;m.data=[];m.error=null;});afterEach(cleanup);
it('anche senza subappalti offre la registrazione sul cliente della commessa corrente',async()=>{
 show();await screen.findByText(/Nessuna ritenuta del cliente registrata/);fireEvent.click(screen.getByRole('button',{name:'Registra ritenuta'}));expect(screen.getByRole('dialog')).toHaveTextContent('commessa o1');
});
it('svincolo documentato non è presentato come incasso e apre il popup del record esistente',async()=>{
 m.data=[{id:'rt1',importo:100,stato:'trattenuta',data_svincolo_prevista:'2020-01-01',sal_record_id:'s1'},{id:'rt2',importo:50,stato:'svincolata'}];show();
 await waitFor(()=>expect(screen.getByText('Data di svincolo raggiunta').parentElement).toHaveTextContent('100,00'));
 expect(screen.getByText('Svincolo documentato').parentElement).toHaveTextContent('50,00');
 expect(screen.queryByText(/tornat.*in cassa/)).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Documenta svincolo'}));expect(screen.getByRole('dialog')).toHaveTextContent('rt1');
 expect(screen.getByRole('link',{name:'Apri SAL'})).toHaveAttribute('href','/azienda/ordini/o1?tab=finanza&vista_economia=sal');
});
it('un errore non diventa un falso totale zero',async()=>{
 m.error={message:'lettura non disponibile'};show();expect(await screen.findByRole('alert')).toHaveTextContent('non disponibili');expect(screen.queryByText('Nessuna ritenuta del cliente registrata.')).toBeNull();
});
it('il ruolo senza accesso non legge il registro o espone comandi di scrittura',()=>{
 m.admin=false;show();expect(screen.getByText(/consultabile dall’amministrazione/)).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Registra ritenuta'})).toBeNull();
});
