-- «Cantieri oggi» e «Da approvare» di tutta l'azienda.
-- Con tanti cantieri l'ufficio doveva aprire una commessa alla volta per sapere chi c'è, se è
-- arrivato il rapportino, cosa aspetta un'approvazione e quali cantieri sono fermi. Due letture:
--   · ufficio_cantieri_oggi(giorno): una riga per cantiere aperto — persone previste e timbrate,
--     rapportini del giorno, cose da approvare, ultimo segnale dal cantiere;
--   · ufficio_da_approvare(): rapportini inviati, correzioni di timbratura (anche senza cantiere),
--     bolle dal cantiere da verificare, di tutta l'azienda.
-- Solo letture, per chi può vedere le commesse dell'azienda attiva.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.ufficio_cantieri_oggi(p_giorno date default null)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
  v_company uuid := public.get_my_company_id();
  v_giorno date := coalesce(p_giorno, (now() at time zone 'Europe/Rome')::date);
  v_inizio timestamptz; v_fine timestamptz;
begin
  if auth.uid() is null or v_company is null
     or not coalesce(public.has_permission_for_company(auth.uid(), 'can_view_orders', v_company), false) then
    raise exception 'Non puoi vedere i cantieri di questa azienda' using errcode = '42501';
  end if;
  v_inizio := (v_giorno::timestamp at time zone 'Europe/Rome');
  v_fine := ((v_giorno + 1)::timestamp at time zone 'Europe/Rome');
  return coalesce((
    with aperte as (
      select o.id, o.order_code, o.description, coalesce(nullif(o.indirizzo_lavori, ''), o.work_address) indirizzo,
             o.status, o.assigned_to, o.work_start_date, o.work_end_date
        from public.orders o
       where o.company_id = v_company and o.deleted_at is null
         and coalesce(o.status, '') not in ('completato', 'chiuso', 'annullato', 'completed', 'cancelled', 'bozza')
    ),
    previste as (
      select oe.order_id, count(distinct e.user_id) filter (where e.user_id is not null) n
        from public.order_employees oe
        join public.employees e on e.id = oe.employee_id and coalesce(e.is_active, true)
        join aperte a on a.id = oe.order_id
        left join public.order_work_phases f on f.id = oe.phase_id
       where (f.id is not null and coalesce(f.start_date, a.work_start_date) <= v_giorno and coalesce(f.end_date, a.work_end_date, v_giorno) >= v_giorno and f.status <> 'completata')
          or (f.id is null and a.work_start_date <= v_giorno and coalesce(a.work_end_date, v_giorno) >= v_giorno)
       group by oe.order_id
      union all
      select oca.order_id, count(distinct oca.user_id)
        from public.order_campo_assignments oca join aperte a on a.id = oca.order_id
       where coalesce(oca.data_inizio, v_giorno) <= v_giorno and coalesce(oca.data_fine_prevista, v_giorno) >= v_giorno
       group by oca.order_id
    ),
    timbrate as (
      select t.order_id, count(distinct t.user_id) n, max(t.timestamp_evento) ultima
        from public.campo_timbrature t join aperte a on a.id = t.order_id
       where t.company_id = v_company and t.timestamp_evento >= v_inizio and t.timestamp_evento < v_fine
       group by t.order_id
    ),
    rapporti as (
      select r.order_id,
             count(*) filter (where r.data_lavoro = v_giorno and r.stato in ('inviato', 'approvato')
                              and not coalesce(r.lavoro_completato, false) and nullif(btrim(r.firma_cliente_url), '') is null) oggi,
             count(*) filter (where r.stato = 'inviato') da_approvare,
             max(greatest(r.created_at, r.updated_at)) ultimo
        from public.campo_rapportini r join aperte a on a.id = r.order_id
       where r.company_id = v_company
       group by r.order_id
    ),
    segnali as (
      select t.order_id, max(t.timestamp_evento) ultimo from public.campo_timbrature t join aperte a on a.id = t.order_id
       where t.company_id = v_company and t.timestamp_evento > now() - interval '60 days' group by t.order_id
      union all
      select f.order_id, max(f.created_at) from public.foto_cantiere f join aperte a on a.id = f.order_id
       where f.company_id = v_company and f.created_at > now() - interval '60 days' group by f.order_id
    ),
    correzioni as (
      select c.order_id, count(*) n from public.campo_timbrature_correzioni c join aperte a on a.id = c.order_id
       where c.company_id = v_company and c.stato = 'in_attesa' group by c.order_id
    ),
    bolle as (
      select ca.order_id, count(*) n from public.campo_acquisti ca join aperte a on a.id = ca.order_id
       where ca.company_id = v_company and ca.stato = 'da_verificare' group by ca.order_id
    ),
    righe as (
      select a.*, coalesce((select sum(n) from previste p where p.order_id = a.id), 0) previste,
             coalesce(t.n, 0) timbrate, coalesce(r.oggi, 0) rapportini_oggi,
             coalesce(r.da_approvare, 0) rapportini_da_approvare, coalesce(c.n, 0) correzioni, coalesce(b.n, 0) bolle,
             greatest(r.ultimo, (select max(s.ultimo) from segnali s where s.order_id = a.id)) ultimo_segnale,
             trim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')) responsabile
        from aperte a
        left join timbrate t on t.order_id = a.id
        left join rapporti r on r.order_id = a.id
        left join correzioni c on c.order_id = a.id
        left join bolle b on b.order_id = a.id
        left join public.profiles pr on pr.id = a.assigned_to
    )
    select jsonb_agg(jsonb_build_object(
      'id', id, 'codice', order_code, 'descrizione', description, 'indirizzo', indirizzo, 'stato', status,
      'responsabile', nullif(responsabile, ''), 'previste', previste, 'timbrate', timbrate,
      'rapportini_oggi', rapportini_oggi, 'rapportini_da_approvare', rapportini_da_approvare,
      'correzioni', correzioni, 'bolle', bolle, 'ultimo_segnale', ultimo_segnale,
      'giorni_senza_segnale', case when ultimo_segnale is null then null
                                   else (v_giorno - (ultimo_segnale at time zone 'Europe/Rome')::date) end
    ) order by (rapportini_da_approvare + correzioni + bolle) desc, previste desc, ultimo_segnale desc nulls last)
      from righe
     where previste > 0 or timbrate > 0 or rapportini_da_approvare + correzioni + bolle > 0
        or ultimo_segnale > now() - interval '21 days' or status = 'in_corso'
  ), '[]'::jsonb);
