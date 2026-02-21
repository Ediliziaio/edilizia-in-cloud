
# Implementazione Trigger "Scadenza in avvicinamento" e Test Automazioni

## Panoramica
Tre interventi:
1. Aggiungere il trigger `due_date_approaching` nella UI con configurazione (quale data monitorare, quanti giorni prima)
2. Creare una edge function `check-due-dates` che gira come cron job giornaliero e lancia `execute_automation` per le commesse con scadenze vicine
3. Testare il flusso completo delle automazioni

---

## 1. Frontend - Aggiungere trigger nella UI

### `src/components/settings/AutomationDialog.tsx`
- Aggiungere `{ value: "due_date_approaching", label: "Scadenza in avvicinamento" }` alla lista `TRIGGER_TYPES`
- Aggiungere il blocco di configurazione specifico per questo trigger (visibile quando selezionato):
  - **Tipo di data da monitorare**: select con opzioni `expected_date` (Data consegna prevista), `work_start_date` (Data inizio lavori), `work_end_date` (Data fine lavori)
  - **Giorni prima della scadenza**: input numerico (default: 3)

### `src/components/settings/AutomationsConfig.tsx`
- La label `due_date_approaching` e gia presente in `TRIGGER_LABELS` (riga 21) - nessuna modifica necessaria

---

## 2. Backend - Edge Function cron job

### Nuova edge function: `supabase/functions/check-due-dates/index.ts`
Logica:
1. Recuperare tutte le automazioni attive con `trigger_type = 'due_date_approaching'`
2. Per ogni automazione, leggere dalla `trigger_config`:
   - `date_field`: quale colonna data controllare (`expected_date`, `work_start_date`, `work_end_date`)
   - `days_before`: quanti giorni prima attivare (default 3)
3. Cercare le commesse della stessa `company_id` dove la data specificata e entro i prossimi `days_before` giorni (e non passata)
4. Per ogni commessa trovata, chiamare la funzione database `execute_automation` con parametri (`'due_date_approaching'`, order_id, company_id)
5. Per evitare duplicati, controllare se esiste gia un task creato da questa automazione per questa commessa con scadenza simile (opzionale: usare un campo `automation_id` + `order_id` come deduplicazione)

### `supabase/config.toml`
- Aggiungere configurazione per la nuova funzione:
```
[functions.check-due-dates]
verify_jwt = false
```

### Database - Aggiornare `execute_automation`
La funzione `execute_automation` gia supporta qualsiasi `trigger_type` grazie al loop generico sulle automazioni. Deve solo essere aggiornato per filtrare anche per `trigger_config` nel caso del `due_date_approaching` (il trigger non ha condizioni di stato specifiche da matchare a livello di trigger_config, quindi funziona gia cosi com'e).

### Cron Job
Dopo il deploy della edge function, creare un cron job con `pg_cron` + `pg_net` che chiama la funzione ogni giorno alle 07:00:
```sql
SELECT cron.schedule(
  'check-due-dates-daily',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url:='https://guqgszwelffntrgtsycm.supabase.co/functions/v1/check-due-dates',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer ANON_KEY"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
```

---

## 3. Test del flusso automazioni

Dopo l'implementazione, tester il flusso con la edge function curl tool:
1. Verificare che le automazioni esistenti con trigger `order_status_change` funzionino correttamente
2. Testare la nuova edge function `check-due-dates` chiamandola direttamente

---

## File coinvolti

| File | Azione |
|------|--------|
| `src/components/settings/AutomationDialog.tsx` | Aggiungere trigger + UI config |
| `supabase/functions/check-due-dates/index.ts` | Nuova - cron job per scadenze |
| `supabase/config.toml` | Aggiungere config funzione |
| Database (insert SQL) | Cron job con pg_cron |
