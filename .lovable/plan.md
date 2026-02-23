
# Audit Enterprise - Sezione Appuntamenti Marketing & Vendite

## Stato Attuale (AS-IS)

La sezione Appuntamenti e' funzionalmente completa con:
- 3 viste calendario (Giorno, Settimana, Mese) + Vista elenco
- Dialog avanzato con tab Appuntamento/Tempo bloccato
- Integrazione Maps API per tempi di percorrenza e distanze
- Filtri laterali per calendari e utenti
- Geocodifica indirizzi con anteprima mappa
- Calcolo ritardi stimati tra appuntamenti consecutivi
- Multi-tenancy con company_id isolato

## Problemi Identificati

### P0 - Bug: contact_name sempre null
**File**: `src/pages/azienda/marketing/MarketingCalendar.tsx` (riga 150)
**Problema**: Il campo `contact_name` e' hardcoded a `null` nell'enrichment degli appuntamenti. Nella vista elenco, la colonna "Contatto" mostra sempre "---".
**Fix**: Fetch dei contatti marketing (`marketing_contacts`) e join in-memory per popolare `contact_name` con nome/cognome del contatto collegato.

### P1 - Duplicazione: interfaccia Appointment in 4 file
**File**: `MarketingCalendarDayView.tsx`, `MarketingCalendarWeekView.tsx`, `MarketingCalendarMonthView.tsx`, `MarketingAppointmentsList.tsx`
**Problema**: L'interfaccia `Appointment` e' definita separatamente in 4 file con variazioni minime (alcuni hanno `is_blocked_slot`, `lat`, `lng`; altri no).
**Fix**: Creare un tipo condiviso in `src/types/marketingCalendar.ts` con tutti i campi e importarlo ovunque.

### P1 - Duplicazione: CALENDAR_COLORS in 3 file
**File**: `MarketingCalendarDayView.tsx`, `MarketingCalendarWeekView.tsx`, `MarketingCalendarMonthView.tsx`
**Problema**: L'array `CALENDAR_COLORS` (6 colori) e' copiato identico in 3 file. Anche la funzione `colorMap` (useMemo) e' duplicata.
**Fix**: Estrarre in `src/lib/marketingCalendarConstants.ts` e importare.

### P1 - Performance: query appuntamenti senza filtro data
**File**: `src/pages/azienda/marketing/MarketingCalendar.tsx` (riga 127-140)
**Problema**: La query carica TUTTI gli appuntamenti dell'azienda senza filtro per intervallo di date. Per aziende con molti appuntamenti, questo diventa un collo di bottiglia.
**Fix**: Aggiungere filtri `.gte("appointment_date", rangeStart)` e `.lte("appointment_date", rangeEnd)` basati sulla vista attuale (giorno: +/-1 giorno, settimana: +/-1 settimana, mese: +/-1 mese). La queryKey deve includere il range.

### P1 - Performance: `now` ricreato ad ogni render
**File**: `src/components/marketing/MarketingAppointmentsList.tsx` (riga 52)
**Problema**: `const now = new Date()` dentro il componente crea un nuovo oggetto ad ogni render, invalidando `useMemo`.
**Fix**: Spostare fuori dal componente o memorizzare con `useMemo`.

### P2 - Duplicazione: HOURS in 2 file
**File**: `MarketingCalendarDayView.tsx` e `MarketingCalendarWeekView.tsx`
**Problema**: `const HOURS = Array.from({ length: 14 }, (_, i) => i + 8)` duplicato.
**Fix**: Estrarre nel file costanti condiviso.

---

## Piano Interventi

### Intervento 1 - Centralizzare tipi e costanti
Creare `src/types/marketingCalendar.ts`:
- Interfaccia `MarketingAppointment` completa (unione di tutti i campi usati)
- Export di `TravelLeg` (attualmente in DayView)

Creare `src/lib/marketingCalendarConstants.ts`:
- `CALENDAR_COLORS`
- `HOURS`
- Helper `buildColorMap(calendarIds: string[])`

Aggiornare i 4 file vista per importare dai file centralizzati e rimuovere le definizioni locali.

### Intervento 2 - Fix contact_name (P0)
File: `src/pages/azienda/marketing/MarketingCalendar.tsx`
- Aggiungere una query per `marketing_contacts` (id, first_name, last_name) filtrata per company_id
- Nell'enrichment (riga 143-153), fare join in-memory: `contact_name = contact ? contact.first_name + " " + contact.last_name : null`
- Limitare la query a 1000 contatti con `limit(1000)` per sicurezza

### Intervento 3 - Filtraggio data sulla query appuntamenti (P1)
File: `src/pages/azienda/marketing/MarketingCalendar.tsx`
- Calcolare `dateRangeStart` e `dateRangeEnd` in base a `calendarView` e `currentDate`:
  - Giorno: -1 giorno / +1 giorno
  - Settimana: weekStart -7 giorni / weekStart +14 giorni
  - Mese: primo del mese precedente / ultimo del mese successivo
- Aggiungere `.gte` e `.lte` alla query
- Includere il range nella queryKey per invalidazione corretta
- Per la vista elenco, usare un range piu' ampio (es. 1 anno avanti)

### Intervento 4 - Fix now in MarketingAppointmentsList (P1)
File: `src/components/marketing/MarketingAppointmentsList.tsx`
- Sostituire `const now = new Date()` con `const todayStr = useMemo(() => new Date().toDateString(), [])` usato come reference stabile per il filtraggio "prossimo"

---

## Checklist Sicurezza e Multi-Tenancy

| Area | Stato |
|------|-------|
| company_id su query appuntamenti | OK |
| company_id su query calendari | OK |
| company_id su query utenti | OK |
| company_id su query contatti (dialog) | OK |
| RLS su tabella appointments | OK |
| Validazione input (titolo, date, orari) | OK |
| Nessuna API key esposta | OK |
| effectiveCompany per impersonificazione | OK |

## Checklist Performance

| Area | Stato attuale | Dopo intervento |
|------|--------------|-----------------|
| Query appuntamenti | Tutti (no filtro data) | Filtro per range visibile |
| Enrichment contatti | Sempre null | Join in-memory con fetch dedicato |
| CALENDAR_COLORS | 3 copie | 1 file condiviso |
| Appointment interface | 4 copie | 1 tipo condiviso |
| now recreation | Ogni render | Stabile |

## File Modificati (Previsti)

1. `src/types/marketingCalendar.ts` (NUOVO) - tipi condivisi
2. `src/lib/marketingCalendarConstants.ts` (NUOVO) - costanti e helper
3. `src/pages/azienda/marketing/MarketingCalendar.tsx` - fix contact_name + filtro data
4. `src/components/marketing/MarketingCalendarDayView.tsx` - import centralizzati
5. `src/components/marketing/MarketingCalendarWeekView.tsx` - import centralizzati
6. `src/components/marketing/MarketingCalendarMonthView.tsx` - import centralizzati
7. `src/components/marketing/MarketingAppointmentsList.tsx` - fix now + import tipo

## Note

Nessuna modifica strutturale al database. Nessuna modifica al comportamento funzionale. Tutti gli interventi sono refactor behavior-preserving con un bug fix critico (contact_name) e ottimizzazioni performance.
