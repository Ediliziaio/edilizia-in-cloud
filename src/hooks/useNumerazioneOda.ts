import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Numerazione degli ordini ai fornitori: la riga dell'azienda in
 * numerazione_ordini_fornitore (migrazione 20290131160000) e l'anteprima del
 * prossimo numero, che non lo consuma. Senza riga vale ODA-AAAA-NNNN.
 */
export interface NumerazioneOda {
  formato: string;
  prossimo: number;
}

// Tabella e funzione nuove, non ancora nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const chiaveNumerazioneOda = (companyId: string | undefined) => ["numerazione-oda", companyId] as const;
export const chiaveAnteprimaOda = (companyId: string | undefined, supplierId?: string | null) =>
  ["anteprima-numero-oda", companyId, supplierId ?? null] as const;

export function useNumerazioneOda() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: chiaveNumerazioneOda(companyId),
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<NumerazioneOda | null> => {
      const { data, error } = await db
        .from("numerazione_ordini_fornitore")
        .select("formato, prossimo")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });

  const invalida = () => {
    qc.invalidateQueries({ queryKey: chiaveNumerazioneOda(companyId) });
    qc.invalidateQueries({ queryKey: ["anteprima-numero-oda", companyId] });
  };

  /** null = torna a ODA-AAAA-NNNN. */
  const salva = useMutation({
    mutationFn: async (nuova: NumerazioneOda | null) => {
      if (!companyId) throw new Error("Azienda non selezionata");
      const { error } = nuova
        ? await db.from("numerazione_ordini_fornitore")
            .upsert({ company_id: companyId, formato: nuova.formato.trim(), prossimo: nuova.prossimo }, { onConflict: "company_id" })
        : await db.from("numerazione_ordini_fornitore").delete().eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalida();
      toast.success("Numerazione degli ordini salvata");
    },
    onError: (e: unknown) => {
      const messaggio = (e as { message?: string } | null)?.message;
      toast.error("Non riesco a salvare la numerazione", { description: messaggio ?? String(e) });
    },
  });

  return { numerazione: query.data ?? null, isLoading: query.isLoading, salva };
}

/** Il prossimo numero che prenderebbe un ordine (al fornitore, se dato), senza consumarlo. */
export function useAnteprimaNumeroOda(supplierId?: string | null, abilitata = true) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: chiaveAnteprimaOda(companyId, supplierId),
    enabled: !!companyId && abilitata,
    staleTime: 0,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await db.rpc("anteprima_numero_oda", {
        p_company_id: companyId,
        p_supplier_id: supplierId || null,
      });
      if (error) throw error;
      return typeof data === "string" ? data : null;
    },
  });
}
