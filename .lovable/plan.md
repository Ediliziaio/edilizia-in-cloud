
# Geocodifica, Mappa e Route Planning per Appuntamenti

## Panoramica

Aggiungere campi indirizzo strutturati agli appuntamenti, autocomplete Google Maps, mini mappa embed, e calcolo tempi di percorrenza tra appuntamenti nella vista giornaliera.

---

## Pre-requisito: Google Maps API Key

Serve una API Key Google Maps con queste API abilitate:
- **Places API (New)** - autocomplete indirizzi
- **Geocoding API** - conversione indirizzo/coordinate
- **Directions API** - calcolo percorsi
- **Maps Embed API** - mini mappa nell'appuntamento

La chiave verra richiesta come secret (`GOOGLE_MAPS_API_KEY`) e usata sia client-side (embed + autocomplete) sia server-side (directions).

---

## 1. Migrazione Database

Aggiungere colonne alla tabella `appointments`:

| Colonna | Tipo | Default |
|---------|------|---------|
| `address_line` | text | null |
| `address_city` | text | null |
| `address_postal_code` | text | null |
| `address_province` | text | null |
| `address_country` | text | 'IT' |
| `address_notes` | text | null |
| `formatted_address` | text | null |
| `lat` | double precision | null |
| `lng` | double precision | null |
| `place_id` | text | null |

Nessuna colonna obbligatoria (NOT NULL) per non rompere gli appuntamenti esistenti.

---

## 2. Edge Function: `maps-proxy`

Una singola edge function che fa da proxy per le chiamate Google Maps lato server:

**Endpoint 1**: `POST /autocomplete`
- Input: `{ query: string, country: "it" }`
- Output: lista di suggerimenti con `place_id`, `description`
- Usa Google Places Autocomplete API

**Endpoint 2**: `POST /place-details`
- Input: `{ place_id: string }`
- Output: `{ formatted_address, lat, lng, address_components }`
- Parsa i componenti in address_line, city, postal_code, province

**Endpoint 3**: `POST /directions`
- Input: `{ waypoints: [{lat, lng}...] }`
- Output: `{ legs: [{ distance_m, duration_s, start_address, end_address }...], total_duration_s, total_distance_m }`
- Usa Google Directions API con modo `driving`

Tutte le chiamate autenticate (JWT check) e filtrate per company_id.

---

## 3. Componente `AddressAutocomplete`

Nuovo componente riutilizzabile: `src/components/shared/AddressAutocomplete.tsx`

- Campo input con debounce (300ms)
- Dropdown con suggerimenti da `maps-proxy/autocomplete`
- Al click su un suggerimento: chiama `maps-proxy/place-details` e popola i campi
- Sotto il campo: chip con indirizzo formattato + pulsante "X" per cancellare
- Fallback: se API non risponde, mostra campi manuali (address_line + city)

---

## 4. Componente `AddressMapPreview`

Nuovo componente: `src/components/shared/AddressMapPreview.tsx`

- Mini mappa Google Maps Embed (iframe statico, niente SDK pesante)
- URL: `https://www.google.com/maps/embed/v1/place?key=...&q=lat,lng`
- Pulsanti sotto la mappa:
  - "Apri in Google Maps" (link esterno)
  - "Copia indirizzo" (clipboard)
  - "Naviga" (deep link `google.navigation:q=lat,lng` su mobile, Google Maps URL su desktop)

---

## 5. Modifica `MarketingAppointmentDialog`

Nel tab "Appuntamento", aggiungere nella colonna sinistra (sotto Descrizione):

- **Sezione "Luogo"** con:
  - `AddressAutocomplete` (campo principale)
  - Campi strutturati espandibili (collapsible): Via, Citta, CAP, Provincia, Note indirizzo
  - `AddressMapPreview` (appare solo se lat/lng presenti)

- **Salvataggio**: i campi indirizzo vengono salvati insieme all'appuntamento nel payload

---

## 6. Vista Giorno: Travel Time Pills

### Modifica `MarketingCalendarDayView`

- Riceve nuova prop `travelLegs` (opzionale)
- Tra due appuntamenti consecutivi con coordinate, mostra una pill:
  - Icona auto + "18 min - 12 km"
  - Se incompatibile (arrivo dopo inizio): pill rossa con warning "Ritardo stimato: 8 min"
- Se un appuntamento non ha coordinate: badge giallo "Indirizzo mancante"

### Modifica `MarketingCalendar` (pagina)

- Quando `calendarView === "day"`, dopo aver filtrato gli appuntamenti:
  - Raccoglie quelli con coordinate valide per l'utente selezionato
  - Chiama `maps-proxy/directions` con i waypoints ordinati per orario
  - Passa i risultati come `travelLegs` alla DayView
  - Caching: salva in state i risultati per data+utente, ricalcola solo se cambiano

---

## 7. Punto di partenza configurabile

Nella pagina calendario giorno, sopra la griglia, aggiungere un selettore:

- "Parti da: Sede azienda | Indirizzo personalizzato | Ultimo appuntamento"
- **Sede azienda**: usa `companies.operational_address` + geocodifica al volo
- **Personalizzato**: campo con `AddressAutocomplete`, coordinate salvate in localStorage
- **Ultimo appuntamento**: prende l'ultimo appuntamento del giorno precedente (stesso utente)

Il punto di partenza diventa il primo waypoint nel calcolo directions.

---

## 8. Multi-utente

- Il calcolo route e gia filtrato per `assigned_to` (i filtri esistenti nel pannello laterale lo gestiscono)
- In vista admin: selezionando un utente nel filtro, i travel times si ricalcolano per quell'utente
- Se nessun utente filtrato e ci sono appuntamenti di utenti diversi: non mostrare travel times (ambiguo)

---

## Riepilogo file

| File | Azione |
|------|--------|
| Database | Migrazione: 10 colonne indirizzo su `appointments` |
| `supabase/functions/maps-proxy/index.ts` | Nuovo: proxy Google Maps (autocomplete, details, directions) |
| `supabase/config.toml` | Aggiornamento: config JWT per maps-proxy |
| `src/components/shared/AddressAutocomplete.tsx` | Nuovo: input autocomplete indirizzi |
| `src/components/shared/AddressMapPreview.tsx` | Nuovo: mini mappa + azioni |
| `src/components/marketing/MarketingAppointmentDialog.tsx` | Modifica: sezione Luogo con autocomplete + mappa |
| `src/components/marketing/MarketingCalendarDayView.tsx` | Modifica: travel time pills tra appuntamenti |
| `src/pages/azienda/marketing/MarketingCalendar.tsx` | Modifica: fetch directions, punto di partenza, passa travelLegs |

### Sequenza implementazione
1. Richiedere `GOOGLE_MAPS_API_KEY` come secret
2. Migrazione database (colonne indirizzo)
3. Edge function `maps-proxy`
4. Componenti `AddressAutocomplete` + `AddressMapPreview`
5. Integrazione nel dialog appuntamento
6. Travel time pills nella vista giorno
7. Punto di partenza configurabile
