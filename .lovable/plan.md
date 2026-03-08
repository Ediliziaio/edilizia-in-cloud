

## Piano

### 1. Rinominare "Fatturato YTD" → "Fatturato Anno Corrente"

**File: `src/pages/azienda/CompanyDashboard.tsx`** (riga ~278)
- Cambiare il testo `"Fatturato YTD"` in `"Fatturato Anno Corrente"`

**File: `src/components/forecast/CollectedTab.tsx`** (riga ~370)
- Cambiare `"Incassato Mensile — YTD"` in `"Incassato Mensile — Anno Corrente"`

### 2. Sostituire icona DollarSign con Euro nel CEO Strip

**File: `src/components/dashboard/DashboardCeoStrip.tsx`**
- Import: sostituire `DollarSign` con `Euro` da lucide-react (riga 4)
- Usare `Euro` come icona per la KPI "Fatturato Mese" (riga 67)

