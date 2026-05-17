/**
 * FotovoltaicoWizard — helpers
 * Estratto da FotovoltaicoWizard.tsx (MP-MKT-001).
 *
 * NOTA FISCALE: la logica capienza IRPEF / ISEE è semplice validazione
 * client-side per UX. I calcoli reali di detrazione 50% / capienza fiscale
 * sono in edge function (fvCalcoli.ts). Non duplicare logica fiscale qui.
 */
import type { FvArchetipo } from "@/types/fotovoltaico";
import {
  ITALIA_LAT_MAX, ITALIA_LAT_MIN, ITALIA_LNG_MAX, ITALIA_LNG_MIN,
  LS_KEY_PREFIX, LS_KEY_NEW, DRAFT_TTL_MS,
} from "./constants";
import type { PersistedDraft } from "./types";

export function isCoordinataItalia(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null) return false;
  return (
    lat >= ITALIA_LAT_MIN &&
    lat <= ITALIA_LAT_MAX &&
    lng >= ITALIA_LNG_MIN &&
    lng <= ITALIA_LNG_MAX
  );
}

/**
 * Valida che ISEE sia coerente con il reddito annuo dichiarato.
 * Una ISEE molto più alta del reddito è statisticamente impossibile (ISEE
 * include patrimonio e composizione famiglia, ma raramente è > 3× reddito).
 */
export function validaIseeReddito(
  isee: number | null,
  reddito: number | null,
): string | null {
  if (isee == null || reddito == null) return null;
  if (reddito > 0 && isee > reddito * 3) {
    return "ISEE incoerente: dichiarato > 3× del reddito annuo. Verifica i dati prima di proseguire.";
  }
  return null;
}

/**
 * Verifica che il reddito sia compatibile con la richiesta di detrazione 50%.
 * Sotto 8.500 € (No Tax Area) la detrazione non è recuperabile in IRPEF.
 */
export function calcolaCapienzaWarning(
  archetipo: FvArchetipo,
  reddito: number | null,
): string | null {
  if (archetipo !== "privato_prima" && archetipo !== "privato_seconda") return null;
  if (reddito != null && reddito < 8500) {
    return "Reddito sotto la No Tax Area (8.500 €). La detrazione 50% IRPEF non sarà recuperabile in 10 anni — valuta cessione del credito o sconto in fattura con il commercialista.";
  }
  return null;
}

// ─── Persistenza locale draft ──────────────────────────────────────────────

export function loadPersistedDraft(progettoId: string | null): PersistedDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const key = progettoId ? `${LS_KEY_PREFIX}${progettoId}` : LS_KEY_NEW;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedDraft;
    if (Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function savePersistedDraft(
  progettoId: string | null,
  draft: Omit<PersistedDraft, "savedAt">,
): void {
  if (typeof window === "undefined") return;
  try {
    const key = progettoId ? `${LS_KEY_PREFIX}${progettoId}` : LS_KEY_NEW;
    window.localStorage.setItem(
      key,
      JSON.stringify({ ...draft, savedAt: Date.now() }),
    );
  } catch {
    /* localStorage piena/disabilitata: degrade silently */
  }
}

export function clearPersistedDraft(progettoId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const key = progettoId ? `${LS_KEY_PREFIX}${progettoId}` : LS_KEY_NEW;
    window.localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

// (WizardData importato dai chiamanti via "./types")
