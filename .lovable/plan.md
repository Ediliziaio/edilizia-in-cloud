

# Batch 2 — Google Calendar Sync Engine, Busy Slots UI, Appointment Hooks

## Panoramica

Batch 2 implementa tre macro-funzionalità:
1. **Edge function `google-calendar-sync`** — pull busy slots da Google + push/update/delete eventi CRM→Google
2. **Visualizzazione busy slots** nel Calendario CRM (viste Mese, Settimana, Gantt)
3. **Appointment hooks** nel `AppointmentDialog` — sincronizza create/update/delete verso Google

---

## Architettura tecnica

```text
┌─────────────────┐         ┌──────────────────────┐
│  AppointmentDialog │──POST──▶│ google-calendar-sync │
│  (create/update/  │         │   Edge Function       │
│   delete CRM apt) │         │                      │
└─────────────────┘         │  Actions:             │
                             │  • pull-busy-slots    │
┌─────────────────┐         │  • push-event         │
│ Calendar Views   │◀─query─│  • update-event       │
│ (Month/Week)     │  busy  │  • delete-event       │
│ + busy_slots     │  slots │  • full-sync          │
└─────────────────┘         └──────────────────────┘
                                      │
                                      ▼
                             Google Calendar API
                             (events.list / insert
                              / patch / delete)
```

---

## Deliverables (6 file)

### 1. Edge Function: `supabase/functions/google-calendar-sync/index.ts`

Nuova function con le seguenti action (tutte POST autenticata):

| Action | Descrizione |
|--------|------------|
| `pull-busy-slots` | Per un utente: legge eventi dai conflict_calendar_ids (periodo now-7d → now+60d), upsert in `google_calendar_busy_slots`, elimina slot stale |
| `push-event` | Crea evento Google dal CRM appointment, salva mapping in `google_calendar_event_map` |
| `update-event` | Aggiorna evento Google da appointment modificato, usando mapping esistente |
| `delete-event` | Cancella evento Google e rimuove mapping |
| `full-sync` | Esegue pull-busy-slots + aggiorna last_sync_at sulla connessione |

Logica interna:
- Riutilizza `encrypt/decrypt` e `getEncryptionKey` dallo shared helper (duplicato inline per semplicità edge function)
- Auto-refresh token se scaduto (chiama Google token endpoint con refresh_token)
- Costruisce evento Google con: summary configurabile, description con `crm_appointment_id=...` e `crm_sync=true`, location, attendees
- Anti-loop: scrive `crm_last_update` timestamp nella description dell'evento Google
- Gestione errori: se 401/403 → marca connessione come `token_expired`

### 2. Config: `supabase/config.toml`

Aggiungere entry:
```toml
[functions.google-calendar-sync]
verify_jwt = false
```

### 3. Hook nel `AppointmentDialog`: `src/components/appointments/AppointmentDialog.tsx`

Dopo il salvataggio riuscito di un appuntamento:
- Fetch connessione Google dell'utente `assigned_to` (o utente corrente)
- Se connesso e ha `primary_calendar_id`:
  - **Create**: invoca `google-calendar-sync` con action `push-event`
  - **Update**: invoca con action `update-event` (solo se esiste mapping)
  - **Delete**: invoca con action `delete-event` (solo se esiste mapping)
- Le chiamate Google sono fire-and-forget con toast di errore se falliscono (non bloccano il flusso CRM)
- Nuovo hook `useGoogleCalendarSync` per incapsulare la logica

### 4. Hook riutilizzabile: `src/hooks/useGoogleCalendarSync.ts`

```typescript
// Espone:
// - syncToGoogle(action, appointmentId, payload) 
// - pullBusySlots()
// - isGoogleConnected (boolean)
// - googleConnection (data)
```

Queries:
- `google_calendar_connections` per l'utente corrente
- `google_calendar_settings` per primary_calendar_id
- `google_calendar_event_map` per verificare mapping esistente

### 5. Visualizzazione busy slots nel Calendario CRM

**File: `src/pages/azienda/Calendar.tsx`**
- Nuova query `google_calendar_busy_slots` per company + utenti filtrati
- Pulsante "Sync Google" manuale nella toolbar (chiama `full-sync`)
- Passa busy slots alle viste Month e Week

