

# Audit Enterprise - Sezioni Calendario e Clienti

## Stato Attuale (AS-IS)

### Calendario
La sezione Calendario e' funzionalmente completa con:
- 4 viste: Mese, Settimana (mobile-friendly con collapsible), Heatmap (con statistiche carico), Gantt (con drag & drop dnd-kit)
- Filtri: stato ordine, cliente, operaio, squadra esterna
- Appuntamenti integrati con dialog CRUD
- EditOrderDatesDialog per modifica rapida date
- LeadTimeStats con calcolo lead time medio/min/max
- DraggableOrderBar con tooltip e rischio logistico
- Utility centralizzate in `calendarUtils.ts` (hasLogisticRisk, getEmployeeInitials)
- Tipi centralizzati in `types/calendar.ts`
- Multi-tenancy con effectiveCompany

### Clienti
La sezione Clienti comprende:
- Lista clienti (492 righe) con ricerca, import/export CSV, reset password, delete con protezione ordini
- Dettaglio cliente (363 righe) con form modifica, storico ordini, delete protetta
- Creazione cliente (247 righe) con dialog password generata
- Edge Function `create-customer` per creazione atomica
- Edge Function `reset-customer-password` per reset password
- Multi-tenancy con effectiveCompany

## Problemi Identificati

### P1 - Duplicazione: `APPOINTMENT_ICONS` in 2 file
**File**: `CalendarMonthView.tsx` (righe 38-44), `CalendarWeekView.tsx` (righe 40-46)
**Problema**: Mappa identica `{ sopralluogo: Search, consegna: Truck, riunione: Users, cliente: UserCheck, generico: CalendarClock }` copiata in 2 file.
**Fix**: Estrarre in `calendarUtils.ts` e importare in entrambi.

### P1 - Duplicazione: `weekDays` array in 3 file
**File**: `CalendarMonthView.tsx` (riga 89), `CalendarHeatmapView.tsx` (riga 125), `WarehouseCalendarView.tsx` (riga 91)
**Problema**: Array identico `["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"]` definito 3 volte.
**Fix**: Estrarre costante `WEEK_DAYS_IT` in `calendarUtils.ts` e importare ovunque.

### P1 - Duplicazione: logica mapping appointment per editing in 2 file
**File**: `CalendarMonthView.tsx` (righe 149-154), `CalendarWeekView.tsx` (righe 130-140)
**Problema**: Lo stesso blocco di mapping `setEditingAppointment({ id, title, description, appointment_date, appointment_time, appointment_type, assigned_to, order_id, is_completed })` e' copiato identico in entrambi i file.
**Fix**: Estrarre funzione utility `mapAppointmentToEditData(apt: CalendarAppointment): AppointmentData` in `calendarUtils.ts`.

### P1 - Duplicazione: state pattern `[editingOrder, editingAppointment, appointmentDialogOpen]` in 2 file
**File**: `CalendarMonthView.tsx` (righe 59-61), `CalendarWeekView.tsx` (righe 55-57)
**Problema**: Lo stesso pattern di 3 state hooks per gestire editing ordini e appuntamenti e' ripetuto in 2 file. Il boilerplate di gestione (setState + dialog open/close + AppointmentDialog rendering) e' identico.
**Stato**: Documentato come candidato per un custom hook futuro (`useCalendarEditing`). L'estrazione della funzione `mapAppointmentToEditData` riduce gia' la duplicazione piu' critica. Nessun intervento strutturale per minimizzare rischio regressione.

### P2 - `CalendarEvent` interface locale in MonthView
**File**: `CalendarMonthView.tsx` (righe 31-36)
**Problema**: Tipo `CalendarEvent` definito localmente. Il WeekView usa `WeekEvent` (righe 34-38) con struttura simile ma non identica (aggiunge tipo "lavoro"). Sono divergenze reali.
**Stato**: Le interfacce hanno campi diversi per viste diverse. Nessun intervento.

### P2 - `CustomerWithOrders` interface locale in CustomersList
**File**: `CustomersList.tsx` (righe 27-38)
**Problema**: Tipo definito localmente. Usato solo in questo file. Non duplicato altrove.
**Stato**: Accettabile. Nessun intervento.

### P2 - CompanyCustomerDetail: query ordini senza company_id filter
**File**: `CompanyCustomerDetail.tsx` (righe 61-72)
**Problema**: La query ordini filtra solo per `customer_id` senza filtrare per `company_id`. Tuttavia, RLS sulla tabella `orders` garantisce l'isolamento multi-tenant. Non e' un bug di sicurezza ma una best practice mancante per consistenza.
**Fix**: Aggiungere `.eq("company_id", effectiveCompany.id)` alla query ordini per coerenza architetturale (defense in depth), aggiungendo anche la dipendenza dalla query key.

