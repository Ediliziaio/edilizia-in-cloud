/**
 * Hook fire-and-forget per loggare accessi commercialista a moduli/risorse
 * dell'azienda cliente. Insert su public.accountant_audit_log.
 *
 * Best-effort: errori silenziati (non rompere l'UX se il log fallisce).
 *
 * Uso tipico in CompanyLayout quando isCommercialistaMode=1:
 *   useAuditAccountantPageView(commercialistaCompanyId, location.pathname);
 *
 * Per operazioni write (es. create prima nota) usa logAccountantAction()
 * direttamente al success della mutation.
 */

import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type AuditActionPayload = {
  companyId: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
};

export async function logAccountantAction(payload: AuditActionPayload) {
  try {
    const { error } = await supabase.from("accountant_audit_log").insert({
      company_id: payload.companyId,
      action: payload.action,
      resource_type: payload.resourceType ?? null,
      resource_id: payload.resourceId ?? null,
      metadata: payload.metadata ?? {},
    });
    if (error) {
      // RLS può rifiutare se il commercialista non ha accesso → silenzioso
      console.debug("[audit] insert refused", error.code);
    }
  } catch {
    // Network / abort: silenzioso, non vogliamo rompere l'app
  }
}

/**
 * Auto-log della page view del commercialista. Triggera ogni volta che
 * cambia il path. Throttle implicito: useEffect deps su pathname.
 */
export function useAuditAccountantPageView(
  companyId: string | null | undefined,
  pathname: string,
) {
  const { user } = useAuth();
  useEffect(() => {
    if (!user?.id || !companyId) return;
    // Derive action from pathname (es: '/azienda/cruscotto' → 'view_cruscotto')
    const action =
      "view_" + (pathname.replace(/^\/azienda\/?/, "").split("/")[0] || "home");
    void logAccountantAction({ companyId, action, metadata: { path: pathname } });
  }, [user?.id, companyId, pathname]);
}
