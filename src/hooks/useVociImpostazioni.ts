/**
 * Le impostazioni che l'utente può cercare: la stessa lista per il ⌘K delle impostazioni, la palette dell'app,
 * il campo del menu a sinistra e l'elenco dell'hub da telefono. Cosa c'è dentro lo decidono il piano
 * dell'azienda, i permessi, il telefono e il modo di fatturare (vedi indiceImpostazioni.ts).
 */
import { useMemo } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useStatoPiano } from "@/hooks/useStatoPiano";
import { useIsMobile } from "@/hooks/use-mobile";
import { useBillingMode } from "@/contexts/BillingModeContext";
import { vociRicercabili, type VoceRicercabile } from "@/lib/impostazioni/indiceImpostazioni";

const VUOTO: VoceRicercabile[] = [];

export function useVociImpostazioni(attivo = true): {
  /** Quello che si può cercare da questo schermo. */
  voci: VoceRicercabile[];
  /** Quello che si può cercare da computer: da telefono serve a dire «questa si cambia dal computer». */
  vociDaComputer: VoceRicercabile[];
  isMobile: boolean;
} {
  const permissions = usePermissions();
  const { stato: piano } = useStatoPiano();
  const isMobile = useIsMobile();
  // Dove il provider non c'è (le prove) si fa come se la fatturazione non fosse nativa.
  const fatturazioneNativa = useBillingMode({ facoltativo: true })?.isNative ?? false;
  // `attivo` = la ricerca è aperta o ha del testo: finché serve a niente, l'elenco non si costruisce (la palette
  // dell'app e il ⌘K stanno montati in ogni pagina, chiusi).
  const voci = useMemo(
    () => (attivo ? vociRicercabili(permissions, piano, isMobile, { fatturazioneNativa }) : VUOTO),
    [attivo, permissions, piano, isMobile, fatturazioneNativa],
  );
  const vociDaComputer = useMemo(
    () => (!attivo ? VUOTO : isMobile ? vociRicercabili(permissions, piano, false, { fatturazioneNativa }) : voci),
    [attivo, permissions, piano, isMobile, fatturazioneNativa, voci],
  );
  return { voci, vociDaComputer, isMobile };
}
