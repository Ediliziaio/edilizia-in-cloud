-- La ritenuta di garanzia passa dal preventivo alla commessa (15/11/2026).
--
-- Il preventivo con computo decide la ritenuta (percentuale, su quali pagamenti, svincolo al collaudo o dopo
-- N mesi: lib/computo/pagamentiSchema.ts), e il certificato del SAL la legge da orders.ritenuta_garanzia
-- (20290313140000). Fra i due mancava il passaggio: il preventivo non aveva dove tenerla e nessuno scriveva
-- la colonna della commessa, così il primo certificato partiva senza ritenuta.
--  - quotes.ritenuta_garanzia: la scrive il computo quando prepara il preventivo (commessaDaComputo.ts);
--  - quando una commessa riceve il suo preventivo (crea_commessa_preventivo_atomic scrive quote_id dopo la
--    creazione), se non ha già una ritenuta prende quella del preventivo.

set local lock_timeout = '3s';

alter table public.quotes add column if not exists ritenuta_garanzia jsonb;
comment on column public.quotes.ritenuta_garanzia is
  'Ritenuta a garanzia concordata nel preventivo: {percentuale, su: sal|tutte, svincolo: collaudo|mesi, mesi}. Passa alla commessa (orders.ritenuta_garanzia). 15/11/2026.';

create or replace function public.orders_ritenuta_dal_preventivo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.quote_id is not null and new.ritenuta_garanzia is null
     and (tg_op = 'INSERT' or new.quote_id is distinct from old.quote_id) then
    select q.ritenuta_garanzia into new.ritenuta_garanzia
      from public.quotes q where q.id = new.quote_id and q.company_id = new.company_id;
  end if;
  return new;
end;
$$;

revoke all on function public.orders_ritenuta_dal_preventivo() from public, anon, authenticated;

drop trigger if exists trg_orders_ritenuta_dal_preventivo on public.orders;
create trigger trg_orders_ritenuta_dal_preventivo
  before insert or update of quote_id on public.orders
  for each row execute function public.orders_ritenuta_dal_preventivo();
