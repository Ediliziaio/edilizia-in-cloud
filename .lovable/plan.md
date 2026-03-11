

# SO4 — Sostituzione SalesOSDashboard.tsx

## Analisi

Il file `src/pages/azienda/marketing/SalesOSDashboard.tsx` esiste già (388 righe) e la route `marketing/sales-os` è già configurata in `companyRoutes.tsx` puntando a questo file. Non serve creare un nuovo file in `src/pages/marketing/` né aggiungere route.

**Problema critico**: il contenuto JSX nel prompt è stato strippato dal rendering HTML del messaggio — tutti i tag JSX (`<div>`, `<Card>`, etc.) sono stati rimossi, lasciando solo il testo e i commenti. Non è possibile copiare il contenuto "ESATTAMENTE" perché il JSX non è arrivato integro.

## Differenze riconoscibili tra versione attuale e SO4

Dalla struttura visibile nel prompt SO4 rispetto al file esistente:

1. **Import `Button` e `Legend`** — aggiunti (non presenti nella versione attuale)
2. **Import `useNavigate`** — aggiunto per navigazione da stalled opportunities  
3. **Formatter `fmt` locale** — sostituisce `fmtCur` importato da `dashboard/utils`
4. **`SalesVelocityCard`** — layout espanso a 4 colonne (aggiunto `avg_cycle_days`)
5. **`WeightedPipelineChart`** — aggiunto `Legend` component e riepilogo totale/pesato sotto il grafico
6. **`SalesForecastChart`** — usa `Legend` component
7. **`StalledOpportunitiesPanel`** — aggiunto `navigate` onClick sulle righe, confronto `days_stalled > stalled_threshold * 2` per badge destructive
8. **`SellerComparisonTable`** — colonna "Target mese" con Progress bar e achievement %
9. **`ConversionBySourceChart`** — footer con top 4 fonti e valore vinto
10. **`TopLeadsTable`** — aggiunto con tier color map e progress bar per lead score
11. **Header dashboard** — aggiunta descrizione "Centro di comando commerciale"
12. **Tabs** — icone aggiunte ai trigger, tab "Analisi" per conversione per fonte

## Piano

1. Sovrascrivere `src/pages/azienda/marketing/SalesOSDashboard.tsx` ricostruendo il JSX completo basato sulla struttura SO4 (testi, layout, logica visibili nel prompt + pattern del file esistente)
2. Nessuna modifica a route (già configurata) né ad altri file

## Rischio
Il JSX è stato ricostruito dalla struttura del prompt poiché i tag originali sono stati strippati. La logica e i testi sono fedeli al prompt SO4.

