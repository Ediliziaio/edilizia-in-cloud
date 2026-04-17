/**
 * Banner persistente che indica quando il SuperAdmin è in modalità "Visualizza Come".
 * Appare tra ImpersonationBanner e l'header di CompanyLayout.
 * Colore ambra per distinguersi dall'ImpersonationBanner (arancione/rosso).
 *
 * v2: mostra il NOME REALE dell'utente simulato (recuperato da `profiles`) al
 *     posto del solo label del ruolo, così il super_admin sa sempre "con chi"
 *     sta navigando.
 */
import { Eye, UserX } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/types/auth";

const ROLE_LABELS: Partial<Record<AppRole, string>> = {
  company_admin: "Company Admin",
  company_staff: "Staff",
  call_center:   "Call Center",
  salesperson:   "Venditore",
  employee:      "Operaio",
  subcontractor: "Subappaltatore",
  customer:      "Cliente",
};

export function ViewAsBanner() {
  const { viewAsRole, viewAsUserId, setViewAsRole } = useAuth();

  // Fetch profile dell'utente simulato per mostrarne il nome reale.
  const { data: viewAsUser } = useQuery({
    queryKey: ["view-as-user-profile", viewAsUserId],
    queryFn: async () => {
      if (!viewAsUserId) return null;
      const { data } = await supabase
        .from("profiles")
        .select("first_name, last_name, email")
        .eq("id", viewAsUserId)
        .maybeSingle();
      return data;
    },
    enabled: !!viewAsUserId,
    staleTime: 5 * 60 * 1000,
  });

  if (!viewAsRole) return null;

  const fullName = viewAsUser
    ? [viewAsUser.first_name, viewAsUser.last_name].filter(Boolean).join(" ") || viewAsUser.email
    : null;
  const roleLabel = ROLE_LABELS[viewAsRole] ?? viewAsRole;

  return (
    <div className="bg-amber-100 border-b border-amber-300 px-3 py-2 flex items-center justify-between gap-2 z-40">
      <div className="flex items-center gap-2 min-w-0">
        <Eye className="h-4 w-4 text-amber-700 shrink-0" />
        <span className="text-sm font-medium text-amber-900 truncate">
          Sei loggato come:{" "}
          {fullName ? (
            <>
              <strong>{fullName}</strong>
              <span className="text-amber-800 font-normal"> · {roleLabel}</span>
            </>
          ) : (
            <strong>{roleLabel}</strong>
          )}
        </span>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="text-amber-800 hover:text-amber-900 hover:bg-amber-200 h-7 text-xs gap-1 shrink-0"
        onClick={() => setViewAsRole(null)}
      >
        <UserX className="h-3.5 w-3.5" />
        Torna come super admin
      </Button>
    </div>
  );
}
