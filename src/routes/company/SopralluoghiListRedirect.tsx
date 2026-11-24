import { Suspense } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";

const SopralluoghiList = lazy(() => import("@/pages/azienda/sopralluoghi/SopralluoghiList"));

/**
 * Chi vede le Commesse trova la bacheca nella sua scheda; chi non le vede (il commerciale con
 * il solo permesso Sopralluoghi, dalla voce delle Vendite) la apre da sola. Lotto 3 del piano
 * sopralluoghi: prima chi non vedeva le Commesse finiva su una pagina negata.
 */
export function SopralluoghiListRedirect() {
  const location = useLocation();
  const { canViewOrders } = usePermissions();
  if (!canViewOrders) {
    return (
      <Suspense fallback={<p role="status" className="p-4 text-sm text-muted-foreground">Carico i sopralluoghi…</p>}>
        <SopralluoghiList />
      </Suspense>
    );
  }
  const params = new URLSearchParams(location.search);
  params.set("tab", "sopralluoghi");
  return <Navigate to={`/azienda/ordini?${params.toString()}`} replace />;
}
