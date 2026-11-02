-- Il piano di volo di Silvio sulle commesse, ogni mattina alle 6:20 di Roma (fase 5, lotto 5.3).
--
-- NON è in supabase/migrations apposta: va acceso DOPO che la edge function silvio-piano-volo
-- è pubblicata (CLAUDE.md: un cron che dipende da una funzione si accende con una migrazione
-- successiva al deploy). Ordine:
--   1. 20281112140000_silvio_autonomia e 20281112141000_silvio_piano_volo — vanno col push;
--   2. pubblicazione di silvio-piano-volo (job «Deploy edge functions» al push su main);
--   3. prova senza effetti: POST {"anteprima": true, "company_id": "<Demo 2>"} con x-cron-secret →
--      nessuna scrittura, nessuna campanella; guardare `anteprima` nella risposta;
--   4. questo file: spostarlo in supabase/migrations, applicarlo con apply_migration e riallineare
--      la versione (controllare prima che 20281112142500 sia libera).
--
-- Una sola volta al giorno: il controllo guarda le fasi che partono fra 1 e 3 giorni lavorativi,
-- quindi un giro al mattino basta; la riga è una per fase e tipo, un secondo giro la aggiorna.
-- La funzione risponde a pg_net entro 5 secondi (serveConMetricheRapida): attesa 15 secondi,
-- segreto dal Vault. Niente email né WhatsApp: proposte sulla commessa e campanella in app.
-- In ora legale le 4:20 UTC sono le 6:20 a Roma; in ora solare le 5:20.

select cron.unschedule(jobid) from cron.job where jobname = 'silvio-piano-volo';

select cron.schedule(
  'silvio-piano-volo',
  '20 4 * * *',
  $$
  select net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/silvio-piano-volo',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $$
);
