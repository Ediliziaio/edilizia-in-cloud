import { Navigate, useParams } from "react-router-dom";

/**
 * /firma/:token — pagina di firma "digitata" precedente alla FEA.
 * Dal 06/09/2026 rimanda alla pagina ufficiale con consenso e codice OTP
 * (/firma-fea/:token), la stessa linkata nelle email. La vecchia pagina
 * aggiornava la richiesta dal browser senza OTP né hash del documento e
 * non è mai stata usata per una firma (0 righe con signed_by_ip = 'client').
 */
export default function SignaturePage() {
  const { token } = useParams<{ token: string }>();
  return <Navigate to={token ? `/firma-fea/${token}` : "/"} replace />;
}
