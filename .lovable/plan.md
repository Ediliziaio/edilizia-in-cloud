

# Indirizzo nel Calendario + Opportunita + Sync Contatto

## Panoramica

Tre funzionalita da implementare:

1. **Indirizzo nel CalendarDialog**: quando crei/modifichi un calendario, puoi associare un indirizzo base (sede, casa, ufficio)
2. **AddressAutocomplete nell'OpportunityAppointmentTab**: stessa esperienza gia presente nel MarketingAppointmentDialog, con mappa e distanza in tempo reale dal calendario
3. **Sync indirizzo verso il contatto**: quando inserisci un indirizzo nell'appuntamento, i campi vengono salvati automaticamente anche nel contatto CRM associato

---

## 1. Migrazione Database

Aggiungere colonne indirizzo alla tabella `marketing_calendars`:

| Colonna | Tipo | Default |
|---------|------|---------|
| `base_address_line` | text | null |
| `base_address_city` | text | null |
| `base_address_postal_code` | text | null |
| `base_address_province` | text | null |
| `base_address_country` | text | 'IT' |
| `base_formatted_address` | text | null |
| `base_lat` | double precision | null |
| `base_lng` | double precision | null |
| `base_place_id` | text | null |

Queste colonne rappresentano il "punto di partenza" del calendario (indirizzo base dell'utente/azienda).

---

## 2. CalendarDialog: aggiungere sezione indirizzo

**File**: `src/components/settings/CalendarDialog.tsx`

- Aggiornare `CalendarFormData` per includere i campi `base_address_*`
- Aggiungere il componente `AddressAutocomplete` (gia esistente in `src/components/shared/`) sotto la sezione "Durata dell'incontro"
- Label: "Indirizzo base del calendario" con tooltip "L'indirizzo da cui partono i calcoli di percorrenza (es. sede, ufficio, casa)"
- Se presente, mostrare `AddressMapPreview` sotto

**File**: `src/components/settings/MarketingCalendarsConfig.tsx`

- Aggiornare `createCalendar` e `updateCalendar` per salvare/aggiornare i campi `base_address_*`
- Passare `initialData` con i campi indirizzo quando si modifica un calendario esistente

---

## 3. OpportunityAppointmentTab: AddressAutocomplete + distanza real-time

**File**: `src/components/opportunities/OpportunityAppointmentTab.tsx`

Modifiche:
- Sostituire il campo "Luogo dell'incontro" (Input semplice) con `AddressAutocomplete`
- Aggiungere `AddressMapPreview` visibile quando lat/lng sono presenti
- Salvare i campi indirizzo nel payload INSERT dell'appuntamento (come gia fa il MarketingAppointmentDialog)
- **Distanza dal calendario**: quando l'utente seleziona un calendario e inserisce un indirizzo:
  - Recuperare `base_lat`/`base_lng` dal calendario selezionato
  - Se entrambi (base + appuntamento) hanno coordinate, chiamare `maps-proxy/directions`
  - Mostrare una pill "18 min - 12 km" sotto la mappa
- **Distanza tra appuntamenti dello stesso giorno**: dopo la selezione della data, fetch degli altri appuntamenti con coordinate per lo stesso giorno/calendario, e mostrare le distanze tra di essi in una mini lista

---

## 4. Sync indirizzo verso il contatto CRM

Quando un appuntamento viene salvato (sia da OpportunityAppointmentTab che da MarketingAppointmentDialog):

- Se il contatto (`contact_id`) esiste e i campi indirizzo del contatto (`address`, `city`, `postal_code`, `province`, `country`) sono vuoti
- Oppure sempre (sovrascrittura) se l'indirizzo e stato inserito tramite autocomplete
- Aggiornare `marketing_contacts` con:
  - `address` = `address_line`
  - `city` = `address_city`
  - `postal_code` = `address_postal_code`
  - `province` = `address_province`
  - `country` = `address_country`

Questa logica viene aggiunta direttamente nella mutation di salvataggio (dopo l'INSERT dell'appuntamento).

---

## 5. Vista Giorno: distanza dal punto base del calendario

**File**: `src/pages/azienda/marketing/MarketingCalendar.tsx`

Il calcolo travel time gia implementato usa i waypoint tra appuntamenti. Aggiungere:
- Il primo waypoint puo essere l'indirizzo base del calendario selezionato (se presente)
- Se il filtro calendario e attivo, usare `base_lat`/`base_lng` di quel calendario come punto di partenza
- Se nessun calendario filtrato, fallback all'indirizzo operativo dell'azienda (`companies.operational_address`)

---

## Riepilogo file

| File | Azione |
|------|--------|
| Database | Migrazione: 9 colonne `base_address_*` su `marketing_calendars` |
| `src/components/settings/CalendarDialog.tsx` | Modifica: AddressAutocomplete + AddressMapPreview per indirizzo base |
| `src/components/settings/MarketingCalendarsConfig.tsx` | Modifica: salva/carica campi indirizzo nel CRUD calendario |
| `src/components/opportunities/OpportunityAppointmentTab.tsx` | Modifica: AddressAutocomplete, mappa, distanza real-time, sync contatto |
| `src/components/marketing/MarketingAppointmentDialog.tsx` | Modifica: aggiungere sync indirizzo contatto al salvataggio |
| `src/pages/azienda/marketing/MarketingCalendar.tsx` | Modifica: punto di partenza dal calendario base |

### Sequenza
1. Migrazione DB (colonne `base_address_*` su `marketing_calendars`)
2. CalendarDialog + MarketingCalendarsConfig (indirizzo base)
3. OpportunityAppointmentTab (autocomplete + distanza + sync contatto)
4. MarketingAppointmentDialog (sync contatto)
5. MarketingCalendar (punto partenza dal calendario)

