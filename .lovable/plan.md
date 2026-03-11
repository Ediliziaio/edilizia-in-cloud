

# Rinominare "Funnel" in "Pipeline" + Selettore Pipeline integrato

## Cosa cambia

### 1. `DashboardFunnel.tsx` — Rinominare label
- Cambiare tutti i riferimenti testuali da "Funnel Pipeline" / "Funnel" a "Pipeline" nel titolo della Card e nello stato di loading.

### 2. `TabPanoramica.tsx` — Rinominare CardTitle
- Riga 109: `"Funnel"` → `"Pipeline"`

### 3. `TabPipeline.tsx` — Aggiungere selettore pipeline integrato
- Importare il selettore pipeline e i dati necessari.
- Aggiungere props `filters` e `onUpdateFilters` (passati dal parent `MarketingDashboard.tsx`).
- In cima alla tab, aggiungere una riga con un `Select` per scegliere la pipeline (fetch da `marketing_pipelines`), oppure riutilizzare il filtro già presente in `DashboardFilters`.
- Approccio più semplice: passare `filters` e `onUpdateFilters` a `TabPipeline`, che mostra un selettore pipeline locale in cima. Quando l'utente cambia pipeline, chiama `onUpdateFilters({ pipelineId: ... })` che triggera il refetch della dashboard con i dati filtrati per quella pipeline.

### 4. `MarketingDashboard.tsx` — Passare filters/updateFilters a TabPipeline
- Aggiornare la prop di `TabPipeline` per includere `filters` e `updateFilters`.

### 5. `MarketingControl.tsx` (cruscotto) — Rinominare eventuale label "Funnel"

### File da modificare
- `src/components/marketing/dashboard/DashboardFunnel.tsx` — label rename
- `src/components/marketing/dashboard/tabs/TabPanoramica.tsx` — label rename
- `src/components/marketing/dashboard/tabs/TabPipeline.tsx` — aggiungere pipeline selector + label rename
- `src/pages/azienda/marketing/MarketingDashboard.tsx` — passare props extra a TabPipeline
- `src/components/cruscotto/MarketingControl.tsx` — label rename (se presente)

