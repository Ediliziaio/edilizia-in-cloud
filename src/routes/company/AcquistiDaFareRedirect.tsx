import { Navigate, useLocation } from "react-router-dom";

/**
 * /azienda/acquisti-da-fare → la pipeline acquisti dentro Commesse (23/10/2026).
 * Le notifiche «Materiali validati da acquistare» già inviate puntano qui con
 * ?commessa=<id>: il filtro passa alla pipeline.
 */
export function AcquistiDaFareRedirect() {
  const location = useLocation();
  const prima = new URLSearchParams(location.search);
  const dopo = new URLSearchParams({ tab: "acquisto", vista: "pipeline" });
  const commessa = prima.get("commessa");
  if (commessa) dopo.set("commessa", commessa);
  return <Navigate to={`/azienda/ordini?${dopo.toString()}`} replace />;
}
