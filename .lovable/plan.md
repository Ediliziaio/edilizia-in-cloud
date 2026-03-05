

# Miglioramento filtri data nella Dashboard

## Modifiche

### 1. `src/components/dashboard/CompanyDashboardFilters.tsx`
- Aggiungere preset **"Anno"** (`year`) tra "Mese" e "Personalizzato"
- Quando si clicca **"Personalizzato"**, aprire automaticamente il Popover del calendario (usare stato `customOpen` controllato)
- Il Popover si apre subito al click sul preset, senza bisogno di cliccare un secondo bottone

### 2. `src/components/dashboard/CompanyDashboardFilters.tsx` — tipo `DatePreset`
- Aggiungere `"year"` al tipo: `export type DatePreset = "today" | "yesterday" | "last7" | "last30" | "month" | "year" | "custom";`

### 3. `src/hooks/useCompanyDashboardData.ts`
- Aggiungere caso `"year"` nella funzione `getDateRange`:
  ```ts
  case "year":
    return { from: startOfYear(now), to: endOfDay(now) };
  ```
- Importare `startOfYear` da `date-fns`

### Comportamento "Personalizzato"
- Il bottone "Personalizzato" diventa il trigger del Popover stesso: al click imposta `datePreset: "custom"` e apre il calendario range inline
- Nessun bottone separato per aprire il calendario — click diretto sul preset

