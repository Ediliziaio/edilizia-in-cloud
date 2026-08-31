-- GIÀ APPLICATA sul live il 2026-08-30 via Management API e registrata in
-- supabase_migrations.schema_migrations (vedi supabase/migrations/README.md).
--
-- Assistenza: il flusso aveva 3 soli stati (aperto/in_lavorazione/risolto)
-- mentre la UI ne gestiva già 5 (src/types/tickets.ts citava "chiuso" e
-- "in_attesa", che il DB rifiutava). Qui si allinea l'enum e si aggiunge
-- quello che serve al lavoro vero: se l'intervento si paga, e la merce che
-- l'intervento sta aspettando.

alter type ticket_status add value if not exists 'in_attesa';
alter type ticket_status add value if not exists 'preventivo_da_approvare';
alter type ticket_status add value if not exists 'in_attesa_merce';
alter type ticket_status add value if not exists 'programmato';
alter type ticket_status add value if not exists 'chiuso';
alter type ticket_status add value if not exists 'annullato';

alter table tickets
  add column if not exists a_pagamento boolean not null default false,
  add column if not exists motivo_gratuito text,
  add column if not exists importo_preventivato numeric,
  add column if not exists importo_finale numeric,
  add column if not exists pagato boolean not null default false,
  add column if not exists data_pagamento date,
  add column if not exists metodo_pagamento text,
  add column if not exists note_pagamento text,
  add column if not exists merce_richiesta boolean not null default false;

alter table tickets drop constraint if exists tickets_motivo_gratuito_check;
alter table tickets add constraint tickets_motivo_gratuito_check
  check (motivo_gratuito is null or motivo_gratuito in ('garanzia','cortesia','contratto_manutenzione','rilavorazione'));

alter table tickets drop constraint if exists tickets_importi_non_negativi;
alter table tickets add constraint tickets_importi_non_negativi
  check (coalesce(importo_preventivato,0) >= 0 and coalesce(importo_finale,0) >= 0);

alter table purchase_orders add column if not exists ticket_id uuid references tickets(id) on delete set null;
create index if not exists idx_purchase_orders_ticket on purchase_orders(ticket_id) where ticket_id is not null;
create index if not exists idx_tickets_order on tickets(order_id) where order_id is not null;