end $$;
revoke all on function public.ufficio_cantieri_oggi(date) from public, anon;
grant execute on function public.ufficio_cantieri_oggi(date) to authenticated;

create or replace function public.ufficio_da_approvare()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_company uuid := public.get_my_company_id();
begin
  if auth.uid() is null or v_company is null
     or not coalesce(public.has_permission_for_company(auth.uid(), 'can_view_orders', v_company), false) then
    raise exception 'Non puoi vedere le approvazioni di questa azienda' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'rapportini', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'order_id', r.order_id, 'codice', o.order_code, 'giorno', r.data_lavoro,
        'autore', trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
        'collaudo', coalesce(r.lavoro_completato, false) or nullif(btrim(r.firma_cliente_url), '') is not null,
        'ore', coalesce(r.ore_lavorate, 0) + coalesce(r.ore_straordinario, 0), 'inviato_il', r.updated_at
      ) order by r.data_lavoro, r.updated_at)
      from public.campo_rapportini r join public.orders o on o.id = r.order_id
      left join public.profiles p on p.id = r.user_id
      where r.company_id = v_company and r.stato = 'inviato'), '[]'::jsonb),
    'correzioni', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'order_id', c.order_id, 'codice', o.order_code, 'tipo', c.tipo, 'ora', c.ora_richiesta, 'motivo', c.motivo,
        'persona', trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
      ) order by c.ora_richiesta)
      from public.campo_timbrature_correzioni c left join public.orders o on o.id = c.order_id
      left join public.profiles p on p.id = c.user_id
      where c.company_id = v_company and c.stato = 'in_attesa'), '[]'::jsonb),
    'bolle', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ca.id, 'order_id', ca.order_id, 'codice', o.order_code, 'fornitore', ca.fornitore,
        'numero', ca.numero_documento, 'totale', ca.totale, 'il', ca.created_at,
        'persona', trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
      ) order by ca.created_at)
      from public.campo_acquisti ca left join public.orders o on o.id = ca.order_id
      left join public.profiles p on p.id = ca.user_id
      where ca.company_id = v_company and ca.stato = 'da_verificare'), '[]'::jsonb)
  );
end $$;
revoke all on function public.ufficio_da_approvare() from public, anon;
grant execute on function public.ufficio_da_approvare() to authenticated;
