

# Anno come primo preset e default nella Dashboard

## Modifiche

### 1. `src/components/dashboard/CompanyDashboardFilters.tsx` (riga 27-34)
Spostare `"year"` come primo elemento dell'array `DATE_PRESETS`.

### 2. `src/hooks/useCompanyDashboardData.ts` (righe 115-118)
Cambiare il default dello stato da `"month"` a `"year"` e inizializzare `dateFrom` con `startOfYear(new Date())`.

