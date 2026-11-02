-- «Creato da» sulla commessa (02/11/2026). create_order_atomic riceve l'utente ma non lo scrive:
-- 40 commesse su 102 degli ultimi 60 giorni non hanno autore. Un trigger, invece di ritoccare la RPC,
-- copre ogni inserimento dal browser, anche quelli futuri. Non riempie le commesse già esistenti.
set local lock_timeout = '3s';

create or replace function public.orders_autore_predefinito()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

revoke all on function public.orders_autore_predefinito() from public, anon, authenticated;

drop trigger if exists orders_autore_predefinito on public.orders;
create trigger orders_autore_predefinito
  before insert on public.orders
  for each row execute function public.orders_autore_predefinito();
