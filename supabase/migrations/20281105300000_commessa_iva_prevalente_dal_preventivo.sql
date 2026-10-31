set local lock_timeout='3s';
set local statement_timeout='60s';
-- IVA della commessa nata da un preventivo (audit 31/10/2026): crea_commessa_preventivo_atomic la calcola come
-- iva/imponibile, e con righe al 10% e al 22% esce un 13,47% che non è un'aliquota (lo SdI la rifiuta in fattura).
-- Quando la commessa viene collegata al preventivo e l'aliquota non è una di quelle vere, si prende quella
-- prevalente sulle righe del preventivo (per importo). Le commesse esistenti non si toccano.
create or replace function public.commessa_iva_prevalente_dal_preventivo() returns trigger
language plpgsql security definer set search_path='' as $$
declare v numeric;
begin
 if new.quote_id is not null and old.quote_id is null
    and new.vat_rate is not null and new.vat_rate not in (0, 4, 5, 10, 22) then
  select qi.vat_rate into v from public.quote_items qi
   where qi.quote_id = new.quote_id and not coalesce(qi.is_optional, false) and coalesce(qi.quantity, 1) <> 0
     and qi.vat_rate in (0, 4, 5, 10, 22)
   group by qi.vat_rate order by sum(abs(coalesce(qi.line_total, 0))) desc limit 1;
  if v is not null then new.vat_rate := v; end if;
 end if;
 return new;
end $$;
do $$ begin
 if not exists(select 1 from pg_trigger where tgname='commessa_iva_prevalente_dal_preventivo' and tgrelid='public.orders'::regclass) then
  create trigger commessa_iva_prevalente_dal_preventivo before update of quote_id on public.orders
   for each row execute function public.commessa_iva_prevalente_dal_preventivo();
 end if;
end $$;
