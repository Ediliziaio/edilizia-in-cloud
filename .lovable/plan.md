

# Piano: Suggerimento Automatico Calendario Piu Vicino negli Appuntamenti Marketing

## Analisi AS-IS

Il sistema gia dispone di:
- **`marketing_calendars`**: con campi `base_lat`, `base_lng`, `base_formatted_address`, `owner_id`, `duration_minutes`
- **`marketing_calendar_availability`**: disponibilita per giorno/ora per ogni calendario
- **`marketing_calendar_preferences`**: preferenze globali azienda (formato ora, settimana, etc.)
- **`appointments`**: con `lat`, `lng`, `calendar_id`, `appointment_time`, `appointment_end_time`, `formatted_address`
- **Edge Function `maps-proxy`**: gia implementata con azioni `autocomplete`, `place-details`, `directions`
- **`MarketingAppointmentDialog`**: gia ha indirizzo con autocomplete, calcolo distanza dalla base, e vista appuntamenti stesso giorno
- **`companies`**: ha `operational_address` ma NON ha `operational_lat`/`operational_lng` (servono per fallback base)

### Differenze con i parametri richiesti nel prompt

| Parametro richiesto | Stato attuale | Azione |
|---|---|---|
| `home_base_address/lat/lng` per commerciale | Esiste su `marketing_calendars` (base del calendario, non del commerciale diretto) | OK, usiamo il calendario come unita. Ogni calendario ha il suo `owner_id` e la sua base |
| `max_daily_km` per commerciale | NON esiste | Aggiungere colonna su `marketing_calendars` |
| `default_max_daily_km` global | NON esiste su `marketing_calendar_preferences` | Aggiungere colonna |
| `max_travel_minutes_between_appointments` | NON esiste | Aggiungere su `marketing_calendar_preferences` |
| `default_appointment_duration_minutes` | Esiste come `duration_minutes` su ogni calendario | OK, gia presente |
| `duration_minutes` su appointments | NON esiste come colonna dedicata, ma calcolabile da `appointment_time` + `appointment_end_time` | OK, calcoliamo runtime |
| `end_datetime` su appointments | Esiste come `appointment_end_time` | OK |
| `operational_lat/lng` su companies | NON esiste | Aggiungere per fallback base |

---

## Parte 1: Migrazioni DB

### 1A. Aggiungere colonne configurazione

```sql
-- marketing_calendars: km massimi giornalieri per calendario/commerciale
ALTER TABLE public.marketing_calendars
  ADD COLUMN max_daily_km integer;

-- marketing_calendar_preferences: impostazioni globali
ALTER TABLE public.marketing_calendar_preferences
  ADD COLUMN default_max_daily_km integer NOT NULL DEFAULT 250,
  ADD COLUMN max_travel_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN default_appointment_duration_minutes integer NOT NULL DEFAULT 90;

-- companies: coordinate sede operativa (fallback per base)
ALTER TABLE public.companies
  ADD COLUMN operational_lat double precision,
  ADD COLUMN operational_lng double precision;
```

### 1B. Nessuna nuova tabella necessaria
L'infrastruttura esistente e sufficiente. Non servono endpoint REST separati: tutta la logica di suggerimento sara implementata client-side + Edge Function `maps-proxy` esistente.

---

## Parte 2: Edge Function `suggest-calendars`

Nuova Edge Function `suggest-calendars` che:

**Input:**
```json
{
  "company_id": "uuid",
  "client_lat": 45.123,
  "client_lng": 9.456,
  "date": "2026-03-01",
  "desired_start_time": "14:00" // opzionale
}
```

**Logica (step-by-step):**
1. Recupera tutti i calendari attivi dell'azienda con base lat/lng
2. Recupera le preferenze aziendali (`default_max_daily_km`, `max_travel_minutes`)
3. Per ogni calendario, recupera gli appuntamenti del giorno (non annullati)
4. Per ogni calendario:
   - Calcola distanza base → cliente via `maps-proxy` directions
   - Se ci sono appuntamenti nel giorno, calcola la route completa: Base → App1 → ... → AppN → Base
   - Simula inserimento del nuovo appuntamento e ricalcola km totali
   - Genera 1-3 slot orari suggeriti (prima finestra libera, dopo appuntamento vicino, fascia pomeriggio)
   - Verifica vincoli: travel_minutes <= max_travel_minutes, km_totali <= max_daily_km, no overlap
5. Calcola score: `travel_minutes * 2 + travel_km` + penalita
6. Restituisci top 5 ordinati per score

