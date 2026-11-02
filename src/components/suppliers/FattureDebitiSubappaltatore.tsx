/**
 * «Fatture e pagamenti» del subappaltatore: la stessa vista del fornitore, dal fornitore collegato
 * (supplier_relations) e dalla P.IVA, così fatture, rate ed estratto conto sono gli stessi nelle due schede.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Skeleton } from "@/components/ui/skeleton";
import { FattureDebitiFornitore } from "./FattureDebitiFornitore";

export function FattureDebitiSubappaltatore({ subId, partitaIva }: { subId: string; partitaIva: string | null }) {
  const companyId = useEffectiveCompanyId();
  const q = useQuery({
    queryKey: ["supplier-subcontractor-link", companyId, subId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_relations" as never)
        .select("supplier_id")
        .eq("company_id", companyId!)
        .eq("subappaltatore_id", subId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as { supplier_id: string } | null;
    },
  });
  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!q.data?.supplier_id && !partitaIva)
    return (
      <p className="rounded-lg border p-4 text-sm text-muted-foreground">
        Per vedere fatture e pagamenti scrivi la P.IVA dell’impresa in anagrafica o collegala al suo fornitore.
      </p>
    );
  return <FattureDebitiFornitore supplierId={q.data?.supplier_id ?? null} partitaIva={partitaIva} />;
}
