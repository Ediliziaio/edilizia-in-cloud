-- File ricostruito il 27/10/2026 dal registro del database (supabase_migrations.schema_migrations).
-- La migrazione era già applicata in produzione con questa versione, ma il file non era mai stato salvato nel repository:
-- il controllo «Supabase Preview» segnalava «Remote migration versions not found in local migrations directory».
-- Sotto c'è l'SQL esattamente come applicato.

set local lock_timeout='3s';set local statement_timeout='60s';
create unique index if not exists sub_assegnazione_unica_tutte_fasi on public.subappaltatori_assegnazioni(operaio_id,order_id,dal) where fase_id is null;
create unique index if not exists sub_assegnazione_unica_fase on public.subappaltatori_assegnazioni(operaio_id,order_id,dal,fase_id) where fase_id is not null;
alter table public.subappaltatori_assegnazioni drop constraint if exists subappaltatori_assegnazioni_operaio_id_order_id_dal_key;
