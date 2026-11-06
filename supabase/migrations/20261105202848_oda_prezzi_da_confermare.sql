-- Stato esplicito per le righe in attesa della conferma prezzi del fornitore.
-- Nessun dato storico viene reinterpretato: prezzo zero resta un prezzo concordato.
alter table public.purchase_order_items add column if not exists price_pending boolean not null default false;
comment on column public.purchase_order_items.price_pending is 'Prezzo non ancora concordato. unit_price resta zero provvisorio e non indica una fornitura gratuita.';
alter table public.purchase_order_items add constraint purchase_order_items_pending_price_zero check (not price_pending or unit_price = 0);
notify pgrst, 'reload schema';
