import { useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  documentiDb,
  type DocumentoPersistente,
} from "@/lib/ddt/documentiPersistenti";

const PAGE_SIZE = 100;
interface Cursor {
  created_at: string;
  id: string;
}
interface Page {
  documenti: DocumentoPersistente[];
  successiva: Cursor | undefined;
}
// La risposta AI completa si legge solo aprendo il documento, non a ogni poll dell'elenco.
const CAMPI =
  "id,company_id,created_by,order_id,source,status,files,split_ids,last_error,ddt_id,created_at,updated_at";
export function useDocumentiDDT(
  soloMiei = false,
  orderId?: string,
  includiRegistrati = true,
  enabled = true,
) {
  const { effectiveCompany, profile, user } = useAuth();
  const companyId = soloMiei ? profile?.company_id : effectiveCompany?.id;
  const query = useInfiniteQuery({
    queryKey: [
      "ddt-documenti",
      companyId,
      user?.id,
      soloMiei,
      orderId,
      includiRegistrati,
    ],
    enabled: enabled && !!companyId && !!user?.id,
    initialPageParam: undefined as Cursor | undefined,
    queryFn: async ({ pageParam }): Promise<Page> => {
      let q = documentiDb
        .from("ddt_document_jobs")
        .select(CAMPI)
        .eq("company_id", companyId);
      if (soloMiei) q = q.eq("created_by", user!.id);
      if (orderId) q = q.eq("order_id", orderId);
      if (!includiRegistrati) q = q.not("status", "in", "(registered,split)");
      if (pageParam)
        q = q.or(
          `created_at.lt.${pageParam.created_at},and(created_at.eq.${pageParam.created_at},id.lt.${pageParam.id})`,
        );
      const { data, error } = await q
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(0, PAGE_SIZE);
      if (error) throw error;
      const righe = (data ?? []) as DocumentoPersistente[];
      const documenti = righe
        .slice(0, PAGE_SIZE)
        .map((j): DocumentoPersistente => ({ ...j, result: null }));
      const ultimo = documenti.at(-1);
      return {
        documenti,
        successiva:
          righe.length > PAGE_SIZE && ultimo
            ? { created_at: ultimo.created_at, id: ultimo.id }
            : undefined,
      };
    },
    getNextPageParam: (p) => p.successiva,
    refetchInterval: (q) =>
      q.state.data?.pages.some((p) =>
        p.documenti.some((j) => ["queued", "processing"].includes(j.status)),
      )
        ? 4000
        : 20000,
    refetchIntervalInBackground: false,
  });
  return {
    ...query,
    data: query.data
      ? Array.from(
          new Map(
            query.data.pages.flatMap((p) => p.documenti).map((j) => [j.id, j]),
          ).values(),
        )
      : undefined,
  };
}

export const STATO_DOCUMENTO: Record<DocumentoPersistente["status"], string> = {
  split: "PDF diviso in bolle",
  queued: "In attesa di lettura",
  processing: "Lettura in corso",
  review: "Da controllare in ufficio",
  registered: "DDT registrato",
  error: "Lettura da riprovare",
};
