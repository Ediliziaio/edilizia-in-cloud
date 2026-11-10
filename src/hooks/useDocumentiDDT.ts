import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  documentiDb,
  type DocumentoPersistente,
} from "@/lib/ddt/documentiPersistenti";

export function useDocumentiDDT(soloMiei = false, orderId?: string) {
  const { effectiveCompany, profile, user } = useAuth();
  const companyId = soloMiei ? profile?.company_id : effectiveCompany?.id;
  return useQuery<DocumentoPersistente[]>({
    queryKey: ["ddt-documenti", companyId, user?.id, soloMiei, orderId],
    enabled: !!companyId && !!user?.id,
    queryFn: async () => {
      let q = documentiDb
        .from("ddt_document_jobs")
        .select("*")
        .eq("company_id", companyId);
      if (soloMiei) q = q.eq("created_by", user!.id);
      if (orderId) q = q.eq("order_id", orderId);
      const { data, error } = await q
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: (q) =>
      q.state.data?.some((j) => ["queued", "processing"].includes(j.status))
        ? 4000
        : 20000,
    refetchIntervalInBackground: false,
  });
}

export const STATO_DOCUMENTO: Record<DocumentoPersistente["status"], string> = {
  split: "PDF diviso in bolle",
  queued: "In attesa di lettura",
  processing: "Lettura in corso",
  review: "Da controllare in ufficio",
  registered: "DDT registrato",
  error: "Lettura da riprovare",
};
