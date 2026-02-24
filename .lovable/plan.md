

# Piano: Debug Logging Strutturato + Unit Test per suggest-calendars

## Problema

La Edge Function `suggest-calendars` non ha:
1. Un sistema di logging strutturato con flag on/off per tracciare origini, destinazioni e motivazioni del ranking
2. Unit test per le funzioni pure di scoring, calcolo km e utilita

## Modifiche

### 1. Refactor: Estrarre funzioni pure in un modulo testabile

**Nuovo file: `supabase/functions/suggest-calendars/scoring.ts`**

Estrarre le seguenti funzioni pure da `index.ts`:
- `haversineKm(lat1, lng1, lat2, lng2)` — distanza in km
- `haversineEstimate(lat1, lng1, lat2, lng2)` — stima km * 1.3 + minuti
- `timeToMinutes(t)` — "HH:MM" → minuti
- `minutesToTime(m)` — minuti → "HH:MM"
- `calculateScore(travel_minutes, travel_km, maxTravelMinutes, simTotalKm, maxKm)` — punteggio + penalita
- `determineStatus(travel_minutes, maxTravelMinutes, simTotalKm, maxKm, hasSuggestedTimes)` — OK/WARNING/BLOCKED + reason

### 2. Debug Logging Strutturato

**File: `supabase/functions/suggest-calendars/index.ts`**

Aggiungere un parametro opzionale `debug: boolean` nel body della request. Quando attivo:

```typescript
const debugLog: any[] = [];
const log = (entry: object) => { if (debug) debugLog.push({ ts: Date.now(), ...entry }); };
```

Per ogni calendario valutato, registrare:
- `origin` (base lat/lng o closest appt)
- `destination` (client lat/lng)
- `travel_km`, `travel_minutes`, `is_estimate`
- `daily_km_current`, `daily_km_simulated`, `max_daily_km`
- `score`, `status`, `reason`
- `slot_generation` (quanti slot trovati e perche)

Il debug log viene incluso nella response solo se `debug: true`:
```json
{ "suggestions": [...], "debug_log": [...] }
```

### 3. Unit Test

**Nuovo file: `supabase/functions/suggest-calendars/scoring.test.ts`**

Scenari coperti:

| Test | Descrizione |
|------|-------------|
| haversineKm accuracy | Milano-Roma ~480 km |
| haversineEstimate | Verifica fattore * 1.3 e velocita 50 km/h |
| timeToMinutes | "09:30" → 570, "00:00" → 0 |
| minutesToTime | 570 → "09:30", 1440 → "00:00" |
| calculateScore base | score = minutes*2 + km |
| calculateScore penalty travel | +1000 se travel > maxTravelMinutes |
| calculateScore penalty km | +500 se simKm > maxKm |
| determineStatus OK | Valori sotto soglia |
| determineStatus WARNING travel | 80-100% del limite minuti |
| determineStatus WARNING km | 80-100% del limite km |
| determineStatus BLOCKED travel | Oltre limite minuti |
| determineStatus BLOCKED km | Oltre limite km |
| determineStatus BLOCKED no slots | Nessuno slot + non gia BLOCKED |

### 4. Aggiornare index.ts

- Importare le funzioni da `scoring.ts` invece di definirle inline
- Aggiungere le chiamate `log()` nei punti chiave del loop calendari
- Aggiungere `debug_log` alla response se flag attivo

## Dettaglio tecnico

Le funzioni estratte sono pure (nessuna dipendenza da Supabase o fetch), quindi testabili con `Deno.test()` senza mock. Il file di test usa:

```typescript
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { haversineKm, calculateScore, determineStatus, timeToMinutes, minutesToTime } from "./scoring.ts";
```

## File coinvolti

| File | Azione |
|------|--------|
| `supabase/functions/suggest-calendars/scoring.ts` | NUOVO — funzioni pure estratte |
| `supabase/functions/suggest-calendars/scoring.test.ts` | NUOVO — 13 test case |
| `supabase/functions/suggest-calendars/index.ts` | MODIFICA — import da scoring.ts + debug logging |

Nessuna migrazione DB. Nessuna modifica al frontend.

