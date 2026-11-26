-- «Le mie ore del mese» per l'operaio (26/11/2026, piano campo completo, punto 1.3).
--
-- Le stesse ore che vede l'ufficio (ufficio_leggi_ore + lib/orders/dailyHours.ts), per la persona che le
-- chiede: giorno per giorno, con lo stato del rapportino. Regole identiche a dailyHoursLines:
--   - contano i rapportini inviati (da approvare) e approvati; quelli respinti si mostrano a parte;
--   - di un rapportino approvato e registrato valgono le presenze registrate, altrimenti le presenze scritte;
--   - un rapportino senza presenze vale per chi l'ha scritto (ore lavorate + straordinario).
-- Niente costi: solo ore. Solo le proprie (auth.uid()), solo nella propria azienda.

create or replace function public.campo_mie_ore(p_mese date)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_azienda uuid;
  v_dal date := date_trunc('month', coalesce(p_mese, (now() at time zone 'Europe/Rome')::date))::date;
  v_al date := (date_trunc('month', coalesce(p_mese, (now() at time zone 'Europe/Rome')::date)) + interval '1 month - 1 day')::date;
  v_miei text[];
begin
  if v_uid is null or public.utente_bloccato() then
    raise exception 'Sessione non autorizzata.' using errcode = '42501';
  end if;
  select company_id into v_azienda from public.profiles where id = v_uid;
  if v_azienda is null then
    return jsonb_build_object('mese', to_char(v_dal, 'YYYY-MM'), 'giorni', '[]'::jsonb);
  end if;
  select coalesce(array_agg(e.id::text), '{}') into v_miei
    from public.employees e where e.user_id = v_uid and e.company_id = v_azienda;

  return (
    with righe as (
      select cr.id, cr.data_lavoro as giorno, cr.stato, o.order_code,
             case when cr.stato = 'approvato' and cr.costo_registrato_at is not null
                       and jsonb_typeof(cr.presenze_registrate) = 'array'
                  then cr.presenze_registrate
                  when jsonb_typeof(cr.presenze) = 'array' and jsonb_array_length(cr.presenze) > 0
                  then cr.presenze
                  else null end as voci,
             cr.user_id, coalesce(cr.ore_lavorate, 0) + coalesce(cr.ore_straordinario, 0) as ore_proprie
        from public.campo_rapportini cr
        join public.orders o on o.id = cr.order_id and o.deleted_at is null
       where cr.company_id = v_azienda
         and cr.data_lavoro between v_dal and v_al
         and cr.stato in ('inviato', 'approvato', 'rifiutato')
    ),
    mie as (
      -- dalle presenze: le righe col mio employee_id
      select r.giorno, r.stato, r.order_code, (v->>'ore')::numeric as ore
        from righe r
        cross join lateral jsonb_array_elements(r.voci) v
       where r.voci is not null and (v->>'employee_id') = any(v_miei)
         and (v->>'ore') ~ '^[0-9]+([.][0-9]+)?$'
      union all
      -- senza presenze: il rapportino è di chi l'ha scritto
      select r.giorno, r.stato, r.order_code, r.ore_proprie
        from righe r
       where r.voci is null and r.user_id = v_uid and r.ore_proprie > 0
    ),
    per_giorno as (
      select giorno,
             sum(ore) filter (where stato = 'approvato') as approvate,
             sum(ore) filter (where stato = 'inviato') as da_approvare,
             sum(ore) filter (where stato = 'rifiutato') as respinte,
             array_agg(distinct order_code) filter (where order_code is not null) as cantieri
        from mie where ore > 0
       group by giorno
    )
    select jsonb_build_object(
      'mese', to_char(v_dal, 'YYYY-MM'),
      'totale_approvate', coalesce((select sum(approvate) from per_giorno), 0),
      'totale_da_approvare', coalesce((select sum(da_approvare) from per_giorno), 0),
      'giorni', coalesce((select jsonb_agg(jsonb_build_object(
          'giorno', giorno, 'approvate', coalesce(approvate, 0), 'da_approvare', coalesce(da_approvare, 0),
          'respinte', coalesce(respinte, 0), 'cantieri', to_jsonb(coalesce(cantieri, '{}'::text[])))
          order by giorno desc) from per_giorno), '[]'::jsonb))
  );
end;
$function$;

revoke all on function public.campo_mie_ore(date) from public, anon;
grant execute on function public.campo_mie_ore(date) to authenticated;
