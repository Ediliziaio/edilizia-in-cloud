

# Cron Job per Google Calendar Full-Sync Automatico

## Problema
Il sync attuale richiede che un utente autenticato clicchi "Sync Google" manualmente. Serve un cron job che esegua `full-sync` per **tutti** gli utenti connessi ogni 15 minuti.

## Approccio

### 1. Nuova Edge Function: `google-calendar-cron-sync`

Una function dedicata (senza autenticazione utente) che:
- Viene invocata dal cron job con un semplice header di autorizzazione (anon key)
- Legge tutte le righe da `google_calendar_connections` con `status = 'connected'`
- Per ognuna, invoca internamente le stesse funzioni `pullBusySlots(userId, companyId)` e `reconcilePrimary(userId, companyId)` — duplicandone la logica inline oppure richiamando la function esistente via HTTP
- Logga risultati per utente e ritorna un riepilogo

**Scelta architetturale**: la function chiamerà internamente `google-calendar-sync` via HTTP con un service-role token per ogni connessione, così riusa tutta la logica esistente senza duplicarla.

### 2. Modifica `google-calendar-sync/index.ts`

Aggiungere una nuova action `"cron-full-sync"` che:
- Accetta autenticazione via service role (non richiede JWT utente)
- Riceve `userId` e `companyId` nel body (passati dalla cron function)
- Esegue `fullSync(userId, companyId)` direttamente

Questo evita di creare una function separata: il cron job chiama direttamente la stessa function con action speciale.

### 3. Cron Job via `pg_cron` + `pg_net`

SQL insert (non migration) per schedulare ogni 15 minuti:
```sql
SELECT cron.schedule(
  'google-calendar-auto-sync',
  '*/15 * * * *',
  $$ SELECT net.http_post(
    url := 'https://guqgszwelffntrgtsycm.supabase.co/functions/v1/google-calendar-sync',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <anon_key>"}'::jsonb,
    body := '{"action":"cron-full-sync"}'::jsonb
  ) AS request_id; $$
);
```

### 4. Logica `cron-full-sync` nell'edge function

Dentro il main handler, quando `action === "cron-full-sync"`:
- Verifica che la richiesta provenga dal service role o anon key (non serve un utente specifico)
- Usa `getSupabaseAdmin()` per leggere tutte le connessioni attive
- Per ogni connessione: esegue `pullBusySlots` + `reconcilePrimary` con i rispettivi `user_id` e `company_id`
- Ritorna un array di risultati

## File da modificare/creare

| File | Azione |
|------|--------|
| `supabase/functions/google-calendar-sync/index.ts` | **Modifica** — aggiungere action `cron-full-sync` con loop su tutte le connessioni |
| Database (SQL insert, non migration) | **Nuovo** — cron job `pg_cron` ogni 15 minuti |

## Dettaglio implementativo

### Action `cron-full-sync` nel main handler

```text
case "cron-full-sync":
  // Skip JWT user validation — use service role
  admin = getSupabaseAdmin()
  connections = SELECT * FROM google_calendar_connections WHERE status = 'connected'
  results = []
  for each conn:
    pull = pullBusySlots(conn.user_id, conn.company_id)
    reconcile = reconcilePrimary(conn.user_id, conn.company_id)
    results.push({ userId, companyId, pull, reconcile })
  return json({ synced: results.length, results })
```

Il cron-full-sync bypass the JWT check (il cron job non ha un utente autenticato) ma valida che la richiesta contenga almeno l'anon key.

