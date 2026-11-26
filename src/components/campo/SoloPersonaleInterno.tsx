/**
 * Pagine dell'area operai riservate al personale dell'azienda (26/11/2026, piano campo completo, fase 0.1).
 *
 * Il menu del subappaltatore non mostra presenze, ferie, spese, cedolini, buoni pasto, timbratura,
 * magazzino, merce, mezzi e squadra, ma le rotte non distinguevano i ruoli: chi scriveva a mano
 * «/campo/spese» ci entrava, e restavano a guardia solo le regole sulle righe del database. Qui il
 * subappaltatore torna alla Home. Le regole del database restano la difesa vera.
 */
import { Navigate, Outlet } from "react-router-dom";
import { useIsCampo } from "@/hooks/useIsCampo";

export function SoloPersonaleInterno() {
  const { isSubappaltatore } = useIsCampo();
  if (isSubappaltatore) return <Navigate to="/campo" replace />;
  return <Outlet />;
}
