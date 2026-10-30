-- I controlli «c'è lavoro?» dei cron senza rileggere le tabelle intere (31/10/2026).
--
-- cron_ha_lavoro('process-automation-queue') gira ogni minuto e cerca le righe
-- con status IN ('pending','waiting'), ma l'indice copriva solo 'pending': ogni
-- minuto rileggeva tutta automation_queue (32.000 righe, 2.626 blocchi, 13 ms;
-- 29.000 letture complete e 762 milioni di righe in 14 giorni).
-- Le due guardie email_classificazione_solo_se_dovuta (ogni 5 minuti) chiedono
-- se c'è un'email con categoria vuota: rileggevano tutta email_inbox (6,6 ms).
-- Due indici parziali, minuscoli: contengono solo le righe ancora da lavorare.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create index if not exists automation_queue_da_lavorare_idx
  on public.automation_queue (execute_at)
  where status in ('pending', 'waiting');

create index if not exists email_inbox_senza_categoria_idx
  on public.email_inbox (id)
  where categoria is null;
