/**
 * Banner persistente che indica quando il SuperAdmin è in modalità "Visualizza Come".
 * Appare tra ImpersonationBanner e l'header di CompanyLayout.
 * Colore ambra per distinguersi dall'ImpersonationBanner (arancione/rosso).
 */
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import type { AppRole } from "@/types/auth";

const ROLE_LABELS: Partial<Record<AppRole, string>> = {
  company_admin: "Company Admin",
  company_staff: "Membro Staff",
  employee: "Dipendente",
  subcontractor: "Subappaltatore",
  customer: "Cliente",
};

export function ViewAsBanner() {
  const { viewAsRole, setViewAsRole } = useAuth();

  if (!viewAsRole) return null;

  return (
    <div className="bg-amber-100 border-b border-amber-300 px-3 py-2 flex items-center justify-between gap-2 z-40">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 text-amber-700 shrink-0" />
        <span className="text-sm font-medium text-amber-900">
          Modalità preview — Stai vedendo come:{" "}
          <strong>{ROLE_LABELS[viewAsRole] ?? viewAsRole}</strong>
        </span>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="text-amber-800 hover:text-amber-900 hover:bg-amber-200 h-7 text-xs"
        onClick={() => setViewAsRole(null)}
      >
        Esci dalla preview
      </Button>
    </div>
  );
}
