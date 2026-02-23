

# Travel Time in Vista Settimana + Distanza nel Dialog + Appuntamenti Contatti

## Panoramica

Tre aree di intervento:

1. **Travel time pills nella vista Settimana** (come gia presente nella vista Giorno)
2. **Distanza in tempo reale nel dialog appuntamento** (calendario, opportunita, contatti) - mostrare distanza dal calendario base e tra appuntamenti dello stesso giorno
3. **Tab Appuntamenti nel dettaglio contatto** - sostituire il placeholder "Prossimamente" con un widget funzionale

---

## 1. Vista Settimana: Travel Time Pills

**File**: `src/components/marketing/MarketingCalendarWeekView.tsx`

Modifiche:
- Aggiungere la prop `travelLegs?: TravelLeg[]` (stessa interfaccia di DayView)
- Aggiungere le props `lat`, `lng`, `formatted_address` all'interfaccia `Appointment`
- Per ogni appuntamento nella cella, se esiste un `travelLeg` corrispondente (match su `toId`), mostrare la pill sopra l'appuntamento con durata e distanza
- Pill compatta (dato lo spazio ridotto nella settimana): solo "18 min" con tooltip per dettagli completi
- Se `isLate`, pill rossa con icona warning
- Badge "Indirizzo mancante" se l'appuntamento non ha coordinate e non e bloccato

**File**: `src/pages/azienda/marketing/MarketingCalendar.tsx`

Modifiche:
- Rimuovere il filtro `calendarView !== "day"` dal calcolo `dayAppointmentsWithCoords` - rinominarlo in modo generico per supportare sia day che week
- Per la vista settimana: calcolare i travel legs per ogni giorno della settimana che ha 2+ appuntamenti con coordinate
- Struttura: `weekTravelLegs: Record<string, TravelLeg[]>` dove la chiave e la data (yyyy-MM-dd)
- Il calcolo batch chiama `maps-proxy/directions` per ogni giorno con appuntamenti geocodificati
- Passare i travel legs aggregati alla `MarketingCalendarWeekView`
- Caching `staleTime: 5 min` per ridurre chiamate

---

## 2. Distanza in tempo reale nel MarketingAppointmentDialog

**File**: `src/components/marketing/MarketingAppointmentDialog.tsx`

Modifiche:
- Quando l'utente seleziona un calendario e inserisce un indirizzo con coordinate:
  - Recuperare `base_lat`/`base_lng` dal calendario selezionato (gia disponibile nella prop `calendars`, estendere la query per includere i campi base)
  - Chiamare `maps-proxy/directions` per calcolare distanza base -> appuntamento
  - Mostrare una pill sotto la mappa: icona auto + "18 min - 12 km" + "dalla base calendario"
- Quando l'utente seleziona una data:
  - Fetch degli altri appuntamenti dello stesso giorno/calendario con coordinate
  - Mostrare una mini lista "Altri appuntamenti del giorno" con orario e distanza da ciascuno

Per fare questo servono due modifiche:
- Estendere l'interfaccia `CalendarOption` con `base_lat`, `base_lng`, `base_formatted_address`
- Aggiungere una `useQuery` per `baseDistance` (come gia fatto in OpportunityAppointmentTab)
- Aggiungere una `useQuery` per gli appuntamenti dello stesso giorno

---

## 3. Tab Appuntamenti nel Dettaglio Contatto

**File**: `src/pages/azienda/marketing/MarketingContactDetail.tsx`

Modifiche:
- Sostituire il placeholder "Prossimamente: appuntamenti" (riga ~912) con un widget funzionale
- Il widget dovra:
  - Mostrare la lista degli appuntamenti futuri e passati del contatto (da `appointments` filtrati per `contact_id`)
  - Per ogni appuntamento: data, ora, titolo, calendario, stato, indirizzo (se presente)
  - Pulsante "Prenota appuntamento" che apre il `MarketingAppointmentDialog` con il contatto pre-selezionato
  - Nel dialog aperto dal contatto, il `contact_id` e pre-compilato
  - L'indirizzo inserito viene sincronizzato sul contatto (logica gia esistente nel dialog)

Per implementarlo:
- Importare `MarketingAppointmentDialog` nel dettaglio contatto
- Aggiungere state per gestire apertura/chiusura del dialog
- Fetch appuntamenti del contatto con `useQuery`
- Fetch calendari attivi e utenti per passarli al dialog
- Mostrare lista appuntamenti con badge stato e azioni (modifica/cancella)

---

## 4. Pulizia e ottimizzazione

- **Tipo `TravelLeg`**: gia esportato da `MarketingCalendarDayView.tsx` - riutilizzarlo ovunque senza duplicazioni
- **`CalendarOption` esteso**: uniformare l'interfaccia in tutti i componenti per includere `base_lat`/`base_lng`
- **Caching directions**: tutte le query `maps-proxy/directions` con `staleTime: 5 * 60 * 1000`
- **Fallback UI**: se la chiamata directions fallisce, non mostrare nulla (niente crash)

---

## Riepilogo file

| File | Azione |
|------|--------|
| `src/components/marketing/MarketingCalendarWeekView.tsx` | Modifica: aggiungere travel time pills, prop travelLegs, badge indirizzo mancante |
| `src/pages/azienda/marketing/MarketingCalendar.tsx` | Modifica: calcolare travel legs per settimana, passare a WeekView, estendere query calendari |
| `src/components/marketing/MarketingAppointmentDialog.tsx` | Modifica: distanza base in tempo reale, lista appuntamenti stesso giorno |
| `src/pages/azienda/marketing/MarketingContactDetail.tsx` | Modifica: tab Appuntamenti funzionale con lista + pulsante prenota + dialog |

### Sequenza
1. MarketingCalendarWeekView (travel pills nella settimana)
2. MarketingCalendar (calcolo travel legs per week view)
3. MarketingAppointmentDialog (distanza base + appuntamenti giorno)
4. MarketingContactDetail (tab appuntamenti funzionale)

