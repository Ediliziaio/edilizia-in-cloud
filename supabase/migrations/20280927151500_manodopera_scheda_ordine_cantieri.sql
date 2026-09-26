-- Scheda operaio: prima il cantiere di adesso, poi quelli in arrivo (dal più
-- vicino), poi quelli finiti (26/09/2026). Prima un cantiere di novembre
-- passava davanti a quello in corso.

create or replace function public.manodopera_operaio(p_profilo_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_h public.hr_profili;
  v_e public.employees;
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_modifica boolean;
begin
  select * into v_h from public.hr_profili where id = p_profilo_id;
  if not found
     or not public.has_permission_for_company(v_uid, 'can_view_operai', v_h.company_id)
     or (not v_h.lavora_in_cantiere
         and not public.has_permission_for_company(v_uid, 'can_view_persone', v_h.company_id)) then
    raise exception using errcode = '42501', message = 'Questo operaio non c''è o non puoi vederlo.';
  end if;

  v_modifica := public.has_permission_for_company(v_uid, 'can_edit_operai', v_h.company_id);
  select * into v_e from public.employees where id = v_h.employee_id;

  return jsonb_build_object(
    'scheda', jsonb_build_object(
      'id', v_h.id,
      'company_id', v_h.company_id,
      'employee_id', v_h.employee_id,
      'nome', v_h.nome,
      'cognome', v_h.cognome,
      'mansione', coalesce(nullif(v_h.mansione, ''), nullif(v_e.qualifica, '')),
      'telefono', coalesce(nullif(v_h.telefono, ''), nullif(v_e.phone, '')),
      'email', coalesce(nullif(v_h.email, ''), nullif(v_e.email, '')),
      'colore_avatar', v_h.colore_avatar,
      'foto_url', v_h.foto_url,
      'attivo', coalesce(v_h.attivo, true),
      'lavora_in_cantiere', v_h.lavora_in_cantiere,
      'data_assunzione', coalesce(v_h.data_assunzione, v_e.data_assunzione),
      'data_cessazione', v_h.data_cessazione,
      'tipo_contratto', v_h.tipo_contratto,
      'matricola', v_h.matricola,
      'ha_accesso_app', v_h.user_id is not null
    ),
    'puo_modificare', v_modifica,
    'squadra', (
      select jsonb_build_object(
               'id', t.id, 'nome', t.name, 'colore', t.color,
               'responsabile', (select jsonb_build_object('id', r.id, 'nome', r.nome, 'cognome', r.cognome)
                                  from public.hr_profili r where r.id = t.responsabile_hr_profilo_id),
               'compagni', coalesce((
                 select jsonb_agg(jsonb_build_object('id', h2.id, 'nome', h2.nome, 'cognome', h2.cognome,
                                                     'colore_avatar', h2.colore_avatar)
                        order by h2.cognome, h2.nome)
                   from public.squadre_componenti c2
                   join public.hr_profili h2 on h2.id = c2.hr_profilo_id
                  where c2.squadra_id = t.id and h2.id <> v_h.id and coalesce(h2.attivo, true)), '[]'::jsonb))
        from public.squadre_componenti c
        join public.external_teams t on t.id = c.squadra_id and t.is_active
       where c.hr_profilo_id = v_h.id),
    'costo', jsonb_build_object(
      'costo_orario', public.manodopera_costo_orario(v_h.employee_id),
      'costo_orario_scritto', case when coalesce(v_e.costo_orario, 0) > 0 then v_e.costo_orario end,
      'stipendio_lordo', case when v_modifica then v_e.gross_salary end,
      'ore_mese', case when v_modifica then v_e.monthly_hours end,
      'contributi_percento', case when v_modifica then coalesce(v_e.inps_rate, 28) end
    ),
    'documenti', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'categoria', d.categoria, 'titolo', d.titolo, 'ente', d.ente,
               'data_rilascio', d.data_rilascio, 'data_scadenza', d.data_scadenza,
               'stato', case
                          when d.data_scadenza is null then 'senza_scadenza'
                          when d.data_scadenza < v_oggi then 'scaduto'
                          when d.data_scadenza <= v_oggi + coalesce(d.alert_giorni_prima, 30) then 'in_scadenza'
                          else 'valido'
                        end)
             order by d.data_scadenza nulls last, d.titolo)
        from public.hr_documenti d where d.hr_profilo_id = v_h.id), '[]'::jsonb),
    -- Gli ultimi 31 giorni: la giornata calcolata se c'è, altrimenti le
    -- timbrature di quel giorno (la giornata può mancare o essere indietro).
    'giornate', coalesce((
      select jsonb_agg(jsonb_build_object(
               'data', x.data,
               'stato', coalesce(g.stato, 'presente'),
               'ore_lavorate', case when x.data = v_oggi or g.ore_lavorate is null
                                    then coalesce(public.manodopera_ore_timbrate(v_h.id, x.data), g.ore_lavorate)
                                    else g.ore_lavorate end,
               'ore_straordinario', g.ore_straordinario,
               'prima_entrata', coalesce(g.prima_entrata, tt.prima),
               'ultima_uscita', coalesce(g.ultima_uscita, tt.ultima),
               'anomalia', coalesce(g.anomalia, false),
               'anomalia_motivo', g.anomalia_motivo)
             order by x.data desc)
        from (
          select g0.data from public.hr_giornate g0
           where g0.profilo_id = v_h.id and g0.data > v_oggi - 31 and g0.data <= v_oggi
          union
          select t0.data_evento from public.hr_timbrature t0
           where t0.profilo_id = v_h.id and t0.data_evento > v_oggi - 31 and t0.data_evento <= v_oggi
        ) x
        left join public.hr_giornate g on g.profilo_id = v_h.id and g.data = x.data
        left join lateral (
          select min(t1.ora_evento) filter (where t1.tipo = 'entrata') as prima,
                 max(t1.ora_evento) filter (where t1.tipo = 'uscita') as ultima
            from public.hr_timbrature t1
           where t1.profilo_id = v_h.id and t1.data_evento = x.data
        ) tt on true), '[]'::jsonb),
    -- Le commesse della persona (con l'app) e quelle della sua squadra (vale
    -- anche per chi l'app non ce l'ha).
    'cantieri', coalesce((
      select jsonb_agg(jsonb_build_object(
               'order_id', x.order_id, 'codice', ord.order_code, 'cliente', ord.client_name,
               'indirizzo', coalesce(nullif(ord.indirizzo_lavori, ''), ord.work_address),
               'dal', x.dal, 'al', x.al,
               'capocantiere', x.capo,
               'con_la_squadra', x.con_squadra,
               'in_corso', (x.al is null or x.al >= v_oggi))
             order by case
                        when (x.al is null or x.al >= v_oggi) and (x.dal is null or x.dal <= v_oggi) then 0
                        when x.dal > v_oggi then 1
                        else 2
                      end,
                      case when x.dal > v_oggi then x.dal end nulls last,
                      x.dal desc nulls last)
        from (
          select distinct on (y.order_id) y.*
            from (
              select a.order_id, a.data_inizio as dal, a.data_fine_prevista as al,
                     coalesce(a.is_capocantiere, false) as capo, a.da_squadra_id is not null as con_squadra, 1 as peso
                from public.order_campo_assignments a
               where v_h.user_id is not null and a.user_id = v_h.user_id and a.company_id = v_h.company_id
              union all
              select sc.order_id, sc.dal, sc.al, false, true, 2
                from public.squadre_componenti c
                join public.squadre_commesse sc on sc.squadra_id = c.squadra_id
               where c.hr_profilo_id = v_h.id
            ) y
           order by y.order_id, y.peso
        ) x
        join public.orders ord on ord.id = x.order_id and ord.deleted_at is null), '[]'::jsonb),
    'mezzi', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'nome', m.nome, 'tipo', m.tipo, 'targa', m.targa)
             order by m.nome)
        from public.mezzi m
       where m.assegnato_hr_profilo_id = v_h.id and m.deleted_at is null), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.manodopera_operaio(uuid) from public, anon;
grant execute on function public.manodopera_operaio(uuid) to authenticated;
