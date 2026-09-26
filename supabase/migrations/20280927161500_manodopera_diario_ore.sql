-- Diario del giorno: l'ora di rapportini e giornale solo se scritti quel giorno
-- (scritti dopo, l'ora di inserimento confondeva), e le ore del rapportino
-- all'italiana («7 h», «7,5 h») (26/09/2026).

create or replace function public.manodopera_diario(p_company_id uuid, p_giorno date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_giorno date := coalesce(p_giorno, (now() at time zone 'Europe/Rome')::date);
begin
  if not public.has_permission_for_company(auth.uid(), 'can_view_operai', p_company_id) then
    raise exception using errcode = '42501', message = 'Non hai il permesso di vedere gli operai di questa azienda.';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(e) order by e.quando nulls last, e.tipo)
    from (
      -- Rapportini dal cantiere
      select case when (cr.created_at at time zone 'Europe/Rome')::date = v_giorno then cr.created_at end as quando,
             'rapportino'::text as tipo,
             'Rapportino' || case when cr.ore_lavorate is not null
                                  then ' · ' || case when cr.ore_lavorate = trunc(cr.ore_lavorate)
                                                     then trunc(cr.ore_lavorate)::bigint::text
                                                     else replace(rtrim(cr.ore_lavorate::text, '0'), '.', ',') end || ' h'
                                  else '' end as titolo,
             left(cr.descrizione_lavori, 400) as testo,
             coalesce(nullif(trim(coalesce(h.nome, '') || ' ' || coalesce(h.cognome, '')), ''),
                      nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')) as chi,
             cr.order_id, public.manodopera_etichetta_commessa(cr.order_id) as cantiere,
             null::uuid as mezzo_id, null::text as mezzo
        from public.campo_rapportini cr
        left join public.hr_profili h on h.user_id = cr.user_id and h.company_id = cr.company_id
        left join public.profiles p on p.id = cr.user_id
       where cr.company_id = p_company_id and cr.data_lavoro = v_giorno
      union all
      -- Giornale dei lavori
      select case when (g.created_at at time zone 'Europe/Rome')::date = v_giorno then g.created_at end, 'giornale',
             'Giornale dei lavori' || case when g.condizioni_meteo is not null then ' · ' || g.condizioni_meteo else '' end
               || case when g.personale_presente is not null then ' · ' || g.personale_presente || ' persone' else '' end,
             left(concat_ws(' — ', g.lavorazioni_eseguite, nullif(g.note, '')), 400),
             g.firmato_da, g.order_id, public.manodopera_etichetta_commessa(g.order_id), null, null
        from public.giornale_lavori g
       where g.company_id = p_company_id and g.data_lavori = v_giorno
      union all
      -- Foto dal cantiere, una riga per cantiere
      select max(f.taken_at), 'foto',
             count(*) || ' foto dal cantiere',
             (array_agg(f.descrizione order by f.taken_at) filter (where nullif(f.descrizione, '') is not null))[1],
             null, f.order_id, public.manodopera_etichetta_commessa(f.order_id), null, null
        from public.foto_cantiere f
       where f.company_id = p_company_id and (coalesce(f.taken_at, f.created_at) at time zone 'Europe/Rome')::date = v_giorno
       group by f.order_id
      union all
      -- Mezzi spostati: su un cantiere o a una persona
      select ma.dal, 'mezzo',
             case when ma.order_id is not null then 'In cantiere: '
                  when ma.su_mezzo_id is not null then 'Caricato sul mezzo: '
                  else 'Consegna: ' end || m.nome,
             null,
             nullif(trim(coalesce(h.nome, '') || ' ' || coalesce(h.cognome, '')), ''),
             ma.order_id, public.manodopera_etichetta_commessa(ma.order_id), m.id, m.nome
        from public.mezzi_assegnazioni ma
        join public.mezzi m on m.id = ma.mezzo_id and m.deleted_at is null
        left join public.hr_profili h on h.id = ma.hr_profilo_id
       where ma.company_id = p_company_id and (ma.dal at time zone 'Europe/Rome')::date = v_giorno
      union all
      -- Guasti e danni segnalati
      select s.created_at, 'segnalazione',
             case s.tipo when 'guasto' then 'Guasto' when 'danno' then 'Danno' when 'km' then 'Km aggiornati' else 'Segnalazione' end
               || ' · ' || m.nome,
             s.descrizione,
             nullif(trim(coalesce(h.nome, '') || ' ' || coalesce(h.cognome, '')), ''),
             null, null, m.id, m.nome
        from public.mezzi_segnalazioni s
        join public.mezzi m on m.id = s.mezzo_id
        left join public.hr_profili h on h.id = s.hr_profilo_id
       where s.company_id = p_company_id and (s.created_at at time zone 'Europe/Rome')::date = v_giorno
      union all
      -- Interventi in officina
      select null::timestamptz, 'officina',
             case mm.tipo when 'tagliando' then 'Tagliando' when 'riparazione' then 'Riparazione' when 'gomme' then 'Gomme'
                          when 'carrozzeria' then 'Carrozzeria' else 'Intervento' end || ' · ' || m.nome,
             concat_ws(' — ', mm.officina, mm.descrizione),
             null, null, null, m.id, m.nome
        from public.mezzi_manutenzioni mm
        join public.mezzi m on m.id = mm.mezzo_id
       where mm.company_id = p_company_id and mm.data = v_giorno
    ) e), '[]'::jsonb);
end;
$$;
revoke all on function public.manodopera_diario(uuid, date) from public, anon;
grant execute on function public.manodopera_diario(uuid, date) to authenticated;
