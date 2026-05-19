/**
 * SettingsIndexRoute — v8.6.70
 *
 * Component renderizzato dalla route index di /azienda/impostazioni.
 * - Mobile: mostra <SettingsMobileHub /> (griglia di icone per scegliere sezione)
 * - Desktop/tablet: redirect automatico a /mio-profilo (come prima)
 *
 * Mantiene la rotta principale "viva" per il deep-link mobile della rotellina
 * senza forzare la pagina profilo a chi entra da desktop.
 */
import { Navigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import SettingsMobileHub from "./SettingsMobileHub";

export default function SettingsIndexRoute() {
  const isMobile = useIsMobile();
  if (isMobile) return <SettingsMobileHub />;
  return <Navigate to="mio-profilo" replace />;
}
