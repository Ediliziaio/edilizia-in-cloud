-- Commessa → fasi di lavoro: il «Venduto» di ogni lavorazione (06/10/2026).
--
-- Ogni fase mostra tre numeri: Venduto, Costo previsto, Costo consuntivo. I
-- costi vengono da persone, ditte, acquisti e magazzino; il venduto no. Il
-- valore venduto della commessa sta nel totale (orders.total_amount) e nelle
-- righe del contratto (order_items) collegate alle fasi, ma il 06/10/2026, sulle
-- 17 commesse con fasi, le righe collegate erano quasi tutte materiali senza
-- prezzo di vendita: il venduto di una lavorazione non si poteva dire.
--
-- Questa colonna lo tiene, scritto dall'ufficio (imponibile, in euro). Vuota,
-- vale la somma delle righe del contratto collegate alla fase che hanno un
-- prezzo. Non entra nei totali della commessa né in v_ordine_marginalita: serve
-- a ripartire il contratto sulle lavorazioni e a leggerne il margine.
--
-- Chi legge le fasi (ufficio con can_view_orders, operai assegnati) legge anche
-- questa colonna, come già il prezzo delle righe del contratto: l'app la mostra
-- e la fa scrivere solo con il permesso sugli importi della commessa.

set local lock_timeout = '3s';

alter table public.order_work_phases
  add column if not exists importo_venduto numeric(12,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.order_work_phases'::regclass
       and conname = 'order_work_phases_importo_venduto_non_negativo'
  ) then
    alter table public.order_work_phases
      add constraint order_work_phases_importo_venduto_non_negativo
      check (importo_venduto is null or importo_venduto >= 0);
  end if;
end $$;

comment on column public.order_work_phases.importo_venduto is
  'Venduto della lavorazione (imponibile, euro), scritto dall''ufficio. Vuoto = somma delle righe del contratto collegate alla fase con un prezzo.';
