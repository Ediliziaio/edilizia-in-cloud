set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.mezzi_giornate
  add column if not exists ore_lavorate numeric
    check (ore_lavorate between 0 and 24 and scale(ore_lavorate)<=2),
  add column if not exists litri_riforniti numeric
    check (litri_riforniti between 0 and 10000 and scale(litri_riforniti)<=2),
  add column if not exists litri_consumati numeric
    check (litri_consumati between 0 and 10000 and scale(litri_consumati)<=2);

-- Una squadra può registrare lo stesso mezzo su due commesse nello stesso giorno.
create unique index if not exists mezzi_giornate_una_per_commessa
  on public.mezzi_giornate(mezzo_id,giorno,user_id,order_id);
alter table public.mezzi_giornate drop constraint if exists mezzi_giornate_una;

create index if not exists mezzi_giornate_rapportino_idx
  on public.mezzi_giornate(rapportino_id) where rapportino_id is not null;

create or replace function public.campo_mezzi_fine_giornata(
  p_order_id uuid,
  p_giorno date,
  p_righe jsonb,
  p_rapportino_id uuid default null
)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_hr uuid;
  r jsonb;
  v_mezzo public.mezzi;
  v_dove text;
  v_su uuid;
  v_contatore numeric;
  v_ore numeric;
  v_litri numeric;
  v_consumo numeric;
  v_usato boolean;
  v_mezzo_cantiere boolean;
  v_prec public.mezzi_giornate;
  v_ammessa boolean;
  v_schema jsonb;
  v_n integer := 0;
