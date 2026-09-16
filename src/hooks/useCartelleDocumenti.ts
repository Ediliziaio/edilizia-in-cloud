/**
 * Cartelle dei documenti di commessa dell'azienda (order_document_folders).
 * Si gestiscono da Impostazioni → Cantieri & Costi → Cartelle documenti.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type { CartellaDocumenti } from "@/lib/commesse/documentiCommessa";

// La tabella è nuova e non ancora nei tipi generati.
const tabella = () => supabase.from("order_document_folders" as never);

const chiave = (companyId: string | null | undefined) => ["cartelle-documenti", companyId];

/** Cartelle attive (non archiviate) in ordine; `tutte` include le archiviate. */
export function useCartelleDocumenti(opzioni: { tutte?: boolean } = {}) {
  const companyId = useEffectiveCompanyId();
  const query = useQuery({
    queryKey: chiave(companyId),
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<CartellaDocumenti[]> => {
      const { data, error } = await tabella()
        .select("id, company_id, nome, posizione, visibile_cliente, obbligatoria, archiviata_at")
        .eq("company_id" as never, companyId as never)
        .order("posizione" as never)
        .order("nome" as never);
      if (error) throw error;
      return (data ?? []) as unknown as CartellaDocumenti[];
    },
  });
  const tutte = query.data ?? [];
  return {
    cartelle: opzioni.tutte ? tutte : tutte.filter((c) => !c.archiviata_at),
    isLoading: query.isLoading,
    error: query.error,
  };
}

function messaggioErrore(e: { code?: string; message?: string } | null, nome?: string): Error {
  if (e?.code === "23505") return new Error(`Esiste già una cartella «${nome ?? ""}»`);
  if (e?.code === "42501") return new Error("Non hai il permesso di modificare le cartelle");
  return new Error(e?.message ?? "Operazione non riuscita");
}

export function useSalvaCartella() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: Partial<CartellaDocumenti> & { nome?: string }) => {
      if (!companyId) throw new Error("Contesto azienda mancante");
      const nome = c.nome?.trim().replace(/\s+/g, " ");
      if (c.nome !== undefined && !nome) throw new Error("Scrivi il nome della cartella");
      if (c.id) {
        const patch: Record<string, unknown> = {};
        for (const k of ["posizione", "visibile_cliente", "obbligatoria", "archiviata_at"] as const) {
          if (c[k] !== undefined) patch[k] = c[k];
        }
        if (nome) patch.nome = nome;
        const { error } = await tabella().update(patch as never).eq("id" as never, c.id as never);
        if (error) throw messaggioErrore(error, nome);
        return;
      }
      const esistenti = qc.getQueryData<CartellaDocumenti[]>(chiave(companyId)) ?? [];
      const posizione = esistenti.reduce((m, x) => Math.max(m, x.posizione), 0) + 1;
      const { error } = await tabella().insert({
        company_id: companyId,
        nome,
        posizione,
        visibile_cliente: c.visibile_cliente ?? false,
        obbligatoria: c.obbligatoria ?? false,
      } as never);
      if (error) throw messaggioErrore(error, nome);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: chiave(companyId) }),
  });
}

/** Riscrive le posizioni nell'ordine dato. */
export function useRiordinaCartelle() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const risultati = await Promise.all(
        ids.map((id, i) => tabella().update({ posizione: i + 1 } as never).eq("id" as never, id as never)),
      );
      const errore = risultati.find((r) => r.error)?.error;
      if (errore) throw messaggioErrore(errore);
    },
    onMutate: async (ids) => {
      const prima = qc.getQueryData<CartellaDocumenti[]>(chiave(companyId));
      if (prima) {
        const pos = new Map(ids.map((id, i) => [id, i + 1]));
        qc.setQueryData(
          chiave(companyId),
          [...prima].map((c) => ({ ...c, posizione: pos.get(c.id) ?? c.posizione })).sort((a, b) => a.posizione - b.posizione),
        );
      }
      return { prima };
    },
    onError: (_e, _ids, ctx) => {
      if (ctx?.prima) qc.setQueryData(chiave(companyId), ctx.prima);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: chiave(companyId) }),
  });
}
