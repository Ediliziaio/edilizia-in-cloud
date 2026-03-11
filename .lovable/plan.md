

# Piano: UserCalendarTab — Sincronizzazione Calendario Utente

## Panoramica
Sostituire lo stub "Coming Soon" con un tab completo per gestire la connessione Google Calendar e le preferenze di sincronizzazione per ogni utente.

## Modifiche

### 1. Migrazione DB — `user_calendar_preferences`
Una tabella con: `user_id` (UNIQUE), `company_id`, `sync_enabled`, `sync_direction` (to_google/from_google/both), `default_calendar_id/name`, `buffer_before_min`, `buffer_after_min`, `block_busy_slots`. RLS basata su company_id via profiles. CHECK constraints immutabili sui buffer (>= 0) e sync_direction.

### 2. Hook — `src/hooks/useUserCalendarPrefs.ts`
- `useUserCalendarPrefs(userId)`: query su `user_calendar_preferences`, fallback a default se non esiste
- `useGoogleCalendarConnection(userId, companyId)`: query su `google_calendar_connections` esistente per status/email
- `useSaveUserCalendarPrefs(userId, companyId)`: upsert preferenze
- `useDisconnectGoogleCalendar(userId, companyId)`: delete da `google_calendar_connections`

### 3. Componente — `src/components/users/UserCalendarTab.tsx`
Sezioni:
- **Google Calendar**: badge connesso/non connesso con email, pulsante collega (solo per proprio profilo, redirect a calendari-marketing con `?return=`) o disconnetti (AlertDialog di conferma)
- **Outlook**: card "In arrivo" con badge
- **Preferenze sync** (visibili solo se connesso): toggle sync attiva, selezione direzione (3 opzioni con icone), buffer prima/dopo (select 0-60min), toggle blocca slot occupati
- **Link rapido** a Impostazioni → Calendari Marketing

### File impattati
- Migrazione DB (nuova tabella `user_calendar_preferences`)
- `src/hooks/useUserCalendarPrefs.ts` (nuovo)
- `src/components/users/UserCalendarTab.tsx` (sostituzione completa)

### Note
- Riusa `formatRelativeTime` da `src/lib/formatters.ts` (già esistente)
- Riusa infrastruttura OAuth Google Calendar esistente in `MarketingCalendarsConfig`
- Il flusso OAuth non può essere avviato per conto di un altro utente — il pulsante "Collega" appare solo sul proprio profilo (`isOwnProfile = userId === authUser?.id`)

