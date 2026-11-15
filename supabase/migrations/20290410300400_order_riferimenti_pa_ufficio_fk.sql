-- 15/11/2026, su richiesta del lotto 3: order_riferimenti_pa.ufficio_id è nata senza
-- chiave esterna perché anagrafica_uffici_pa (lotto 2) non esisteva ancora.
-- Ufficio cancellato (o ente cancellato, che si porta via i suoi uffici) = riferimento
-- senza ufficio, non errore. Il 15/11 nessuna riga ha ufficio_id: niente orfani.
-- Idempotente.

set lock_timeout = '3s';
set statement_timeout = '60s';

alter table public.order_riferimenti_pa drop constraint if exists order_riferimenti_pa_ufficio_fk;
alter table public.order_riferimenti_pa
  add constraint order_riferimenti_pa_ufficio_fk
  foreign key (ufficio_id) references public.anagrafica_uffici_pa(id) on delete set null;

create index if not exists order_riferimenti_pa_ufficio_idx
  on public.order_riferimenti_pa (ufficio_id) where ufficio_id is not null;
