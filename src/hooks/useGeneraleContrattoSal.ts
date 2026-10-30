// src/hooks/useGeneraleContrattoSal.ts
// Il SAL di contratto: anteprima, composizione, emissione e annullo con le RPC generale_sal_*;
// PDF e link di firma con generate-sal-pdf, la stessa funzione dei SAL di commessa.
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { chiaviContratto, useAggiornaDopo } from "@/hooks/useGeneraleContratto";
import { leggiAnteprimaSal, type AnteprimaSal } from "@/lib/orders/generali/contratto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Cosa uscirebbe dal SAL fino al giorno `al`, con le percentuali proposte per gli ordini ad avanzamento. */
export function useAnteprimaSal(generaleId: string, al: string, avanzamenti: Record<string, number>, enabled: boolean) {
  const chiave = JSON.stringify(Object.entries(avanzamenti).sort(([a], [b]) => a.localeCompare(b)));
  return useQuery({
    queryKey: chiaviContratto.anteprima(generaleId, al, chiave),
    enabled: enabled && /^\d{4}-\d{2}-\d{2}$/.test(al),
    staleTime: 10_000,
    placeholderData: (prima) => prima,
    queryFn: async (): Promise<AnteprimaSal> => {
      const { data, error } = await db.rpc("generale_sal_anteprima", { p_generale_id: generaleId, p_al: al, p_avanzamenti: avanzamenti });
      if (error) throw error;
      return leggiAnteprimaSal(data);
    },
  });
}

export interface NuovoSal {
  dal: string | null;
  al: string;
  data: string;
  avanzamenti: Record<string, number>;
  note: string | null;
}

export function useCreaSal(generaleId: string) {
  const dopo = useAggiornaDopo(generaleId);
  return useMutation({
    mutationFn: async (s: NuovoSal): Promise<string> => {
      const { data, error } = await db.rpc("generale_sal_crea", {
        p_generale_id: generaleId, p_dal: s.dal, p_al: s.al, p_data: s.data, p_avanzamenti: s.avanzamenti, p_note: s.note,
      });
      if (error) throw error;
      if (typeof data !== "string") throw new Error("Il SAL non risulta creato. Ricarica la pagina.");
      return data;
    },
    onSuccess: () => dopo(),
  });
}

export function useEmettiSal(generaleId: string) {
  const dopo = useAggiornaDopo(generaleId);
  return useMutation({
    mutationFn: async (salId: string): Promise<{ registrata: boolean }> => {
      const { data, error } = await db.rpc("generale_sal_emetti", { p_sal_id: salId });
      if (error) throw error;
      return { registrata: typeof data?.registro === "string" };
    },
    onSuccess: () => dopo(),
  });
}

export function useAnnullaSal(generaleId: string) {
  const dopo = useAggiornaDopo(generaleId);
  return useMutation({
    mutationFn: async (salId: string) => {
      const { error } = await db.rpc("generale_sal_annulla", { p_sal_id: salId });
      if (error) throw error;
    },
    onSuccess: () => dopo(),
  });
}

export function useRegistraRitenuta(generaleId: string) {
  const dopo = useAggiornaDopo(generaleId);
  return useMutation({
    mutationFn: async (salId: string) => {
      const { error } = await db.rpc("generale_sal_registra_ritenuta", { p_sal_id: salId });
      if (error) throw error;
    },
    onSuccess: () => dopo(),
  });
}

/**
 * Il documento del SAL (HTML da stampare) e, con `firma`, il link per il committente.
 * Stessa funzione dei SAL di commessa: per un SAL di contratto aggiunge periodo, ritenuta,
 * recupero dell'anticipazione e netto.
 */
export async function documentoSal(salId: string, companyId: string, firma: boolean): Promise<{ html: string; link: string | null }> {
  const { data, error } = await supabase.functions.invoke("generate-sal-pdf", {
    body: { sal_id: salId, company_id: companyId, prepare_signature: firma },
  });
  if (error) {
    const dettaglio = error.context ? await error.context.json?.().catch((): null => null) : null;
    throw new Error(dettaglio?.error || "Il documento del SAL non è disponibile. Riprova tra poco.");
  }
  if (typeof data?.html !== "string") throw new Error("Il documento del SAL è vuoto.");
  const link = typeof data.signature_url === "string" && /^https:\/\//.test(data.signature_url) ? data.signature_url : null;
  if (firma && !link) throw new Error("Il link per il committente non è stato preparato.");
  return { html: data.html, link };
}
