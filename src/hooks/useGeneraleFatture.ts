// src/hooks/useGeneraleFatture.ts
// Le fatture nate dalla commessa generale (SAL di contratto, pagamenti delle unità):
// una lettura per tutta la generale, i dati per preparare una bozza, la creazione.
// Database: migrazione 20281105100000_generale_fatture.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { chiaviGenerali } from "@/hooks/useCommesseGenerali";
import { queryKeys } from "@/lib/queryKeys";
import {
  leggiDatiFattura, leggiElencoFatture,
  type DatiFattura, type ElencoFattureGenerale, type OrigineFattura,
} from "@/lib/orders/generali/fatture";
import type { DocumentoFiscale } from "@/types/fatturazione";

// RPC non ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const chiaviFattureGenerale = {
  elenco: (generaleId: string | undefined) => ["generale-fatture", generaleId] as const,
  dati: (origine: OrigineFattura, id: string | undefined) => ["generale-fattura-dati", origine, id] as const,
};

/** Le fatture vive della generale e se chi guarda può fatturare. */
export function useFattureGenerale(generaleId: string | undefined) {
  return useQuery({
    queryKey: chiaviFattureGenerale.elenco(generaleId),
    enabled: !!generaleId,
    staleTime: 30_000,
    retry: false,
    queryFn: async (): Promise<ElencoFattureGenerale> => {
      const { data, error } = await db.rpc("generale_fatture_elenco", { p_generale_id: generaleId });
      if (error) throw error;
      return leggiElencoFatture(data);
    },
  });
}

/** Ciò che serve per preparare la bozza: importi, cliente, fattura già esistente. */
export function useDatiFatturaGenerale(origine: OrigineFattura, id: string | undefined, attivo: boolean) {
  return useQuery({
    queryKey: chiaviFattureGenerale.dati(origine, id),
    enabled: !!id && attivo,
    staleTime: 0,
    retry: false,
    queryFn: async (): Promise<DatiFattura> => {
      const { data, error } = await db.rpc("generale_fattura_dati", { p_origine: origine, p_id: id });
      if (error) throw error;
      return leggiDatiFattura(data);
    },
  });
}

export interface FatturaCreata {
  id: string;
  numero: string | null;
  /** true = c'era già una fattura viva per questo SAL o pagamento: non ne è nata un'altra. */
  esistente: boolean;
}

/** Crea la bozza (o restituisce quella che c'è già) e la lega al SAL o al pagamento. */
export function useCreaFatturaGenerale(generaleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ origine, id, bozza }: { origine: OrigineFattura; id: string; bozza: Partial<DocumentoFiscale> }): Promise<FatturaCreata> => {
      const { data, error } = await db.rpc("generale_fattura_crea", { p_origine: origine, p_id: id, p_dati: bozza });
      if (error) throw error;
      const r = (data ?? {}) as { id?: string; numero?: string | null; esistente?: boolean };
      if (!r.id) throw new Error("La bozza non è stata creata.");
      return { id: r.id, numero: r.numero ?? null, esistente: r.esistente === true };
    },
    onSettled: (_d, _e, v) => {
      void qc.invalidateQueries({ queryKey: chiaviFattureGenerale.elenco(generaleId) });
      void qc.invalidateQueries({ queryKey: chiaviFattureGenerale.dati(v.origine, v.id) });
      void qc.invalidateQueries({ queryKey: chiaviGenerali.riepilogo(generaleId) });
      void qc.invalidateQueries({ queryKey: queryKeys.documentiFiscali.all });
    },
  });
}
