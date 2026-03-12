

# Monitoring automatico tabelle senza RLS

## Architettura

Il sistema si compone di tre parti:

1. **Event trigger PostgreSQL** (`ddl_command_end`): intercetta ogni `CREATE TABLE` e verifica se RLS e' abilitata. Se non lo e', inserisce un alert nella tabella `system_health_metrics` con `metric_type = 'rls_missing'`.

2. **Edge function `check-rls-status`**: scansiona tutte le tabelle pubbliche e segnala quelle senza RLS. Invocabile on-demand dal pannello admin e schedulabile via pg_cron (giornaliero).

3. **Widget nel pannello Admin System Health**: mostra gli alert `rls_missing` con nome tabella, data rilevamento e stato (open/resolved). Include un pulsante per lanciare la scansione manuale.

---

## Dettaglio tecnico

### Migration SQL

```sql
-- 1. Funzione che controlla RLS sulla tabella appena creata
CREATE OR REPLACE FUNCTION public.check_new_table_rls()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE object_type = 'table'
  LOOP
    -- Controlla se RLS e' abilitata
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.oid = obj.objid
      AND n.nspname = 'public'
      AND c.relrowsecurity = true
    ) THEN
      INSERT INTO system_health_metrics (
        metric_type, function_name, error_message, metadata
      ) VALUES (
        'rls_missing',
        'ddl_trigger',
        'Tabella creata senza RLS: ' || obj.object_identity,
        jsonb_build_object('table_name', obj.object_identity, 'event', 'create_table')
      );
    END IF;
  END LOOP;
END;
$$;

-- 2. Event trigger
CREATE EVENT TRIGGER check_rls_on_create_table
ON ddl_command_end
WHEN TAG IN ('CREATE TABLE')
EXECUTE FUNCTION public.check_new_table_rls();
```

### Edge function `check-rls-status`

Nuova edge function che:
- Query `pg_class` + `pg_namespace` per trovare tutte le tabelle in `public` senza `relrowsecurity = true`
- Inserisce un record `rls_missing` in `system_health_metrics` per ogni tabella trovata
- Restituisce la lista delle tabelle senza RLS
- Protetta da `requireAuth` + `requireRole(['super_admin'])`

### Widget AdminSystemHealth

Aggiungere una sezione "RLS Monitor" che:
- Mostra il conteggio di tabelle senza RLS (query su `system_health_metrics` con `metric_type = 'rls_missing'`)
- Lista le tabelle interessate con badge di severita'
- Pulsante "Scansiona ora" che invoca `check-rls-status`

### Cron job (opzionale)

Schedulare `check-rls-status` ogni 24h via pg_cron per scansione periodica.

---

## File coinvolti

| File | Azione |
|------|--------|
| `supabase/migrations/[new].sql` | Event trigger + funzione |
| `supabase/functions/check-rls-status/index.ts` | Edge function scansione |
| `src/components/admin/dashboard/AdminSystemHealth.tsx` | Sezione RLS Monitor |

