import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { OrderStatus } from "@/lib/orderUtils";

export interface PipelineLocale { id: string; nome: string; fasi: OrderStatus[]; versione?: number }
interface Archivio { pipeline: PipelineLocale[]; fasiPerCommessa: Record<string, string> }
const vuoto: Archivio = { pipeline: [], fasiPerCommessa: {} };
export const PRINCIPALE = "principale";
const chiaveBrowser = (azienda: string) => "ordini.pipeline.locali.v1." + azienda;

async function richiesta<T>(azienda: string, body?: object): Promise<T> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Accedi per consultare le pipeline.");
  const response = await fetch("/api/locale/pipeline-commesse?azienda="+encodeURIComponent(azienda),{
    method:body ? "POST" : "GET",
    headers:{ Authorization:"Bearer "+data.session.access_token, "Content-Type":"application/json" },
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
  const query = useQuery({queryKey:key, enabled:import.meta.env.DEV && !!azienda && !!user?.id, queryFn:()=>richiesta<Archivio>(azienda),
    refetchInterval:5000, refetchOnWindowFocus:"always", retry:1});
  const archivio = query.data ?? vuoto;
  async function scrivi(body: object) {
    try { await richiesta(azienda,body); }
    finally { await client.invalidateQueries({queryKey:key}); }
  }
  async function importa() {
    const raw = localStorage.getItem(chiaveBrowser(azienda));
    if (!raw) return;
    const vecchio = JSON.parse(raw) as Archivio;
    const corrente = await richiesta<Archivio>(azienda);
    for (const p of vecchio.pipeline) {
      if (!corrente.pipeline.some(r=>r.id===p.id)) await scrivi({azione:"salva",pipeline:p});
    }
    for (const [commessa,fase] of Object.entries(vecchio.fasiPerCommessa)) {
      if (!corrente.fasiPerCommessa[commessa]) await scrivi({azione:"assegna",commessa,fase,precedente:null});
    }
    localStorage.removeItem(chiaveBrowser(azienda));
    await client.invalidateQueries({queryKey:key});
  }
  return {...archivio, caricamento:query.isLoading, errore:query.error?.message, riprova:query.refetch,
    salvaPipeline:(pipeline:PipelineLocale)=>scrivi({azione:"salva",pipeline}),
    assegnaFase:(commessa:string,fase:string|null,precedente:string|null = archivio.fasiPerCommessa[commessa] ?? null)=>scrivi({azione:"assegna",commessa,fase,precedente}),
    daImportare:!!localStorage.getItem(chiaveBrowser(azienda)), importa};
}
