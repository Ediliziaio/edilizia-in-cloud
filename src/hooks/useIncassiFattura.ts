import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { queryKeys } from "@/lib/queryKeys";
import { invalidaStatisticheFatturazione } from "@/lib/fatturazione/invalidaStatistiche";
import type { IncassoFattura, MovimentoBanca } from "@/lib/fatturazione/abbinaBanca";

// Incassi della fattura dalla fattura stessa (30/10/2026): storico, annulla
// incasso, abbinamento al bonifico. Le RPC controllano chi può registrare
// incassi (puo_incassare_fatture) nell'azienda della fattura.

const chiaveIncassi = (documentoId: string | undefined) => ["incassi-fattura", documentoId] as const;
const chiaveBanca = (documentoId: string | undefined) => ["incassi-fattura", "banca", documentoId] as const;

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
const rpc: Rpc = (fn, args) => supabase.rpc(fn as never, args as never) as never;

/** Tutto ciò che mostra un incasso: elenco, dettaglio, registro, scadenzario, cassa, Tesoreria. */
function aggiornaDopoIncasso(queryClient: QueryClient, companyId: string | null | undefined) {
  invalidaStatisticheFatturazione(queryClient, companyId);
  queryClient.invalidateQueries({ queryKey: ["incassi-fattura"] });
  queryClient.invalidateQueries({ queryKey: ["movimenti-cassa"] });
  queryClient.invalidateQueries({ queryKey: queryKeys.documentiFiscali.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.primaNota.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.scadenzario.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
  queryClient.invalidateQueries({ queryKey: ["cashflow"] });
  queryClient.invalidateQueries({ queryKey: ["ritenute-bonifici"] });
}

export function useIncassiFattura(documentoId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: chiaveIncassi(documentoId),
    enabled: Boolean(documentoId) && enabled,
    queryFn: async (): Promise<IncassoFattura[]> => {
      const { data, error } = await rpc("incassi_fattura", { p_documento_id: documentoId });
      if (error) throw new Error(error.message || "Incassi non disponibili");
      return ((data as IncassoFattura[] | null) ?? []).map((i) => ({
        ...i,
        importo: Number(i.importo),
        bonifico_importo: i.bonifico_importo == null ? null : Number(i.bonifico_importo),
      }));
    },
  });
}

export function useMovimentiBancaPerFattura(documentoId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: chiaveBanca(documentoId),
    enabled: Boolean(documentoId) && enabled,
    queryFn: async (): Promise<{ bancaCollegata: boolean; movimenti: MovimentoBanca[] }> => {
      const { data, error } = await rpc("movimenti_banca_per_fattura", { p_documento_id: documentoId });
      if (error) throw new Error(error.message || "Movimenti della banca non disponibili");
      const r = (data ?? {}) as { banca_collegata?: boolean; movimenti?: MovimentoBanca[] };
      return {
        bancaCollegata: Boolean(r.banca_collegata),
        movimenti: (r.movimenti ?? []).map((m) => ({ ...m, importo: Number(m.importo) })),
      };
    },
  });
}

/** Annulla un incasso: storna_incasso_atomico. Se veniva da un bonifico, il bonifico torna da abbinare. */
export function useAnnullaIncasso() {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (movimentoId: string) => {
      if (!companyId) throw new Error("Nessuna azienda selezionata");
      const { error } = await rpc("storna_incasso_atomico", {
        p_company_id: companyId,
        p_movimento_id: movimentoId,
      });
      if (error) throw new Error(error.message || "Incasso non annullato");
    },
    onSuccess: () => {
      aggiornaDopoIncasso(queryClient, companyId);
      toast.success("Incasso annullato");
    },
    onError: (err: Error) => toast.error("Incasso non annullato", { description: err.message }),
  });
}

/**
 * Abbina un accredito della banca alla fattura. Con `movimentoId` il bonifico
 * diventa la prova di un incasso già registrato (nessun denaro nuovo);
 * senza, registra l'incasso dal bonifico.
 */
export function useAbbinaBonifico() {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { transactionId: string; documentoId: string; movimentoId?: string | null; punteggio?: number | null }) => {
      const { error } = await rpc("riconcilia_bonifico_fattura", {
        p_transaction_id: input.transactionId,
        p_documento_id: input.documentoId,
        p_match_type: "manual",
        p_match_score: input.punteggio ?? null,
        p_movimento_id: input.movimentoId ?? null,
      });
      if (error) throw new Error(error.message || "Abbinamento non riuscito");
    },
    onSuccess: (_d, input) => {
      aggiornaDopoIncasso(queryClient, companyId);
      toast.success(input.movimentoId ? "Bonifico abbinato all'incasso" : "Bonifico abbinato: incasso registrato");
    },
    onError: (err: Error) => toast.error("Abbinamento non riuscito", { description: err.message }),
  });
}
