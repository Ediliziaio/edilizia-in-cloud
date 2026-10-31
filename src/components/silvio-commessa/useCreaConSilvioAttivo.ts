import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { DEMO_COMPANY_2_ID } from "@/lib/constants/demoCompany";

/** La chiave dell'interruttore per azienda (migrazione 20281106110000). */
export const FEATURE_CREA_CON_SILVIO = "silvio_crea_commessa";

/**
 * «Crea con Silvio» è acceso per questa azienda? Spento per tutti tranne Demo Azienda 2,
 * finché un override non lo accende (docs/piano-silvio-commessa-ai.md, sezione 6).
 *
 * `useFeatureAccess` apre tutto alle demo e al super admin (`source: "bypass"`): qui non
 * basta, l'interruttore deve essere vero nel database. Demo 2 è accesa anche prima che
 * la migrazione sia applicata.
 */
export function useCreaConSilvioAttivo(companyId: string | null | undefined): boolean {
  const accesso = useFeatureAccess(FEATURE_CREA_CON_SILVIO, companyId ?? undefined);
  if (companyId === DEMO_COMPANY_2_ID) return true;
  return accesso.isEnabled && accesso.source !== "bypass" && !accesso.isPreview;
}
