-- PostgREST riconosceva una seconda relazione implicita many-to-many e rendeva
-- ambigua la vecchia lettura ddt_ricezione -> purchase_orders. La chiave tecnica
-- mantiene il vincolo univoco e le FK, senza cambiare il contratto dei client.
alter table public.ddt_ordini_acquisto add column id uuid not null default gen_random_uuid();
alter table public.ddt_ordini_acquisto drop constraint ddt_ordini_acquisto_pkey;
alter table public.ddt_ordini_acquisto add primary key(id);
alter table public.ddt_ordini_acquisto add constraint ddt_ordini_acquisto_documenti_key unique(ddt_id,purchase_order_id);
notify pgrst,'reload schema';
