-- Il lock sulla risorsa serializza i montaggi con gli altri montaggi e con le modifiche del totale.
-- La quantità impegnata si legge dopo l’acquisizione del lock.
create or replace function public.mezzi_allocazioni_controlla()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_m record;
  v_in_uso numeric;
begin
  select company_id, gestione, quantita_totale, unita_misura, deleted_at
    into v_m from public.mezzi where id = new.mezzo_id for no key update;
  if v_m.company_id is null or v_m.deleted_at is not null then
    raise exception using errcode = '23503', message = 'Attrezzatura non trovata.';
  end if;
  if v_m.gestione is distinct from 'quantita' then
    raise exception using errcode = '22023',
      message = 'Solo le attrezzature a quantità si ripartiscono tra i cantieri.';
  end if;
  new.company_id := v_m.company_id;
  if new.al is null or new.al > (now() at time zone 'Europe/Rome')::date then
    v_in_uso := public.mezzi_quantita_in_uso(new.mezzo_id, new.id);
    if v_in_uso + new.quantita > v_m.quantita_totale then
      raise exception using errcode = '23514',
        message = format('Non basta: disponibili %s.',
                         public._mezzi_fmt_quantita(greatest(v_m.quantita_totale - v_in_uso, 0), v_m.unita_misura));
    end if;
  end if;
  return new;
end $$;
