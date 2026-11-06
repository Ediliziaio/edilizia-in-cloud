CREATE OR REPLACE FUNCTION public.mezzi_rientro(p_allocazione uuid, p_quantita numeric, p_data date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  a public.mezzi_allocazioni;
  v_data date := coalesce(p_data, (now() at time zone 'Europe/Rome')::date);
begin
  select * into a from public.mezzi_allocazioni where id = p_allocazione for update;
  if a.id is null then
    raise exception using errcode = '23503', message = 'Montaggio non trovato.';
  end if;
  if a.al is not null and a.al <= (now() at time zone 'Europe/Rome')::date then
    raise exception using errcode = '22023', message = 'Questo è già rientrato.';
  end if;
  if p_quantita is null or p_quantita <= 0 then
    raise exception using errcode = '22023', message = 'Indica quanto rientra.';
  end if;
  if v_data < a.dal then
    raise exception using errcode = '22023', message = 'Il rientro non può essere prima del montaggio.';
  end if;
  if p_quantita >= a.quantita then
    update public.mezzi_allocazioni set al = v_data where id = a.id;
  else
    update public.mezzi_allocazioni set quantita = a.quantita - p_quantita where id = a.id;
    insert into public.mezzi_allocazioni (company_id, mezzo_id, order_id, luogo, quantita, dal, al, note)
    values (a.company_id, a.mezzo_id, a.order_id, a.luogo, p_quantita, a.dal, v_data, 'Rientro parziale');
  end if;
end $function$
