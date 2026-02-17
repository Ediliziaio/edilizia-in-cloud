

# Audit Tab Marginalita - Fix e Stabilizzazione

## Problema Rilevato

### Bug: `useMemo` con side-effect (setState) in `MarginTab.tsx` (riga 54-59)

```tsx
useMemo(() => {
  if (!isLoading && avgMarginPercent > 0 && simMarginTarget === 0) {
    setSimMarginTarget(Math.round(avgMarginPercent));
    setSimRevenueTarget(Math.round(currentMonthlyRevenue));
  }
}, [isLoading, avgMarginPercent, currentMonthlyRevenue]);
```

Questo e' un anti-pattern React: `useMemo` non deve contenere side-effect (`setState`). Puo causare:
- Warning in React StrictMode
- Comportamento imprevedibile nei re-render
- Il simulatore che non si inizializza correttamente in alcuni casi

**Soluzione**: Sostituire con `useEffect`, che e' il hook corretto per side-effect di inizializzazione. Aggiungere anche un `useRef` per evitare re-inizializzazioni indesiderate.

## Dettaglio Tecnico

### File: `src/components/forecast/MarginTab.tsx`

1. Aggiungere `useEffect, useRef` all'import React (riga 1)
2. Sostituire il blocco `useMemo` (righe 54-59) con:

```tsx
const initializedRef = useRef(false);

useEffect(() => {
  if (!isLoading && avgMarginPercent > 0 && !initializedRef.current) {
    initializedRef.current = true;
    setSimMarginTarget(Math.round(avgMarginPercent));
    setSimRevenueTarget(Math.round(currentMonthlyRevenue));
  }
}, [isLoading, avgMarginPercent, currentMonthlyRevenue]);
```

Questo garantisce:
- Side-effect eseguito nel momento corretto (dopo il render)
- Inizializzazione una sola volta grazie al `useRef`
- Nessun warning React

## Riepilogo Audit Completo

| Area | Stato | Note |
|------|-------|------|
| Import inutilizzati | OK | Nessuno trovato |
| Logica finanziaria | OK | Formule coerenti con OrderEconomics |
| Query Supabase | OK | Filtro company_id, staleTime, enabled corretto |
| Gestione null/undefined | OK | Fallback su 0 e "N/D" presenti |
| Stato vuoto | OK | Messaggio "Nessuna commessa trovata" |
| Loading state | OK | Skeleton durante caricamento |
| UX colori/numeri | OK | Verde/rosso/ambra, text-3xl leggibili |
| Anti-pattern React | FIX | useMemo con setState da correggere |
| Console warning | OK | Wrap div gia applicato nel commit precedente |

