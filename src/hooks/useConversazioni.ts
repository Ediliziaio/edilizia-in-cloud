import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CanaleConversazione = "email" | "sms" | "whatsapp" | "nota";
export type DirezioneMessaggio = "in" | "out";
export type EntitaTipo = "contatto" | "cliente";

/** Riga della sidebar (1 per entità) — output di conversazioni_lista(). */
export interface ConversazioneListItem {
  entita_tipo: EntitaTipo;
  entita_id: string;
  nome: string | null;
  email: string | null;
  telefono: string | null;
  ultimo_ts: string | null;
  ultimo_canale: CanaleConversazione | null;
  ultimo_direzione: DirezioneMessaggio | null;
  anteprima: string | null;
  non_letti: number;
  totale_messaggi: number;
  stato: string;
  assegnato_a: string | null;
}

/** Messaggio della timeline — output di conversazione_timeline(). */
export interface ConversazioneMessaggio {
  canale: CanaleConversazione;
  direzione: DirezioneMessaggio;
  controparte: string | null;
  oggetto: string | null;
  testo: string | null;
  media_url: string | null;
  ts: string;
  ref_tabella: string;
  ref_id: string;
}

// Le RPC conversazioni_lista / conversazione_timeline non sono ancora nei tipi
// generati (migration 20270704000000 da applicare + tipi da rigenerare). Wrapper
// tipato per evitare `any` mantenendo i risultati type-safe.
type RpcResult<T> = { data: T | null; error: { message: string } | null };
function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<RpcResult<T>> {
  const rpc = supabase.rpc as unknown as (
    f: string,
    a: Record<string, unknown>,
  ) => Promise<RpcResult<T>>;
  return rpc(fn, args);
}

/** Lista conversazioni dell'azienda (sidebar inbox) — contatti + clienti. */
export function useConversazioniList(companyId: string | null | undefined) {
  return useQuery<ConversazioneListItem[]>({
    queryKey: ["conversazioni-lista", companyId],
    enabled: !!companyId,
    staleTime: 30_000,
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await callRpc<ConversazioneListItem[]>("conversazioni_lista", {
        p_company_id: companyId,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

/** Timeline unificata di una singola entità (contatto|cliente). */
export function useConversazioneTimeline(
  entitaTipo: EntitaTipo | null | undefined,
  entitaId: string | null | undefined,
) {
  return useQuery<ConversazioneMessaggio[]>({
    queryKey: ["conversazione-timeline", entitaTipo, entitaId],
    enabled: !!entitaTipo && !!entitaId,
    staleTime: 15_000,
    queryFn: async () => {
      if (!entitaTipo || !entitaId) return [];
      const { data, error } = await callRpc<ConversazioneMessaggio[]>("conversazione_timeline", {
        p_entita_tipo: entitaTipo,
        p_entita_id: entitaId,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}
