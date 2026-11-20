import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc}}));
import { MetricheFunzioni } from '@/components/admin/MetricheFunzioni';
const metrics={totalCalls:7513,totalErrors:267,totalPaymentBlocks:248,avgLatency:123,byFunction:[{name:'funzione',calls:7000,errors:230,avgLatency:150}]};
let qc:QueryClient;
beforeEach(()=>{rpc.mockReset();qc=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});});
afterEach(()=>{cleanup();qc.clear();});
function open(){return render(<QueryClientProvider client={qc}><MetricheFunzioni/></QueryClientProvider>);}
describe('Metriche complete senza falso stato sano',()=>{
  it('mostra il totale server oltre 500 e distingue i blocchi',async()=>{
    rpc.mockResolvedValue({data:metrics,error:null});open();
    expect(await screen.findByText(/7\.?513/)).toBeInTheDocument();
    expect(screen.getByText('Di cui 248 blocchi per pagamento o credito.')).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('admin_metriche_funzioni_24h');
  });
  it('un errore è visibile e il nuovo tentativo recupera i dati',async()=>{
    rpc.mockResolvedValueOnce({data:null,error:{message:'DB non disponibile'}}).mockResolvedValue({data:metrics,error:null});open();
    expect(await screen.findByRole('alert')).toHaveTextContent('I valori non sono disponibili');
    expect(screen.queryByText('Chiamate (24h)')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Riprova metriche'}));
    expect(await screen.findByText(/7\.?513/)).toBeInTheDocument();
  });
  it('non mostra valori zero durante il caricamento',()=>{
    rpc.mockReturnValue(new Promise(()=>{}));open();
    expect(screen.getByRole('status')).toHaveTextContent('Carico le metriche');expect(screen.queryByText('Chiamate (24h)')).toBeNull();
  });
  it('distingue un risultato nullo dal vero elenco vuoto',async()=>{
    rpc.mockResolvedValue({data:null,error:null});open();expect(await screen.findByRole('alert')).toBeInTheDocument();
    rpc.mockResolvedValue({data:{totalCalls:0,totalErrors:0,totalPaymentBlocks:0,avgLatency:0,byFunction:[]},error:null});
    fireEvent.click(screen.getByRole('button',{name:'Riprova metriche'}));
    expect(await screen.findByText('Nessun dato nelle ultime 24 ore')).toBeInTheDocument();
  });
  it('una rilettura fallita non lascia i vecchi valori come se fossero aggiornati',async()=>{
    rpc.mockResolvedValue({data:metrics,error:null});open();expect(await screen.findByText(/7\.?513/)).toBeInTheDocument();
    rpc.mockResolvedValue({data:null,error:{message:'Rete interrotta'}});
    await qc.invalidateQueries({queryKey:['admin-edge-perf']});
    await waitFor(()=>expect(screen.getByRole('alert')).toBeInTheDocument());expect(screen.queryByText(/7\.?513/)).toBeNull();
  });
});
