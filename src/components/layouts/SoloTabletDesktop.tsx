/**
 * Pagine «solo tablet e computer»: da telefono non si aprono. Chi ci arriva
 * comunque (link da un'altra pagina, indirizzo digitato, ritorno da un
 * consenso) torna alle Impostazioni con un avviso.
 *
 * Telefono = sotto i 768px (useIsMobile, che parte già col valore giusto: niente
 * lampeggio della pagina prima del rimando), come le schede solo desktop di
 * «Il mio profilo» e la dashboard Gestione. Voci di menu, ricerca e Cmd+K le
 * nascondono a parte con il flag `desktopOnly`.
 */
import { useEffect, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

export function SoloTabletDesktop({
  children,
  avviso,
  torna = "/azienda/impostazioni",
}: {
  children: ReactNode;
  /** Il perché, in una riga: compare come avviso al rimando. */
  avviso: string;
  /** Dove rimandare da telefono. */
  torna?: string;
}) {
  const isMobile = useIsMobile();

  useEffect(() => {
    // id fisso: niente avvisi doppi (StrictMode in sviluppo, rimandi ripetuti).
    if (isMobile) toast.info(avviso, { id: "solo-tablet-desktop" });
  }, [isMobile, avviso]);

  if (isMobile) return <Navigate to={torna} replace />;
  return <>{children}</>;
}
