

# Verifica Implementazione — Suggerimento Automatico Calendario

## Stato: TUTTO IMPLEMENTATO E FUNZIONANTE

L'intera feature e gia stata implementata nelle sessioni precedenti. Ecco il riepilogo della verifica:

---

## 1. Database — Colonne Verificate

| Tabella | Colonna | Tipo | Stato |
|---------|---------|------|-------|
| `marketing_calendars` | `max_daily_km` | integer | Presente |
| `marketing_calendars` | `base_lat`, `base_lng` | double precision | Presente |
| `marketing_calendars` | `base_formatted_address` | text | Presente |
| `marketing_calendar_preferences` | `default_max_daily_km` | integer (default 250) | Presente |
| `marketing_calendar_preferences` | `max_travel_minutes` | integer (default 60) | Presente |
| `marketing_calendar_preferences` | `default_appointment_duration_minutes` | integer (default 90) | Presente |
| `companies` | `operational_lat`, `operational_lng` | double precision | Presente |

## 2. Dati Esistenti

- **1 calendario attivo**: "calendario di prova" con base a Mezzate (MI), lat/lng configurati correttamente
- **`max_daily_km`**: non impostato sul calendario (usera il default globale 250 km)
- **Preferenze aziendali**: non ancora salvate (la Edge Function usera i default: 250 km, 60 min, 90 min)

## 3. Componenti UI — Verificati

| Componente | File | Stato |
|---|---|---|
| Sezione "Calendari Consigliati" nel dialog | `MarketingAppointmentDialog.tsx` (riga 489-497) | Integrato |
| Pannello percorso giornaliero | `DailyRoutePanel.tsx` | Completo |
| Card suggerimento con badge OK/WARNING/BLOCKED | `CalendarSuggestions.tsx` | Completo |
| Campi impostazioni km/tempo in Preferenze | `MarketingCalendarsConfig.tsx` (righe 530-568) | Completo |
| Campo max_daily_km nel dialog calendario | `CalendarDialog.tsx` (righe 276-289) | Completo |

## 4. Edge Function `suggest-calendars` — Verificata

- File: `supabase/functions/suggest-calendars/index.ts` (472 righe)
- Algoritmo scoring: `travel_minutes * 2 + travel_km`
- Fallback Haversine se Google Maps API non disponibile
- Calcolo route completa: Base → App1 → ... → AppN → Base
- Generazione slot orari suggeriti (max 3)
- Status: OK / WARNING / BLOCKED

## 5. Problema Trovato — Bug Minore

In `handleSuggestionSelect` (riga 298), la durata per calcolare `endTime` e hardcoded a 30 minuti invece di usare la durata effettiva del calendario selezionato. Il calendario di test ha `duration_minutes: 60`, quindi se l'utente seleziona un orario suggerito, l'orario di fine sara calcolato con +30 min invece di +60 min.

**Fix necessario**: Leggere `duration_minutes` dal calendario selezionato oppure dalla risposta del suggest-calendars.

---

## Come Testare la Feature

Per verificare end-to-end:

1. **Impostazioni** → Marketing Calendari → Tab "Preferenze" → Salvare le preferenze di spostamento (i campi ci sono gia con default 250 km, 60 min, 90 min)
2. **Calendario Marketing** → Cliccare su un giorno → "Prenota appuntamento"
3. Selezionare una data e inserire un indirizzo cliente nell'autocomplete
4. La sezione "Calendari consigliati" apparira automaticamente sotto l'indirizzo con il ranking

## Piano Fix

| # | Fix | Dettaglio |
|---|-----|-----------|
| 1 | Correggere durata endTime nel handleSuggestionSelect | Usare `duration_minutes` dal calendario selezionato (disponibile via prop `calendars`) invece del valore hardcoded 30 |

