// src/routes/company/CommessaClienteGuard.tsx
// «Commessa cliente» spenta in Impostazioni → Commesse generali: la pagina di
// creazione non si apre più, nemmeno dai collegamenti sparsi (scheda cliente,
// azioni rapide della dashboard, un vecchio link, l'indirizzo scritto a mano).
//
// Eccezione: `?generale=…` è la nuova unità / ordine di lavoro DENTRO una
// commessa generale, che non è una commessa cliente e resta come prima.
import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useImpostazioniCommesseGenerali } from "@/hooks/useCommesseGenerali";

export function CommessaClienteGuard({ children, fallback }: { children: ReactNode; fallback: string }) {
  const location = useLocation();
  const { commessaCliente, isLoading } = useImpostazioniCommesseGenerali();
  const dentroUnaGenerale = !!new URLSearchParams(location.search).get("generale");
  // Mentre l'impostazione si carica la pagina resta aperta: chi ha la commessa
  // cliente accesa — quasi tutti — non deve vedere una schermata vuota.
  if (!isLoading && !commessaCliente && !dentroUnaGenerale) {
    return <Navigate to={fallback} replace />;
  }
  return <>{children}</>;
}
