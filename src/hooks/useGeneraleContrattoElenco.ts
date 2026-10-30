// src/hooks/useGeneraleContrattoElenco.ts
// Elenco prezzi del contratto, ordini di lavoro prezzati dall'elenco (computo) e misure.
// Si caricano solo quando si apre la sezione: un elenco può avere migliaia di voci.
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { chiaviContratto, useAggiornaDopo } from "@/hooks/useGeneraleContratto";
import type { MisuraFiglia, VoceElenco } from "@/lib/orders/generali/contratto";
import { righePerImport, type RigaElencoIncollata } from "@/lib/orders/generali/contrattoElenco";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function useElencoPrezzi(generaleId: string, enabled = true) {
  return useQuery({
    queryKey: chiaviContratto.elenco(generaleId),
    enabled: !!generaleId && enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<VoceElenco[]> => {
      const { data, error } = await db
        .from("generale_elenco_prezzi")
        .select("id, codice, descrizione, unita_misura, prezzo, soggetto_ribasso, quantita_contratto, posizione")
        .eq("generale_id", generaleId)
        .order("posizione")
        .limit(10_000);
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        codice: (r.codice as string | null) ?? null,
        descrizione: r.descrizione as string,
        unitaMisura: (r.unita_misura as string) ?? "",
        prezzo: Number(r.prezzo),
        soggettoRibasso: r.soggetto_ribasso !== false,
        quantitaContratto: n(r.quantita_contratto),
        posizione: Number(r.posizione) || 0,
      }));
    },
  });
}

export function useImportaElenco(generaleId: string) {
  const dopo = useAggiornaDopo(generaleId);
  return useMutation({
    mutationFn: async (righe: readonly RigaElencoIncollata[]): Promise<{ nuove: number; aggiornate: number }> => {
      const { data, error } = await db.rpc("generale_elenco_importa", { p_generale_id: generaleId, p_righe: righePerImport(righe) });
      if (error) throw error;
      return { nuove: Number(data?.nuove) || 0, aggiornate: Number(data?.aggiornate) || 0 };
    },
    onSuccess: () => dopo(),
  });
}

export function useSalvaVoceElenco(generaleId: string) {
  const { effectiveCompany } = useAuth();
  const dopo = useAggiornaDopo(generaleId);
  return useMutation({
    mutationFn: async (v: Omit<VoceElenco, "posizione"> & { posizione?: number }) => {
      const riga = {
        generale_id: generaleId, company_id: effectiveCompany?.id, codice: v.codice?.trim() || null,
        descrizione: v.descrizione.trim(), unita_misura: v.unitaMisura.trim(), prezzo: v.prezzo,
        soggetto_ribasso: v.soggettoRibasso, quantita_contratto: v.quantitaContratto,
        ...(v.posizione !== undefined ? { posizione: v.posizione } : {}),
      };
      const { error } = v.id
        ? await db.from("generale_elenco_prezzi").update(riga).eq("id", v.id)
        : await db.from("generale_elenco_prezzi").insert(riga);
      if (error) throw error;
    },
    onSuccess: () => dopo(),
  });
}

export function useEliminaVoceElenco(generaleId: string) {
  const dopo = useAggiornaDopo(generaleId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("generale_elenco_prezzi").delete().eq("id", id).eq("generale_id", generaleId);
      if (error) throw error;
    },
    onSuccess: () => dopo(),
  });
}

export interface RigaComputoFiglia { id: string; figliaId: string; voceId: string; quantita: number }

export function useComputo(generaleId: string, enabled = true) {
  return useQuery({
    queryKey: chiaviContratto.computo(generaleId),
    enabled: !!generaleId && enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<RigaComputoFiglia[]> => {
      const { data, error } = await db
        .from("generale_computo")
        .select("id, figlia_id, voce_id, quantita")
        .eq("generale_id", generaleId)
        .limit(20_000);
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string, figliaId: r.figlia_id as string, voceId: r.voce_id as string, quantita: Number(r.quantita),
      }));
    },
  });
}

/** Una voce dell'elenco in un ordine di lavoro, con la quantità prevista (zero = la toglie). */
export function useSalvaComputo(generaleId: string) {
  const { effectiveCompany } = useAuth();
  const dopo = useAggiornaDopo(generaleId);
  return useMutation({
    mutationFn: async (r: { figliaId: string; voceId: string; quantita: number | null }) => {
      const { error } = r.quantita === null
        ? await db.from("generale_computo").delete().eq("generale_id", generaleId).eq("figlia_id", r.figliaId).eq("voce_id", r.voceId)
        : await db.from("generale_computo").upsert(
          { generale_id: generaleId, company_id: effectiveCompany?.id, figlia_id: r.figliaId, voce_id: r.voceId, quantita: r.quantita },
          { onConflict: "figlia_id,voce_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => dopo(),
  });
}

/** L'importo dell'ordine diventa quello dell'elenco (generale_figlia_prezza). */
export function usePrezzaFiglia(generaleId: string) {
  const dopo = useAggiornaDopo(generaleId);
  return useMutation({
    mutationFn: async (figliaId: string): Promise<number> => {
      const { data, error } = await db.rpc("generale_figlia_prezza", { p_figlia_id: figliaId });
      if (error) throw error;
      return Number(data) || 0;
    },
    onSuccess: () => dopo({ ordini: true }),
  });
}

export function useMisure(generaleId: string, enabled = true) {
  return useQuery({
    queryKey: chiaviContratto.misure(generaleId),
    enabled: !!generaleId && enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<MisuraFiglia[]> => {
      const { data, error } = await db
        .from("generale_misure")
        .select("id, figlia_id, voce_id, data, quantita, descrizione, sal_id")
        .eq("generale_id", generaleId)
        .order("data", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(20_000);
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string, figliaId: r.figlia_id as string, voceId: r.voce_id as string, data: r.data as string,
        quantita: Number(r.quantita), descrizione: (r.descrizione as string | null) ?? null, salId: (r.sal_id as string | null) ?? null,
      }));
    },
  });
}

export function useAggiungiMisura(generaleId: string) {
  const { effectiveCompany } = useAuth();
  const dopo = useAggiornaDopo(generaleId);
  return useMutation({
    mutationFn: async (m: { figliaId: string; voceId: string; data: string; quantita: number; descrizione: string | null }) => {
      const { error } = await db.from("generale_misure").insert({
        generale_id: generaleId, company_id: effectiveCompany?.id, figlia_id: m.figliaId, voce_id: m.voceId,
        data: m.data, quantita: m.quantita, descrizione: m.descrizione,
      });
      if (error) throw error;
    },
    onSuccess: () => dopo(),
  });
}

export function useEliminaMisura(generaleId: string) {
  const dopo = useAggiornaDopo(generaleId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("generale_misure").delete().eq("id", id).eq("generale_id", generaleId);
      if (error) throw error;
    },
    onSuccess: () => dopo(),
  });
}
