import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { AlertTriangle, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exitLocalWarehouse } from './mode';
import { localBridge, warehouseLabSession } from './bridge-client';

export default function LocalWarehouseShell({children}:{children:ReactNode}) {
  const [client] = useState(()=>new QueryClient({defaultOptions:{queries:{retry:false,staleTime:0},mutations:{retry:false}}}));
  const [error,setError]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const { isPending, isError, refetch } = useQuery({
    queryKey: ['warehouse-lab-ready'],
    queryFn: async () => { await warehouseLabSession(); return true; },
    retry: false,
  });
  async function reset() {
    setBusy(true);setError(null);
    try {const res=await localBridge('reset',{});if(!res.ok) throw new Error('Impossibile ripristinare i dati di prova.');client.clear();window.location.reload();}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <QueryClientProvider client={client}>
    <div className="mx-4 mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950" role="region" aria-label="Collaudo locale del Magazzino">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="flex items-center gap-2 font-semibold"><FlaskConical className="h-4 w-4"/>Collaudo locale · Magazzino</p><p className="mt-1 text-sm">Dati di prova separati da Demo Azienda 2. Tutte le operazioni del Magazzino aggiornano solo il database locale.</p></div><div className="flex gap-2"><Button variant="outline" size="sm" disabled={busy || isPending || isError} onClick={()=>void reset()}>Ripristina dati di prova</Button><Button variant="outline" size="sm" onClick={exitLocalWarehouse}>Esci dal collaudo</Button></div></div>
      {error&&<p role="alert" className="mt-2 flex gap-2 text-sm"><AlertTriangle className="h-4 w-4"/>{error}</p>}
      {isError && <p role="alert" className="mt-2 text-sm">Servizio locale del Magazzino non raggiungibile. <Button variant="link" onClick={() => void refetch()}>Riprova collegamento</Button></p>}
      {isPending && <p role="status" className="mt-2 text-sm">Collegamento al Magazzino locale…</p>}
    </div>
    {!isPending && !isError && children}
  </QueryClientProvider>;
}