**Output:**
```json
{
  "suggestions": [
    {
      "calendar_id": "uuid",
      "calendar_name": "Marco Rossi",
      "travel_km": 23.5,
      "travel_minutes": 28,
      "daily_km_if_assigned": 145,
      "max_daily_km": 250,
      "suggested_times": ["10:30", "14:00"],
      "reason": "Vicino all'appuntamento delle 09:00 a Bergamo",
      "status": "OK",
      "score": 79.5,
      "daily_route": [
        { "label": "Base", "address": "Via Roma 1, Milano" },
        { "label": "09:00 - Cliente A", "address": "Via Dante 5, Bergamo" },
        { "label": "NUOVO - Cliente B", "address": "Via Verdi 10, Bergamo" },
        { "label": "Base", "address": "Via Roma 1, Milano" }
      ]
    }
  ]
}
```

---

## Parte 3: UI nel MarketingAppointmentDialog

### 3A. Sezione "Calendari Consigliati"

Appare automaticamente quando:
- L'indirizzo cliente ha lat/lng validi
- E stata selezionata una data

Mostra una lista ordinata con:
- Nome calendario/commerciale
- Badge: OK (verde), WARNING (giallo), BLOCKED (rosso)
- Distanza e tempo di viaggio
- Motivazione (es. "Vicino appuntamento 09:00 a Bergamo")
- Km totali giornalieri previsti con barra progresso vs limite
- Bottone "Seleziona" che auto-compila calendario + orario suggerito

### 3B. Pannello "Percorso Giornaliero"

Visibile dopo selezione calendario, mostra:
- Timeline: Base → App1 → App2 → ... → Base
- Km totali A/R con indicatore progresso
- Alert rosso se supera `max_daily_km`
- Tratte con durata/distanza tra ciascuna tappa

### 3C. Comportamento UX

1. Utente inserisce indirizzo cliente → autocomplete come gia funziona
2. Al completamento indirizzo (onBlur o selezione place) + data presente → auto-trigger suggerimento
3. Sezione "Calendari consigliati" appare sotto l'indirizzo con loading spinner
4. Click su suggerimento → compila `calendar_id` + `startTime` + `endTime`
5. Pannello percorso giornaliero si aggiorna
6. Se stato BLOCKED → non selezionabile, tooltip spiega il motivo

---

## Parte 4: Impostazioni (Settings)

### In `MarketingCalendarsConfig.tsx` - Tab Preferenze

Aggiungere 3 nuovi campi:
- **Km massimi giornalieri A/R (default)**: input numerico, default 250
- **Tempo massimo spostamento tra appuntamenti (min)**: input numerico, default 60
- **Durata appuntamento di default (min)**: input numerico, default 90

### In `CalendarDialog.tsx` - Form Calendario

Aggiungere:
- **Km massimi giornalieri**: input numerico, placeholder "Usa default globale (250)"

---

## Parte 5: Dettaglio Tecnico

### Caching e Ottimizzazione Costi API

- La Edge Function `suggest-calendars` fara le chiamate directions internamente (server-side), riducendo le chiamate dal client
- Le directions gia hanno `staleTime: 5 min` sul client
- Per ridurre ulteriormente i costi: se il provider e down, fallback Haversine con fattore 1.3x per stima km stradali, marcando "stima"

### Edge Cases Gestiti

| Caso | Comportamento |
|---|---|
| Appuntamento senza lat/lng | Escluso dal calcolo route, non conta per km |
| Indirizzo cliente incompleto | Sezione suggerimenti non appare, messaggio "Completa l'indirizzo" |
| Calendario senza base | Fallback su `operational_lat/lng` azienda. Se neanche quello esiste: mostra con WARNING "Base non configurata" |
| Solo 1 appuntamento nel giorno | Route: Base → App → Base |
| Nessun calendario attivo | Messaggio "Nessun calendario configurato" |
| Conflitto orario (overlap) | Calendario escluso per quello slot, prova slot alternativi |
| Durata non specificata | Usa `duration_minutes` del calendario (gia esistente) |

---

## Riepilogo Deliverables

| # | Deliverable | File/Strumento |
|---|---|---|
| 1 | Migration DB: 3 nuove colonne su calendars, preferences, companies | SQL migration |
| 2 | Edge Function `suggest-calendars` | `supabase/functions/suggest-calendars/index.ts` |
| 3 | UI: sezione "Calendari Consigliati" nel dialog appuntamento | `MarketingAppointmentDialog.tsx` |
| 4 | UI: pannello "Percorso Giornaliero" | Nuovo componente `DailyRoutePanel.tsx` |
| 5 | Settings: campi km/tempo nelle preferenze calendario | `MarketingCalendarsConfig.tsx` |
| 6 | Settings: campo max_daily_km nel dialog calendario | `CalendarDialog.tsx` |
| 7 | Fallback Haversine se API Maps non disponibile | Dentro Edge Function |

### Vincoli rispettati
- Zero regressioni: il form attuale resta identico, la sezione suggerimenti e un'aggiunta opzionale
- Il salvataggio appuntamento NON cambia: stesso payload, stessa logica
- L'utente puo sempre selezionare manualmente un calendario senza usare il suggerimento