begin
  select company_id into v_company from public.orders where id = p_order_id and deleted_at is null;
  if v_uid is null or v_company is null or public.utente_bloccato() or not coalesce(public.campo_lavoro_su_commessa(p_order_id),false) then
    raise exception using errcode = '42501', message = 'Non lavori su questo cantiere.';
  end if;
  if p_giorno is null or p_giorno < v_oggi - 1 or p_giorno > v_oggi then
    raise exception using errcode = '22023', message = 'Mezzi e attrezzi si segnano per oggi o per ieri.';
  end if;
  if jsonb_typeof(p_righe) is distinct from 'array' then
    return 0;
  end if;
  if p_rapportino_id is not null and not exists (
    select 1 from public.campo_rapportini cr
    where cr.id=p_rapportino_id and cr.company_id=v_company and cr.user_id=v_uid
      and cr.order_id=p_order_id and cr.data_lavoro=p_giorno and cr.annullato_at is null
  ) then
    raise exception using errcode = '42501', message = 'Il rapportino indicato non corrisponde a questa registrazione.';
  end if;
  v_schema := public.modulo_rapportino_per_ordine(p_order_id);
  select h.id into v_hr from public.hr_profili h
   where h.id in (select public.miei_hr_profili()) and h.company_id = v_company
   order by h.attivo desc nulls last limit 1;

  for r in select riga from jsonb_array_elements(p_righe) as payload(riga) order by riga->>'mezzo_id' loop
    select m.* into v_mezzo
      from public.mezzi m
     where m.id = (r->>'mezzo_id')::uuid and m.company_id = v_company
       and m.deleted_at is null for update;
    if v_mezzo.id is null then
      continue;   -- non è un mezzo che posso segnare qui
    end if;

    select * into v_prec from public.mezzi_giornate g
    where g.company_id=v_company and g.mezzo_id=v_mezzo.id and g.order_id=p_order_id
      and g.giorno=p_giorno and g.user_id=v_uid;
    v_ammessa := exists (select 1 from public.campo_mezzi_ammessi(p_order_id) a where a.mezzo_id=v_mezzo.id);
    if not v_ammessa and (v_prec.id is null or p_rapportino_id is null or v_prec.rapportino_id is distinct from p_rapportino_id) then
      continue;
    end if;

    v_usato := coalesce((r->>'usato')::boolean, true);
    v_mezzo_cantiere := v_mezzo.tipo in ('macchina_movimento_terra','sollevamento')
      or (v_mezzo.tipo in ('altro','attrezzatura') and v_mezzo.contatore_unita='ore');
    v_ore := v_prec.ore_lavorate;
    v_litri := v_prec.litri_riforniti;
    v_consumo := v_prec.litri_consumati;
    if v_mezzo_cantiere and v_schema#>'{blocchi,mezzi}' is distinct from 'false'::jsonb then
      if r ? 'ore_lavorate' and v_schema#>'{rilevazioni_mezzi,ore}' = 'true'::jsonb then
        if r->'ore_lavorate' <> 'null'::jsonb and jsonb_typeof(r->'ore_lavorate') <> 'number' then
          raise exception using errcode='22023', message='Le ore lavorate devono essere un numero.';
        end if;
        v_ore := (r->>'ore_lavorate')::numeric;
      end if;
      if r ? 'litri_consumati' and v_schema#>'{rilevazioni_mezzi,consumo}' = 'true'::jsonb then
        if r->'litri_consumati' <> 'null'::jsonb and jsonb_typeof(r->'litri_consumati') <> 'number' then
          raise exception using errcode='22023', message='I litri consumati devono essere un numero.';
        end if;
        v_consumo := (r->>'litri_consumati')::numeric;
      end if;
      if r ? 'litri_riforniti' and v_schema#>'{rilevazioni_mezzi,litri}' = 'true'::jsonb then
        if r->'litri_riforniti' <> 'null'::jsonb and jsonb_typeof(r->'litri_riforniti') <> 'number' then
          raise exception using errcode='22023', message='I litri riforniti devono essere un numero.';
        end if;
        v_litri := (r->>'litri_riforniti')::numeric;
      end if;
    end if;
    if not v_usato then
      v_ore := null;
      v_litri := null;
      v_consumo := null;
    end if;

    v_dove := coalesce(nullif(r->>'dove', ''), 'invariato');
    if v_dove not in ('cantiere', 'magazzino', 'furgone', 'con_me', 'invariato') then
      v_dove := 'invariato';
    end if;
    -- i furgoni e le auto non si spostano da qui: seguono chi li guida
    if v_mezzo.tipo in ('furgone', 'autocarro', 'autovettura') then
      v_dove := 'invariato';
    end if;
    v_su := null;
    if v_dove = 'furgone' then
      select m.id into v_su from public.mezzi m
       where m.id = (r->>'su_mezzo_id')::uuid and m.company_id = v_company and m.deleted_at is null and m.su_mezzo_id is null
         and m.tipo in ('furgone', 'autocarro', 'autovettura')
         and m.assegnato_hr_profilo_id in (select public.miei_hr_profili());
      if v_su is null then v_dove := 'invariato'; end if;
    end if;
    if v_dove = 'con_me' and v_hr is null then
      v_dove := 'invariato';
    end if;

    -- Su una ripetizione o una correzione delle misure non ripetere lo spostamento.
    if not v_ammessa or (v_prec.id is not null and
      (v_dove='invariato' or (v_prec.dove=v_dove and v_prec.su_mezzo_id is not distinct from v_su))) then
      v_dove := v_prec.dove;
      v_su := v_prec.su_mezzo_id;
    elsif v_dove = 'cantiere' then
      update public.mezzi set assegnato_order_id = p_order_id, su_mezzo_id = null, assegnato_hr_profilo_id = null
       where id = v_mezzo.id;
    elsif v_dove = 'magazzino' then
      update public.mezzi set assegnato_order_id = null, su_mezzo_id = null, assegnato_hr_profilo_id = null
       where id = v_mezzo.id;
    elsif v_dove = 'furgone' then
      update public.mezzi set su_mezzo_id = v_su, assegnato_order_id = null, assegnato_hr_profilo_id = v_hr
       where id = v_mezzo.id;
    elsif v_dove = 'con_me' then
      update public.mezzi set assegnato_hr_profilo_id = v_hr, assegnato_order_id = null, su_mezzo_id = null
       where id = v_mezzo.id;
    end if;

    -- km o ore a fine giornata, scritti all'italiana («84.350»); solo in
    -- avanti: un numero più basso di quello che c'è è una svista e non si tiene
    v_contatore := public.numero_italiano(r->>'contatore');
    if v_contatore is not null and v_mezzo.contatore is not null and v_contatore < v_mezzo.contatore then
      v_contatore := null;
    end if;
    if v_contatore is not null and (v_mezzo.contatore is null or v_contatore > v_mezzo.contatore) then
      update public.mezzi set contatore = v_contatore, contatore_aggiornato_il = p_giorno where id = v_mezzo.id;
    end if;

    insert into public.mezzi_giornate
      (company_id, mezzo_id, order_id, user_id, hr_profilo_id, giorno, usato, dove, su_mezzo_id, contatore, rapportino_id, ore_lavorate, litri_riforniti, litri_consumati)
    values
      (v_company, v_mezzo.id, p_order_id, v_uid, v_hr, p_giorno, v_usato, v_dove, v_su,
       v_contatore, p_rapportino_id, v_ore, v_litri, v_consumo)
    on conflict (mezzo_id, giorno, user_id, order_id) do update
      set created_at = case when mezzi_giornate.dove is distinct from excluded.dove or mezzi_giornate.su_mezzo_id is distinct from excluded.su_mezzo_id then now() else mezzi_giornate.created_at end,
          ore_lavorate = excluded.ore_lavorate, litri_riforniti = excluded.litri_riforniti, litri_consumati = excluded.litri_consumati, usato = excluded.usato, dove = excluded.dove, su_mezzo_id = excluded.su_mezzo_id,
          contatore = coalesce(excluded.contatore, mezzi_giornate.contatore),
          rapportino_id = coalesce(excluded.rapportino_id, mezzi_giornate.rapportino_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.campo_mezzi_fine_giornata(uuid, date, jsonb, uuid) from public, anon;
grant execute on function public.campo_mezzi_fine_giornata(uuid, date, jsonb, uuid) to authenticated;
