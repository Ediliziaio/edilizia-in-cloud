import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
    // Inbox "viva" senza realtime sulle tabelle sorgente (richiederebbe ALTER
    // PUBLICATION): refetch al rientro sulla tab + polling leggero mentre è aperta.
    refetchOnWindowFocus: true,
    refetchInterval: 25_000,
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
    refetchOnWindowFocus: true,
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

export type ConversazioneStato = "aperta" | "in_attesa" | "chiusa";

interface OverlayArgs {
  entitaTipo: EntitaTipo;
  entitaId: string;
  patch: { last_read_at?: string; stato?: ConversazioneStato; assegnato_a?: string | null };
}

/**
 * Mutation sull'overlay di stato `conversazioni` (segna-letto / stato / assegnazione).
 * La tabella ha già stato/assegnato_a/last_read_at ma finora nessuno ci scriveva
 * (overlay dormiente). La policy RLS `conversazioni_company_rw` permette l'upsert
 * lato client → nessuna RPC/migration necessaria. onConflict sull'unique
 * (company_id, entita_tipo, entita_id).
 */
export function useConversazioneOverlay(companyId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ entitaTipo, entitaId, patch }: OverlayArgs) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("conversazioni")
        .upsert(
          {
            company_id: companyId,
            entita_tipo: entitaTipo,
            entita_id: entitaId,
            ...patch,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "company_id,entita_tipo,entita_id" },
        );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversazioni-lista", companyId] });
    },
  });
}

/**
 * Ricerca nel CONTENUTO dei messaggi (RPC conversazioni_cerca). DEGRADO AUTOMATICO:
 * se l'RPC non è ancora deployata su prod ritorna `{ available: false }` → l'inbox
 * ricade sulla ricerca client-side senza errori. Ritorna l'insieme delle chiavi
 * entità che combaciano (`entita_tipo:entita_id`).
 */
export function useConversazioniCerca(companyId: string | null | undefined, query: string) {
  const q = (query ?? "").trim();
  return useQuery<{ available: boolean; keys: Set<string> }>({
    queryKey: ["conversazioni-cerca", companyId, q],
    enabled: !!companyId && q.length >= 2,
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await callRpc<Array<{ entita_tipo: string; entita_id: string }>>(
        "conversazioni_cerca",
        { p_company_id: companyId, p_query: q },
      );
      if (error) {
        const msg = (error.message || "").toLowerCase();
        // RPC non ancora presente su prod (modalità locale) → degrada silenziosamente.
        if (
          msg.includes("does not exist") ||
          msg.includes("could not find") ||
          msg.includes("schema cache") ||
          msg.includes("conversazioni_cerca") ||
          msg.includes("404")
        ) {
          return { available: false, keys: new Set<string>() };
        }
        throw new Error(error.message);
      }
      return {
        available: true,
        keys: new Set((data ?? []).map((r) => `${r.entita_tipo}:${r.entita_id}`)),
      };
    },
  });
}
