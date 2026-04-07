import { useState, useCallback } from "react";

// ─── Interfacce e tipi ────────────────────────────────────

export interface CompanyFilters {
  regions: string[];
  sizes: Array<"micro" | "piccola" | "media" | "grande">;
  sectors: string[];
  plans: string[];
  statuses: string[];
  dateFrom: string | null;
  dateTo: string | null;
  trialExpiringDays: number | null; // 7, 14, 30 o null
}

// ─── Costanti ─────────────────────────────────────────────

export const EMPTY_FILTERS: CompanyFilters = {
  regions: [],
  sizes: [],
  sectors: [],
  plans: [],
  statuses: [],
  dateFrom: null,
  dateTo: null,
  trialExpiringDays: null,
};

export const REGIONI_ITALIANE = [
  "Abruzzo",
  "Basilicata",
  "Calabria",
  "Campania",
  "Emilia-Romagna",
  "Friuli-Venezia Giulia",
  "Lazio",
  "Liguria",
  "Lombardia",
  "Marche",
  "Molise",
  "Piemonte",
  "Puglia",
  "Sardegna",
  "Sicilia",
  "Toscana",
  "Trentino-Alto Adige",
  "Umbria",
  "Valle d'Aosta",
  "Veneto",
];

export const SETTORI_EDILIZIA = [
  "Edilizia residenziale",
  "Edilizia commerciale",
  "Edilizia industriale",
  "Ristrutturazioni",
  "Impiantistica",
  "Serramentistica",
  "Pavimentazioni",
  "Verde/Giardini",
  "Altro",
];

// ─── Utilità ──────────────────────────────────────────────

/** Conta il numero di filtri attivi */
export function countActiveFilters(f: CompanyFilters): number {
  return (
    f.regions.length +
    f.sizes.length +
    f.sectors.length +
    f.plans.length +
    f.statuses.length +
    (f.dateFrom ? 1 : 0) +
    (f.dateTo ? 1 : 0) +
    (f.trialExpiringDays ? 1 : 0)
  );
}

// ─── Hook principale ──────────────────────────────────────

/** Hook per gestire lo stato locale dei filtri di segmentazione */
export function useCompanyFilters(initialFilters: CompanyFilters = EMPTY_FILTERS) {
  const [filters, setFilters] = useState<CompanyFilters>(initialFilters);

  /** Aggiunge o rimuove un valore da un array di filtri */
  const toggleArrayValue = useCallback(<K extends keyof CompanyFilters>(
    key: K,
    value: string
  ) => {
    setFilters(prev => {
      const arr = prev[key] as string[];
      return {
        ...prev,
        [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value],
      };
    });
  }, []);

  /** Azzera tutti i filtri */
  const clearFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);

  /** Aggiorna un singolo filtro per chiave */
  const updateFilter = useCallback(<K extends keyof CompanyFilters>(
    key: K,
    value: CompanyFilters[K]
  ) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  return {
    filters,
    toggleArrayValue,
    clearFilters,
    updateFilter,
    activeCount: countActiveFilters(filters),
  };
}

// ─── Integrazione Supabase ────────────────────────────────

/** Costruisce la query Supabase aggiungendo i filtri di segmentazione */
export function applyFiltersToQuery(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: ReturnType<typeof Object.create>,
  filters: CompanyFilters
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): ReturnType<typeof Object.create> {
  if (filters.regions.length > 0) query = query.in("region", filters.regions);
  if (filters.sizes.length > 0) query = query.in("company_size", filters.sizes);
  if (filters.statuses.length > 0) query = query.in("status", filters.statuses);
  if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
  if (filters.dateTo) query = query.lte("created_at", filters.dateTo);
  if (filters.trialExpiringDays) {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + filters.trialExpiringDays);
    query = query
      .lte("trial_ends_at", deadline.toISOString())
      .eq("status", "trial");
  }
  return query;
}
