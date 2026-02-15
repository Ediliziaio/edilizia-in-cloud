

# Appuntamenti: Sistema di Gestione dal Calendario e Ordine

## Panoramica

Aggiungere un sistema di appuntamenti che permette di creare eventi come sopralluoghi tecnici, appuntamenti con clienti, consegne, ecc. Gli appuntamenti possono essere collegati a un ordine (opzionale), assegnati a utenti dell'azienda e visualizzati sia nella pagina dettaglio ordine che nel calendario lavori.

## 1. Database: Nuova tabella `appointments`

| Colonna | Tipo | Default | Descrizione |
|---|---|---|---|
| `id` | uuid | gen_random_uuid() | PK |
| `company_id` | uuid | NOT NULL | Tenant isolation |
| `order_id` | uuid | NULL | Collegamento opzionale a un ordine |
| `title` | text | NOT NULL | Es. "Sopralluogo tecnico", "Appuntamento cliente" |
| `description` | text | NULL | Note aggiuntive |
| `appointment_date` | date | NOT NULL | Data dell'appuntamento |
| `appointment_time` | time | NULL | Ora (opzionale) |
| `assigned_to` | uuid | NULL | Utente assegnato (profilo) |
| `appointment_type` | text | 'generico' | Tipo: sopralluogo, consegna, riunione, generico |
| `is_completed` | boolean | false | Completato si/no |
| `created_by` | uuid | NOT NULL | Chi ha creato |
| `created_at` | timestamptz | now() | |
| `updated_at` | timestamptz | now() | |

**RLS Policies:**
- Company admin: ALL sulla propria azienda
- Staff con `can_view_calendar`: SELECT
- Staff con `can_edit_orders`: ALL
- Super admin: ALL

## 2. Nuovo componente: `AppointmentDialog.tsx`

Dialog modale per creare/modificare un appuntamento con:
- **Titolo** (obbligatorio)
- **Tipo** (select: Sopralluogo, Consegna, Riunione, Appuntamento Cliente, Generico)
- **Data** (obbligatorio, date picker)
- **Ora** (opzionale, input time)
- **Assegnato a** (select con utenti/dipendenti dell'azienda)
- **Ordine collegato** (select opzionale, visibile solo dal calendario; pre-compilato se aperto da OrderDetail)
- **Note** (textarea opzionale)

Pattern identico a `TaskDialog.tsx` per coerenza.

## 3. Nuovo componente: `LinkedAppointments.tsx`

Componente riutilizzabile (come `LinkedTasks`) che mostra gli appuntamenti collegati a un ordine:
- Lista con icona tipo, titolo, data/ora, assegnatario, stato completato
- Bottone "Nuovo Appuntamento" che apre il dialog
- Click su appuntamento per modificarlo
- Possibilita di segnare come completato con checkbox

## 4. Integrazione in OrderDetail.tsx

Aggiungere il componente `LinkedAppointments` nella colonna destra, accanto alle attivita collegate:

```text
[Note Interne]
[Attivita Collegate]     <-- gia esistente
[Appuntamenti]           <-- NUOVO
```

## 5. Integrazione nel Calendario

### 5.1 Fetch appuntamenti
In `Calendar.tsx`, aggiungere una query per caricare gli appuntamenti e unirli agli eventi del calendario.

### 5.2 Visualizzazione nelle viste Mese e Settimana
Gli appuntamenti appariranno come eventi con un'icona distinta (es. CalendarClock) e colore diverso dagli ordini (es. viola/indaco) per distinguerli visivamente.

### 5.3 Bottone "Nuovo Appuntamento"
Aggiungere un bottone nella toolbar del calendario per creare appuntamenti direttamente (senza ordine collegato obbligatorio).

## 6. File da creare/modificare

**Nuovi file:**
- `supabase/migrations/..._create_appointments.sql` - Tabella + RLS
- `src/components/appointments/AppointmentDialog.tsx` - Dialog CRUD
- `src/components/appointments/LinkedAppointments.tsx` - Lista per ordine

**File da modificare:**
- `src/pages/azienda/OrderDetail.tsx` - Aggiungere `LinkedAppointments`
- `src/pages/azienda/Calendar.tsx` - Query + bottone + passaggio dati
- `src/components/calendar/CalendarMonthView.tsx` - Render appuntamenti
- `src/components/calendar/CalendarWeekView.tsx` - Render appuntamenti
- `src/types/calendar.ts` - Tipo `CalendarAppointment`

## 7. Dettagli tecnici

### Tipi appuntamento con icone
| Tipo | Label | Icona |
|---|---|---|
| sopralluogo | Sopralluogo | Search |
| consegna | Consegna | Truck |
| riunione | Riunione | Users |
| cliente | Appuntamento Cliente | UserCheck |
| generico | Generico | CalendarClock |

### Query key per invalidazione
`["appointments", companyId]` e `["order-appointments", orderId]` per mantenere la sincronizzazione.

## 8. Impatto

- Nessun dato esistente viene toccato
- La funzionalita e completamente nuova e additiva
- Gli appuntamenti sono indipendenti dalle task (sistema separato pensato per eventi con data/ora specifica)
