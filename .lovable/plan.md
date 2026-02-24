

# Fix: CalendarPreferences Type + handleSuggestionSelect Duration

## Stato attuale

1. **`handleSuggestionSelect`** — Il bug del valore hardcoded 30 minuti e GIA stato corretto nell'ultimo edit (riga 299: `cal?.duration_minutes || 60`). Nessun intervento necessario.

2. **Preferenze spostamento** — I 3 campi UI (km massimi, tempo max, durata default) esistono nel form e vengono salvati via `upsertPreferences.mutate(localPrefs)`. Tuttavia c'e un problema: il tipo `CalendarPreferences` (righe 47-56) NON include i 3 nuovi campi, causando l'uso di `(preferences as any)` nel sync useEffect. Questo funziona a runtime ma e fragile e potrebbe causare problemi di manutenzione.

## Modifiche necessarie

### File: `src/components/settings/MarketingCalendarsConfig.tsx`

**1. Aggiornare il tipo `CalendarPreferences`** (riga 47-56)

Aggiungere:
```typescript
default_max_daily_km: number;
max_travel_minutes: number;
default_appointment_duration_minutes: number;
```

**2. Rimuovere i cast `(preferences as any)`** (righe 325-327)

Sostituire con accesso diretto tipizzato:
```typescript
default_max_daily_km: preferences.default_max_daily_km ?? 250,
max_travel_minutes: preferences.max_travel_minutes ?? 60,
default_appointment_duration_minutes: preferences.default_appointment_duration_minutes ?? 90,
```

## Riepilogo

| Fix | File | Dettaglio |
|-----|------|-----------|
| Type safety | MarketingCalendarsConfig.tsx | Aggiungere 3 campi al tipo CalendarPreferences e rimuovere cast `as any` |

Nessuna migrazione DB necessaria. Nessuna modifica alla Edge Function. Il salvataggio preferenze gia funziona correttamente.

