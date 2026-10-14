import { Navigate, useLocation } from "react-router-dom";

/** Compatibilità con notifiche, preferiti e ritorni Stripe: una sola pagina. */
export default function SettingsCreditsRedirect() {
  const { search, hash } = useLocation();
  const params = new URLSearchParams(search);
  params.set("tab", "portafoglio");
  return <Navigate to={`/azienda/impostazioni/abbonamento?${params}${hash}`} replace />;
}
