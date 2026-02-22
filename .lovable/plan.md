

# Pulizia e stabilizzazione Calendari Marketing

## Bug trovati

1. **Variabile inutilizzata**: `availInitialized` (riga 247) - `useState(false)` mai usato
2. **Uso errato di useState come side-effect** (righe 270-272): `useState(() => { initAvailability(); })` non e il modo corretto per inizializzare dati. Deve essere `useEffect`
3. **setState durante il render** (righe 275-297 e 308-322): il pattern `if (key !== prevKey) { setPrevKey(...); setLocalState(...) }` causa aggiornamenti di stato durante il rendering, potenziale fonte di loop infiniti e warning React. Va sostituito con `useEffect`
4. **Funzione `initAvailability`** (riga 250): definita ma mai chiamata correttamente (solo dal `useState` rotto)

## Soluzione tecnica

### File: `src/components/settings/MarketingCalendarsConfig.tsx`

**Rimozioni:**
- Variabile `availInitialized` (riga 247)
- Funzione `initAvailability` standalone (righe 250-267)
- Pattern `useState(() => { ... })` errato (righe 270-272)
- Variabili `prevAvailKey` e `prevPrefsKey` con relative logiche di confronto durante il render (righe 275-297, 308-322)

**Sostituzione con useEffect puliti:**

```typescript
// Sync availability from query data
useEffect(() => {
  if (availability.length > 0) {
    setLocalAvail(
      availability
        .filter(a => a.specific_date === null)
        .map(a => ({
          day_of_week: a.day_of_week!,
          start_time: a.start_time,
          end_time: a.end_time,
          is_enabled: a.is_enabled,
        }))
    );
  } else if (selectedCalendarId) {
    setLocalAvail(
      DAYS.map(d => ({
        day_of_week: d.value,
        start_time: "09:00",
        end_time: "18:00",
        is_enabled: d.value >= 1 && d.value <= 5,
      }))
    );
  }
}, [availability, selectedCalendarId]);

// Sync preferences from query data
useEffect(() => {
  if (preferences) {
    setLocalPrefs({
      week_start_day: preferences.week_start_day,
      time_format: preferences.time_format,
      language: preferences.language,
      show_services_menu: preferences.show_services_menu,
      show_rooms: preferences.show_rooms,
      show_equipment: preferences.show_equipment,
    });
  }
}, [preferences]);
```

**Aggiunta import `useEffect`**: gia presente nella signature ma va confermato che sia importato (attualmente importa solo `useState`; va aggiunto `useEffect`).

---

## Elenco rimozioni

| Elemento | Riga | Motivo |
|----------|------|--------|
| `availInitialized` | 247 | Mai usata |
| `initAvailability()` | 250-267 | Sostituita da useEffect |
| `useState(() => {...})` | 270-272 | Uso errato di useState |
| `prevAvailKey` + logica render-time | 275-297 | Anti-pattern React |
| `prevPrefsKey` + logica render-time | 308-322 | Anti-pattern React |

## Miglioramenti UX

- Nessun rischio di loop di rendering
- Stato locale sempre sincronizzato correttamente con i dati del server
- Nessun warning React in console

## Nessuna modifica al database

## File modificati: 1

- `src/components/settings/MarketingCalendarsConfig.tsx`

