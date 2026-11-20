import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const m=vi.hoisted(()=>({rpc:vi.fn(),error:vi.fn(),refresh:vi.fn(),pdf:vi.fn(),canEdit:true}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:m.rpc}}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({role:'company_staff',effectiveCompany:{id:'c'},user:{id:'u'}})}));
vi.mock('@/hooks/usePermissions',()=>({usePermissions:()=>({canEditOrders:m.canEdit,canViewCosts:true})}));
vi.mock('@/lib/orders/refreshWorkQueries',()=>({refreshWorkQueries:m.refresh}));
vi.mock('@/lib/campo/rapportinoPdf',()=>({notifyRapportinoPdf:m.pdf}));
vi.mock('@/components/orders/LaborApprovalDialog',()=>({LaborApprovalDialog:():null=>null}));
vi.mock('sonner',()=>({toast:{error:m.error,success:vi.fn()}}));
import { useDecisioneRapportino } from '@/components/orders/DecisioneRapportino';
import { messaggioAnnullamento } from '@/lib/campo/erroreAnnullamento';

beforeEach(()=>{vi.clearAllMocks();m.canEdit=true;});afterEach(cleanup);
function open(){const qc=new QueryClient({defaultOptions:{mutations:{retry:false},queries:{retry:false,gcTime:0}}});return renderHook(()=>useDecisioneRapportino('o'),{wrapper:({children}:{children:ReactNode})=><QueryClientProvider client={qc}>{children}</QueryClientProvider>});}
describe('Motivo effettivo del mancato annullamento',()=>{
  it.each([
    {code:'23514',message:'Non si può annullare: è già in un rendiconto non più in bozza.'},
    {code:'23514',message:'Non si può annullare: è riportato in una pagina firmata del giornale dei lavori.'},
    {code:'PT409',message:'Il rapportino è cambiato: aggiorna la pagina prima di annullarlo.'},
    {code:'42501',message:'Non hai il permesso di annullare questo rapportino.'},
    {code:'22023',message:"Scrivi il motivo dell'annullamento."},
  ])('mostra il messaggio della risposta PostgREST $code / $message',async error=>{
    m.rpc.mockResolvedValue({error});const {result}=open();
    act(()=>result.current.annullaMutation.mutate({id:'r',updatedAt:'versione',motivo:'Prova'}));
    await waitFor(()=>expect(m.error).toHaveBeenCalledWith(error.message));
    expect(m.pdf).not.toHaveBeenCalled();expect(m.refresh).not.toHaveBeenCalled();
  });
  it('in assenza di permessi non invoca la RPC',async()=>{
    m.canEdit=false;const {result}=open();
    act(()=>result.current.annullaMutation.mutate({id:'r',updatedAt:'v',motivo:'Prova'}));
    await waitFor(()=>expect(m.error).toHaveBeenCalledWith('Non hai il permesso di annullare rapportini'));
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it('traduce rete/sessione e mantiene privati i dettagli tecnici',()=>{
    expect(messaggioAnnullamento(new TypeError('Failed to fetch'))).toMatch(/Connessione interrotta/);
    expect(messaggioAnnullamento({code:'PGRST301',message:'JWT expired'})).toMatch(/Sessione scaduta/);
    expect(messaggioAnnullamento({code:'23514',message:'new row violates check constraint "segreto"'})).not.toContain('segreto');
    expect(messaggioAnnullamento({code:'42501',message:'permission denied for function private_guard'})).not.toContain('private_guard');
    expect(messaggioAnnullamento(null)).toMatch(/Riprova/);
  });
});
