-- La misura che legge il fornitore, e di che misura si tratta (08/11/2026).
-- Solo colonne facoltative: nessuna riga viene scritta.
set local lock_timeout = '3s';
set local statement_timeout = '60s';
alter table public.order_items
  add column if not exists misure_da_ordinare jsonb,
  add column if not exists misura_tipo text,
  add column if not exists componente text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'order_items_misura_tipo_check') then
    alter table public.order_items add constraint order_items_misura_tipo_check
      check (misura_tipo is null or misura_tipo in ('foro', 'telaio', 'finita'));
  end if;
end $$;
comment on column public.order_items.misure_da_ordinare is 'Le misure che legge il fornitore: le rilevate, meno l''eventuale gioco di posa. Vuoto finché non sono confermate.';
comment on column public.order_items.misura_tipo is 'Che cosa sono le misure scritte: foro, telaio o misura finita.';
comment on column public.order_items.componente is 'Parte dell''elemento del sopralluogo: infisso, tapparella, zanzariera, persiana, cassonetto.';
