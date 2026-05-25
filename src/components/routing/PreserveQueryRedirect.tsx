/**
 * PreserveQueryRedirect — `<Navigate>` perde la query string del path corrente.
 *
 * Caso d'uso: vecchio link `/admin/ai-operate?tab=approvals` deve redirigere
 * a `/admin/ai?section=operate&tab=approvals` senza perdere `tab=approvals`.
 *
 * Funzionamento:
 *   - `to` = nuovo path (es. "/admin/ai")
 *   - `addParams` (opzionale) = querystring extra da iniettare (es. `section=operate`)
 *   - I param della URL corrente vengono PRESERVATI e mergeati con `addParams`
 *     (i nuovi sovrascrivono se collidono)
 */
import { Navigate, useLocation } from "react-router-dom";

interface PreserveQueryRedirectProps {
  to: string;
  /** Querystring aggiuntiva da iniettare (es. "section=operate"). */
  addParams?: string;
  replace?: boolean;
}

export function PreserveQueryRedirect({
  to,
  addParams,
  replace = true,
}: PreserveQueryRedirectProps) {
  const location = useLocation();
  const existing = new URLSearchParams(location.search);
  if (addParams) {
    const extra = new URLSearchParams(addParams);
    extra.forEach((value, key) => {
      existing.set(key, value);
    });
  }
  const qs = existing.toString();
  const target = qs ? `${to}?${qs}` : to;
  return <Navigate to={target} replace={replace} />;
}