---

## Piano Interventi

### Intervento 1 - Estendere `calendarUtils.ts` con costanti e utility condivise

Aggiornare `src/lib/calendarUtils.ts` con:
- `WEEK_DAYS_IT` costante array
- `APPOINTMENT_ICONS` mappa (con import icone lucide necessarie)
- `mapAppointmentToEditData(apt: CalendarAppointment): AppointmentData` funzione di mapping

### Intervento 2 - Aggiornare CalendarMonthView.tsx
- Rimuovere `APPOINTMENT_ICONS` locale (righe 38-44)
- Rimuovere `weekDays` locale (riga 89)
- Importare `APPOINTMENT_ICONS`, `WEEK_DAYS_IT`, `mapAppointmentToEditData` da `calendarUtils.ts`
- Usare `mapAppointmentToEditData` nel click handler degli appuntamenti

### Intervento 3 - Aggiornare CalendarWeekView.tsx
- Rimuovere `APPOINTMENT_ICONS` locale (righe 40-46)
- Importare `APPOINTMENT_ICONS`, `mapAppointmentToEditData` da `calendarUtils.ts`
- Usare `mapAppointmentToEditData` nel click handler degli appuntamenti

### Intervento 4 - Aggiornare CalendarHeatmapView.tsx
- Rimuovere `weekDays` locale (riga 125)
- Importare `WEEK_DAYS_IT` da `calendarUtils.ts`

### Intervento 5 - Aggiornare WarehouseCalendarView.tsx
- Rimuovere `weekDays` locale (riga 91)
- Importare `WEEK_DAYS_IT` da `calendarUtils.ts`

### Intervento 6 - CompanyCustomerDetail: defense-in-depth su query ordini
- Aggiungere filtro `company_id` alla query ordini
- Aggiungere `effectiveCompany?.id` alla queryKey per invalidazione corretta
- Aggiungere `enabled: !!id && !!effectiveCompany?.id`

---

## Checklist Sicurezza e Multi-Tenancy

| Area | Stato |
|------|-------|
| company_id su query calendar-orders | OK |
| company_id su query appointments | OK |
| company_id su query order-statuses | OK |
| company_id su query employees-filter | OK |
| company_id su query external-teams-filter | OK |
| company_id su query customers-list | OK |
| company_id su query customer-detail (profilo) | N/A (query per ID + RLS) |
| company_id su query customer-orders | MIGLIORATO (Intervento 6) |
| company_id su insert customer (edge function) | OK |
| company_id su import CSV clienti | OK |
| company_id su export CSV clienti | OK (filtra su dati gia' caricati) |
| RLS su orders | OK |
| RLS su appointments | OK |
| RLS su profiles | OK |
| Validazione input (nome, cognome, email) | OK |
| Nessuna API key esposta | OK |
| effectiveCompany per impersonificazione | OK |
| Delete cliente protetta (ordini > 0 bloccata) | OK |
| Reset password via edge function sicura | OK |

## Checklist Performance

| Area | Stato attuale | Dopo intervento |
|------|--------------|-----------------|
| APPOINTMENT_ICONS | 2 copie | 1 in calendarUtils.ts |
| weekDays array | 3 copie | 1 costante condivisa |
| Mapping appointment edit | 2 copie inline | 1 funzione condivisa |
| Calendar staleTime (5min) | OK | Invariato |
| Customers staleTime (5min) | OK | Invariato |
| Customer orders query | Senza company_id | Con company_id (defense in depth) |

## File Modificati (Previsti)

1. `src/lib/calendarUtils.ts` - aggiunta WEEK_DAYS_IT, APPOINTMENT_ICONS, mapAppointmentToEditData
2. `src/components/calendar/CalendarMonthView.tsx` - import centralizzati
3. `src/components/calendar/CalendarWeekView.tsx` - import centralizzati
4. `src/components/calendar/CalendarHeatmapView.tsx` - import WEEK_DAYS_IT
5. `src/components/warehouse/WarehouseCalendarView.tsx` - import WEEK_DAYS_IT
6. `src/pages/azienda/CompanyCustomerDetail.tsx` - defense-in-depth query ordini

## Note

Nessuna modifica strutturale al database. Nessuna modifica al comportamento funzionale. Tutti gli interventi sono refactor behavior-preserving. La sezione Clienti risulta gia' ben strutturata con separazione pulita tra lista, dettaglio e creazione. Il pattern di editing appuntamenti/ordini nel calendario e' candidato per un custom hook futuro ma l'intervento non viene fatto ora per minimizzare il rischio di regressione.

