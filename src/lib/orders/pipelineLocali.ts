import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth,getCachedTokens } from "@/contexts/AuthContext";
import {withClientTimeout} from "@/lib/query-timeout";
import type { OrderStatus } from "@/lib/orderUtils";

export interface PipelineLocale { id: string; nome: string; fasi: OrderStatus[]; versione?: number }
interface Archivio { pipeline: PipelineLocale[]; fasiPerCommessa: Record<string, string> }
const vuoto: Archivio = { pipeline: [], fasiPerCommessa: {} };
const chiaveBrowser = (azienda: string) => "ordini.pipeline.locali.v1." + azienda;

export async function richiestaPipelineLocale<T>(azienda: string, body?: object): Promise<T> {
  if (!import.meta.env.DEV) {
    const rpc = supabase.rpc.bind(supabase) as unknown as (nome: string, op: object) => PromiseLike<{
      data: unknown; error: { message: string } | null;
    }>;
    const { data, error } = await withClientTimeout(Promise.resolve(rpc("pipeline_commesse", {
      p_azienda: azienda, p_operazione: body ?? null,
    })), "Pipeline commesse", 12_000);
    if (error) throw new Error(error.message);
    return data as T;
  }
  // Il token è già mantenuto dagli eventi auth: il polling non deve accodare
  // un nuovo getSession() sul lock condiviso da tutte le pagine/schede.
  let token=getCachedTokens().accessToken;
  if(!token){
    const {data}=await withClientTimeout(supabase.auth.getSession(),"Verifica sessione pipeline",5000);
    token=data.session?.access_token??null;
  }
  if(!token)throw new Error("Accedi per consultare le pipeline.");
  const response = await fetch("/api/locale/pipeline-commesse?azienda="+encodeURIComponent(azienda),{
    signal:AbortSignal.timeout(12000),
    method:body ? "POST" : "GET",
    headers:{ Authorization:"Bearer "+token, "Content-Type":"application/json" },
    body:body ? JSON.stringify(body) : undefined, cache:"no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.errore ?? "Database pipeline non disponibile.");
  return result as T;
}

export function usePipelineLocali(azienda: string) {
  const client = useQueryClient();
  const {user} = useAuth();
  const key = ["pipeline-commesse-condivise", azienda, user?.id];
  const query = useQuery({queryKey:key, enabled:!!azienda && !!user?.id, queryFn:()=>richiestaPipelineLocale<Archivio>(azienda),
    staleTime:30_000, refetchInterval:30_000, refetchOnWindowFocus:true, retry:1, meta:{silent:true}});
  const archivio = query.data ?? vuoto;
  async function scrivi(body: object) {
    try { await richiestaPipelineLocale(azienda,body); }
    finally { await client.invalidateQueries({queryKey:key}); }
  }
  async function importa() {
    const raw = localStorage.getItem(chiaveBrowser(azienda));
    if (!raw) return;
    const vecchio = JSON.parse(raw) as Archivio;
    const corrente = await richiestaPipelineLocale<Archivio>(azienda);
    for (const p of vecchio.pipeline) {
      if (!corrente.pipeline.some(r=>r.id===p.id)) await scrivi({azione:"salva",pipeline:p});
    }
    for (const [commessa,fase] of Object.entries(vecchio.fasiPerCommessa)) {
      if (!corrente.fasiPerCommessa[commessa]) await scrivi({azione:"assegna",commessa,fase,precedente:null});
    }
    localStorage.removeItem(chiaveBrowser(azienda));
    await client.invalidateQueries({queryKey:key});
  }
  return {...archivio, caricamento:query.isLoading, errore:query.isLoadingError ? query.error.message
    : query.isPaused && !query.data ? "Connessione assente. Le pipeline si caricheranno al ripristino della rete." : undefined,
    aggiornamentoFallito:query.isRefetchError, aggiornamentoInCorso:query.isFetching, riprova:query.refetch,
    salvaPipeline:(pipeline:PipelineLocale)=>scrivi({azione:"salva",pipeline}),
    assegnaFase:(commessa:string,fase:string|null,precedente:string|null = archivio.fasiPerCommessa[commessa] ?? null)=>scrivi({azione:"assegna",commessa,fase,precedente}),
    daImportare:!!localStorage.getItem(chiaveBrowser(azienda)), importa};
}
