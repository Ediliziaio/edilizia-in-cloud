/**
 * Cartelle dei documenti di commessa dell'azienda (order_document_folders).
 * Si gestiscono da Impostazioni → Cantieri & Costi → Cartelle documenti.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { userErrorMessage } from "@/lib/userErrorMessage";
import type { CartellaDocumenti } from "@/lib/commesse/documentiCommessa";
import { loadCatalogPages } from "@/lib/listino/loadCatalogPages";

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
      return loadCatalogPages<CartellaDocumenti>((from, to) => tabella()
        .select("id, company_id, nome, posizione, visibile_cliente, obbligatoria, archiviata_at")
        .eq("company_id" as never, companyId as never)
        .order("posizione" as never)
        .order("nome" as never)
        .order("id" as never)
        .range(from, to) as unknown as PromiseLike<{ data: CartellaDocumenti[] | null; error: { message: string } | null }>);
    },
  });
  const tutte = query.data ?? [];
  return {
    cartelle: opzioni.tutte ? tutte : tutte.filter((c) => !c.archiviata_at),
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    error: query.error,
  };
}

/** Allegati caricati nelle commesse dell'azienda: non include i documenti del cliente collegati senza copia. */
export function useDocumentiPerCartella(ids: string[]) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["cartelle-documenti-uso", companyId, [...ids].sort()],
    enabled: !!companyId && ids.length > 0,
    queryFn: async (): Promise<Record<string, number>> => {
      const risultati = await Promise.all(ids.map(async (id) => {
        const { count, error } = await supabase.from("order_attachments")
          .select("id, orders!inner(company_id)", { count: "exact", head: true })
          .eq("orders.company_id", companyId!)
          .eq("folder_id" as never, id as never);
        if (error) throw error;
        if (count == null) throw new Error("Conteggio non disponibile");
        return [id, count] as const;
      }));
      return Object.fromEntries(risultati);
    },
  });
}

function messaggioErrore(e: { code?: string; message?: string } | null, nome?: string): Error {
  if (e?.code === "23505") return new Error(`Esiste già una cartella «${nome ?? ""}»`);
  if (e?.code === "42501") return new Error("Non hai il permesso di modificare le cartelle");
  // Mai il testo del database: rete, sessione scaduta e il resto passano dal traduttore di errori.
  return new Error(userErrorMessage(e, "Operazione non riuscita. Riprova tra poco."));
}

export function useSalvaCartella() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: Partial<CartellaDocumenti> & { nome?: string }) => {
      if (!companyId) throw new Error("Contesto azienda mancante");
      const nome = c.nome?.trim().replace(/\s+/g, " ");
      if (c.nome !== undefined && !nome) throw new Error("Scrivi il nome della cartella");
      if (nome && nome.length > 80) throw new Error("Il nome della cartella può avere al massimo 80 caratteri");
      if (c.id) {
        const patch: Record<string, unknown> = {};
        for (const k of ["posizione", "visibile_cliente", "obbligatoria", "archiviata_at"] as const) {
          if (c[k] !== undefined) patch[k] = c[k];
        }
        if (nome) patch.nome = nome;
        const { error } = await tabella().update(patch as never).eq("id" as never, c.id as never).eq("company_id" as never, companyId as never).select("id").single();
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
      } as never).select("id").single();
      if (error) throw messaggioErrore(error, nome);
    },
    onSettled: () => Promise.all([
      qc.invalidateQueries({ queryKey: chiave(companyId) }),
      qc.invalidateQueries({ queryKey: ["cartelle-documenti-uso", companyId] }),
    ]),
  });
}

/** Riscrive le posizioni nell'ordine dato. */
export function useRiordinaCartelle() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!companyId) throw new Error("Contesto azienda mancante");
      if (new Set(ids).size !== ids.length) throw new Error("Ogni cartella deve comparire una sola volta");
      const risultati = await Promise.all(
        ids.map((id, i) => tabella().update({ posizione: i + 1 } as never).eq("id" as never, id as never).eq("company_id" as never, companyId as never).select("id").single()),
      );
      const errore = risultati.find((r) => r.error)?.error;
      if (errore) throw messaggioErrore(errore);
    },
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: chiave(companyId) });
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
