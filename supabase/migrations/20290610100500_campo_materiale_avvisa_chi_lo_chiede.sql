-- Il materiale chiesto dal cantiere: avviso a chi l'ha chiesto (26/11/2026, piano campo completo, punto 2.3).
--
-- L'operaio o il caposquadra chiede il materiale dall'app (ticket con fonte «campo»). tickets.merce_stato si
-- aggiorna già quando l'ufficio ordina e quando la merce arriva, ma chi l'aveva chiesto non lo sapeva.
-- Ora a ogni passo (ordinata, arrivata in parte, arrivata) gli arriva una notifica in campanella e sul
-- telefono, con il cantiere. I titoli sono fissi: l'app li traduce nella lingua dell'operaio.

create or replace function public.campo_materiale_avvisa_richiedente()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_titolo text;
  v_codice text;
begin
  if new.fonte is distinct from 'campo' or new.created_by is null
     or new.merce_stato is not distinct from old.merce_stato then
    return new;
  end if;
  v_titolo := case new.merce_stato
    when 'ordinata' then 'Il materiale che hai chiesto è stato ordinato'
    when 'arrivata_parziale' then 'È arrivata una parte del materiale che hai chiesto'
    when 'arrivata' then 'Il materiale che hai chiesto è arrivato'
    else null end;
  if v_titolo is null then return new; end if;
  select o.order_code into v_codice from public.orders o where o.id = new.order_id;
  perform public.campo_notifica(new.company_id, new.created_by, 'campo_materiale', v_titolo,
    concat_ws(' · ', nullif(coalesce(new.titolo, new.subject), ''), v_codice),
    'ticket', new.id, '/campo');
  return new;
end;
$function$;

revoke all on function public.campo_materiale_avvisa_richiedente() from public, anon, authenticated;

drop trigger if exists trg_campo_materiale_avvisa on public.tickets;
create trigger trg_campo_materiale_avvisa
  after update of merce_stato on public.tickets
  for each row execute function public.campo_materiale_avvisa_richiedente();