**File: `src/components/calendar/CalendarMonthView.tsx`**
- Nuovo tipo evento `"google_busy"` con colore grigio e icona Google
- Rendering come blocco semi-trasparente con bordo tratteggiato
- Tooltip mostra summary dell'evento Google + "Slot occupato Google"
- Non cliccabile (non apre dialog)

**File: `src/components/calendar/CalendarWeekView.tsx`**
- Stesso rendering dei busy slots come nella Month view
- Badge nella legenda: "Google Calendar (occupato)"

### 6. Badge "Google Synced" sugli appuntamenti

Nelle viste calendario, per ogni appuntamento CRM:
- Query `google_calendar_event_map` per verificare se ha mapping
- Se mappato: piccola icona Google (✓) nel tooltip
- Se errore sync: icona warning nel tooltip

---

## Dettaglio implementativo per file

### `supabase/functions/google-calendar-sync/index.ts`

Struttura:
1. CORS headers + OPTIONS handler
2. Auth: `getUser()` per ottenere userId
3. Switch su action nel body JSON
4. Helper `getValidAccessToken(conn)` — controlla expiry, refresh se necessario
5. `pullBusySlots(userId, companyId)`:
   - Legge settings → conflict_calendar_ids
   - Per ogni calendario: `GET /calendar/v3/calendars/{id}/events?timeMin=...&timeMax=...&singleEvents=true`
   - Upsert risultati in `google_calendar_busy_slots` (ON CONFLICT google_event_id)
   - Delete slots che non sono più presenti (stale cleanup)
   - Update `last_sync_at` sulla connessione
6. `pushEvent(userId, companyId, appointmentId)`:
   - Legge appointment da DB
   - Legge settings → primary_calendar_id
   - `POST /calendar/v3/calendars/{calId}/events` con body costruito
   - Salva mapping in `google_calendar_event_map`
7. `updateEvent(userId, companyId, appointmentId)`:
   - Legge mapping → google_event_id
   - Legge appointment aggiornato
   - `PATCH /calendar/v3/calendars/{calId}/events/{eventId}`
   - Aggiorna etag e last_synced_at nel mapping
8. `deleteEvent(userId, companyId, appointmentId)`:
   - Legge mapping → google_event_id + google_calendar_id
   - `DELETE /calendar/v3/calendars/{calId}/events/{eventId}`
   - Rimuove riga da event_map

### `src/hooks/useGoogleCalendarSync.ts`

- Query cached della connessione e settings
- Funzioni wrapper che invocano edge function
- Gestione errori con toast
- `checkMapping(appointmentId)` → query event_map

### `src/components/appointments/AppointmentDialog.tsx` modifiche

- Import `useGoogleCalendarSync`
- In `handleSave` dopo success: if connected → push/update
- In `handleDelete` dopo success: if mapping exists → delete
- Chiamate async non-bloccanti (fire-and-forget con catch per toast errore)

### Viste calendario — modifiche

Nuova prop `busySlots` passata da Calendar.tsx.
Tipo:
```typescript
interface GoogleBusySlot {
  id: string;
  start_at: string;
  end_at: string;
  summary: string | null;
  is_all_day: boolean;
  user_id: string;
}
```

Rendering: blocchi grigi con bordo tratteggiato, non interattivi.

---

## Riepilogo file modificati/creati

| File | Azione |
|------|--------|
| `supabase/functions/google-calendar-sync/index.ts` | **Nuovo** — sync engine |
| `supabase/config.toml` | **Modifica** — aggiunta entry |
| `src/hooks/useGoogleCalendarSync.ts` | **Nuovo** — hook riutilizzabile |
| `src/components/appointments/AppointmentDialog.tsx` | **Modifica** — hooks push/update/delete |
| `src/pages/azienda/Calendar.tsx` | **Modifica** — query busy slots + pulsante sync |
| `src/components/calendar/CalendarMonthView.tsx` | **Modifica** — rendering busy slots |
| `src/components/calendar/CalendarWeekView.tsx` | **Modifica** — rendering busy slots |
| `src/types/calendar.ts` | **Modifica** — tipo GoogleBusySlot |
| `src/lib/calendarUtils.ts` | **Modifica** — helper per busy slot rendering |

