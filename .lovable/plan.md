

# Piano: Aggiungere Suggerimenti Calendario con Distanze in Opportunità e Contatti

## Situazione attuale

| Contesto | Suggerimenti calendari | Distanza base | Percorso giornaliero |
|----------|----------------------|---------------|---------------------|
| MarketingAppointmentDialog (Calendario) | ✅ | ✅ | ✅ |
| ContactAppointmentsPanel (Contatti) | ✅ già presente (usa MarketingAppointmentDialog) | ✅ | ✅ |
| OpportunityAppointmentTab (Opportunità) | ❌ mancante | ✅ parziale | ❌ |

Il **form contatti** già usa `MarketingAppointmentDialog` che include tutto. Il problema è solo nel **tab Appuntamenti delle Opportunità** che ha un form inline custom senza `CalendarSuggestions`.

## Intervento

### File: `src/components/opportunities/OpportunityAppointmentTab.tsx`

1. **Importare `CalendarSuggestions`** e il tipo `CalendarSuggestion`

2. **Aggiungere la query `suggest-calendars`** — stessa logica del `MarketingAppointmentDialog`:
   - Si attiva quando `addressData.lat`, `addressData.lng` e `date` sono valorizzati
   - Chiama la Edge Function `suggest-calendars` con `company_id`, `client_lat`, `client_lng`, `date`, `client_address`
   - `staleTime: 2 min`

3. **Aggiungere handler `handleSuggestionSelect`** — quando l'utente clicca un suggerimento:
   - Imposta `calendarId` al calendario suggerito
   - Imposta `selectedSlot` all'orario suggerito
   - Resetta la selezione slot manuale

4. **Renderizzare il componente `CalendarSuggestions`** tra la sezione indirizzo e il date picker (dopo la card con la distanza dalla base), condizionato a `addressData.lat != null && date != null`

5. **Aggiungere inter-distanze tra appuntamenti** — mostrare per ogni appuntamento dello stesso giorno la distanza dal nuovo indirizzo (come già fatto nel dialog marketing), usando le stesse query `maps-proxy` con `staleTime: 5 min`

### Nessuna modifica necessaria per Contatti

Il form di creazione appuntamento da `MarketingContactDetail` già utilizza `MarketingAppointmentDialog`, che include CalendarSuggestions, DailyRoutePanel e tutte le distanze. Non serve alcun intervento.

## Dettaglio tecnico

```text
OpportunityAppointmentTab.tsx — struttura UI aggiornata:

  ┌─ Appuntamento già fissato (se esiste)
  ├─ Calendario select
  ├─ Titolo
  ├─ Indirizzo + Mappa + Distanza base
  ├─ 🆕 CalendarSuggestions (se lat+lng+data presenti)
  ├─ Altri appuntamenti del giorno (con distanze inter-appuntamento)
  ├─ Data picker
  ├─ Slot disponibili
  ├─ Descrizione
  └─ Pulsante Prenota
```

La query `suggest-calendars` restituisce per ogni calendario: `travel_km`, `travel_minutes`, `daily_km_if_assigned`, `suggested_times`, `status` (OK/WARNING/BLOCKED) e `daily_route`. Il componente `CalendarSuggestions` già renderizza tutto questo con progress bar km, badge status, e pannello percorso espandibile.

Quando l'utente seleziona un suggerimento, il calendario e lo slot vengono pre-compilati nel form, stessa UX del dialog marketing.

## File coinvolti

| File | Azione |
|------|--------|
| `src/components/opportunities/OpportunityAppointmentTab.tsx` | Aggiunta CalendarSuggestions + inter-distanze |

Nessuna modifica DB. Nessuna modifica backend.

