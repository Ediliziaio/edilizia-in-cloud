import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

/** Link inverso: nessuna duplicazione di anagrafica o documenti. */
export function SubcontractorSupplierLink({
  subcontractorId,
}: {
  subcontractorId: string;
}) {
  const permissions = usePermissions(),
    companyId = useEffectiveCompanyId();
  const allowed = !!(
    permissions.isAdmin ||
    permissions.canViewSettingsSuppliers ||
    permissions.canEditSettingsSuppliers
  );
  const query = useQuery({
    queryKey: ["supplier-subcontractor-link", companyId, subcontractorId],
    enabled: allowed && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_relations" as never)
        .select("supplier_id")
        .eq("company_id", companyId!)
        .eq("subappaltatore_id", subcontractorId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as { supplier_id: string } | null;
    },
    staleTime: 60_000,
  });
  if (!allowed) return null;
  if (query.isError)
    return (
      <p className="text-xs text-amber-700">
        Collegamento fornitore non verificabile al momento.
      </p>
    );
  if (!query.data) return null;
  return (
    <Button asChild size="sm" variant="outline">
      <Link
        to={`/azienda/impostazioni/fornitori?tab=operativo&fornitore=${query.data.supplier_id}`}
      >
        Apri anagrafica fornitore e contratti generali
      </Link>
    </Button>
  );
}
