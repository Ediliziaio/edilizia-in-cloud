import { useAuth } from "@/contexts/AuthContext";

/**
 * Preventivatore Verticalizzato Serramentisti — FASE 1.2
 *
 * Espone il "vertical" dell'azienda corrente (plus eventuali vertical secondari
 * e lo stato di completamento dell'onboarding di scelta vertical).
 *
 * Fonte dati: `effectiveCompany` (tiene conto di impersonation + multi-company).
 * Default: se `vertical` non è settato (es. prima del run della migration o
 * bug di fetch) ritorna "generico" — non-breaking per UI che non conoscono
 * ancora il concetto.
 */

export type Vertical =
  | "serramentista"
  | "fotovoltaico"
  | "tetti"
  | "bagno"
  | "ristrutturazione"
  | "tende_da_sole"
  | "vetrate"
  | "caldaie"
  | "clima"
  | "generico";

export interface VerticalMeta {
  label: string;
  /** Icona lucide-react (nome componente, risolto nel consumer) */
  icon: string;
  /** false = card "Prossimamente" non cliccabile */
  enabled: boolean;
  description: string;
}

export const VERTICAL_META: Record<Vertical, VerticalMeta> = {
  serramentista: {
    label: "Serramenti e infissi",
    icon: "DoorOpen",
    enabled: true,
    description: "Finestre, porte finestre, scorrevoli, persiane, zanzariere",
  },
  fotovoltaico: {
    label: "Fotovoltaico e accumulo",
    icon: "Sun",
    enabled: true,
    description: "Impianti FV residenziali e commerciali, accumulo, colonnine",
  },
  tetti: {
    label: "Coperture e tetti",
    icon: "Home",
    enabled: false,
    description: "Manti, isolamenti, lattonerie, linee vita",
  },
  bagno: {
    label: "Bagno e ristrutturazioni bagno",
    icon: "Bath",
    enabled: false,
    description: "Sanitari, rivestimenti, pavimenti, impianti",
  },
  ristrutturazione: {
    label: "Ristrutturazione generica",
    icon: "Hammer",
    enabled: false,
    description: "Lavori misti di ristrutturazione civile",
  },
  tende_da_sole: {
    label: "Tende da sole e pergole",
    icon: "Umbrella",
    enabled: false,
    description: "Tende a braccio, cassonetti, pergole bioclimatiche",
  },
  vetrate: {
    label: "Vetrate e verande",
    icon: "Square",
    enabled: false,
    description: "Vetrate panoramiche, verande, serre",
  },
  caldaie: {
    label: "Caldaie e termoidraulica",
    icon: "Flame",
    enabled: false,
    description: "Caldaie, pompe di calore, radiatori",
  },
  clima: {
    label: "Climatizzazione",
    icon: "Snowflake",
    enabled: false,
    description: "Split, multisplit, VRF, ventilazione",
  },
  generico: {
    label: "Edilizia generica",
    icon: "Building",
    enabled: true,
    description: "Azienda edile multi-servizio senza specializzazione",
  },
};

/** Array ordinato dei vertical per griglia UI 3x3 (ordine stabile). */
export const VERTICAL_ORDER: Vertical[] = [
  "serramentista",
  "fotovoltaico",
  "tetti",
  "bagno",
  "ristrutturazione",
  "tende_da_sole",
  "vetrate",
  "caldaie",
  "clima",
  "generico",
];

/** Type guard: verifica se una stringa è un Vertical valido. */
export function isVertical(value: unknown): value is Vertical {
  return typeof value === "string" && VERTICAL_ORDER.includes(value as Vertical);
}

export interface UseVerticalResult {
  vertical: Vertical;
  verticalsSecondari: Vertical[];
  onboardingCompleted: boolean;
  meta: Record<Vertical, VerticalMeta>;
  /** Lista ordinata da renderizzare nella griglia (include enabled + coming soon). */
  order: Vertical[];
}

export function useVertical(): UseVerticalResult {
  const { effectiveCompany } = useAuth();

  // I campi `vertical`, `verticals_secondari`, `onboarding_vertical_completed`
  // sono aggiunti dalla migration FASE 1.1. Prima del rollout DB sono undefined:
  // il fallback a "generico" garantisce che UI esistenti non vedano "undefined".
  const rawVertical = (effectiveCompany as unknown as { vertical?: unknown } | null)?.vertical;
  const rawSecondari = (effectiveCompany as unknown as { verticals_secondari?: unknown } | null)?.verticals_secondari;
  const rawOnboardingDone = (effectiveCompany as unknown as { onboarding_vertical_completed?: unknown } | null)?.onboarding_vertical_completed;

  const vertical: Vertical = isVertical(rawVertical) ? rawVertical : "generico";
  const verticalsSecondari: Vertical[] = Array.isArray(rawSecondari)
    ? rawSecondari.filter(isVertical)
    : [];
  const onboardingCompleted = rawOnboardingDone === true;

  return {
    vertical,
    verticalsSecondari,
    onboardingCompleted,
    meta: VERTICAL_META,
    order: VERTICAL_ORDER,
  };
}
