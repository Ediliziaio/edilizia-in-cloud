

# Colorazione margine ordini per soglia

## Problema
Nella tabella ordini (`OrdersTable.tsx`, riga 267), il margine è verde se ≥ 0, rosso se negativo. L'utente vuole 3 soglie: **verde** ≥ 30%, **arancione** 20-30%, **rosso** < 20%.

## Modifiche

### `src/components/orders/OrdersTable.tsx` (riga 267-269)
Sostituire la logica colore attuale:
```tsx
// Prima: solo verde/rosso
grossMargin >= 0 ? "text-emerald-600" : "text-destructive"

// Dopo: 3 soglie
marginPercent >= 30
  ? "text-emerald-600 dark:text-emerald-400"
  : marginPercent >= 20
    ? "text-amber-600 dark:text-amber-400"
    : "text-destructive"
```

### `src/components/orders/OrderEconomics.tsx` (righe 410-425)
Applicare la stessa logica a 3 soglie per il margine € e % nel dettaglio ordine, e aggiornare l'alert (righe 197-222) per usare soglia 20% invece di 10%.

