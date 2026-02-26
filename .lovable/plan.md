

# Cron Job 5min + Audit Trail per Google Calendar Sync

## Modifiche

### 1. Nuova tabella: `google_calendar_sync_log`
Tabella dedicata per salvare ogni esecuzione del cron sync.

```sql
CREATE TABLE public.google_calendar_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  connections_found integer NOT NULL DEFAULT 0,
  connections_synced integer NOT NULL DEFAULT 0,
  connections_failed integer NOT NULL DEFAULT 0,
  results jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'running', -- running, completed, failed
  error_message text
);
```

No RLS needed — only accessed by service role from edge function.

### 2. Modifica `supabase/functions/google-calendar-sync/index.ts`
Update `cronFullSync()` to:
- Create a log row at start (`status = 'running'`)
- Update it at end with `completed_at`, counts, results array, and final status
- On error, mark `status = 'failed'` with error message

### 3. Aggiorna cron job da 15min a 5min
SQL insert (non migration) to:
- `cron.unschedule('google-calendar-auto-sync')` — remove old schedule
- `cron.schedule(...)` with `*/5 * * * *`

## File da modificare

| File | Azione |
|------|--------|
| Migration SQL | Crea tabella `google_calendar_sync_log` |
| `supabase/functions/google-calendar-sync/index.ts` | Modifica `cronFullSync` per scrivere audit log |
| SQL insert (non migration) | Reschedule cron a 5 minuti |

