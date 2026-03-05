

# Pulizia, Stabilizzazione e UX — Calendario

## Analisi completata

Ho analizzato i file del calendario e identificato i seguenti interventi necessari:

## 1. Codice morto da rimuovere

| File | Problema |
|------|----------|
| `Calendar.tsx` riga 44 | `layerPrefsLoaded` / `setLayerPrefsLoaded` dichiarato ma mai usato |
| `CalendarMonthView.tsx` riga 38-39 | Doppia riga vuota residua |
| `CalendarWeekView.tsx` riga 44 | Riga vuota extra dopo l'interface `WeekEvent` |

## 2. Ottimizzazione localStorage

Attualmente ogni `useState` fa un `JSON.parse(localStorage.getItem(...))` separatamente — lo stesso JSON viene parsato 8 volte al mount. Refactoring: parsare una sola volta in una costante fuori dagli state.

```tsx
const savedPrefs = (() => {
  try { return JSON.parse(localStorage.getItem("calendar-layer-prefs") || "{}"); }
  catch { return {}; }
})();
```

Poi ogni useState accede a `savedPrefs.showPosa ?? true` ecc.

## 3. Fix funzionali

Nessun bug bloccante trovato. Le checkbox toggle/untoggle correttamente (confermato da session replay), la persistenza localStorage funziona, le sezioni collassabili sono già operative.

## 4. Riepilogo modifiche

**File: `src/pages/azienda/Calendar.tsx`**
- Rimuovere `layerPrefsLoaded` e `setLayerPrefsLoaded` (dead code)
- Refactoring: parsare localStorage una sola volta e passare i valori agli state initializer

**File: `src/components/calendar/CalendarMonthView.tsx`**
- Rimuovere riga vuota extra (riga 38)

**File: `src/components/calendar/CalendarWeekView.tsx`**
- Rimuovere riga vuota extra (riga 44)

Nessun cambio funzionale. Solo pulizia e micro-ottimizzazione.

