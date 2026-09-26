-- Manodopera e Mezzi: il costo delle persone nel Personale, il diario del
-- giorno, il calendario dell'operaio e i km dei mezzi (26/09/2026, Florin).
--
-- 1. Il costo orario e lo stipendio non si vedono più in Manodopera, dove
--    entra chi organizza i cantieri: stanno nel Personale
--    (personale_costo / personale_salva_costo, permesso «Personale»).
--    manodopera_operai e manodopera_operaio non li restituiscono più;
--    manodopera_salva_operaio li scrive solo per chi vede il Personale.
-- 2. La giornata dice anche con quali mezzi ha lavorato ciascuno (dallo
--    storico dei mezzi) e cosa ha scritto nel rapportino.
-- 3. manodopera_diario(azienda, giorno): cosa è successo quel giorno —
--    rapportini, giornale dei lavori, foto dal cantiere, mezzi spostati,
--    guasti segnalati, interventi in officina.
-- 4. manodopera_operaio_mese(scheda, mese): il calendario del mese di un
--    operaio, giorno per giorno: ore, cantiere, mezzi, rapportino.
-- 5. orders.distanza_sede_km/minuti: la strada dalla sede al cantiere, la
--    calcola l'app (servizio percorsi già in uso per i clienti) e la salva
--    qui; si azzera se cambia la posizione del cantiere. Serve ai km dei
--    mezzi: giorni sul cantiere × andata e ritorno.
--
-- Idempotente. Nessuna scrittura di massa.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Numeri scritti all'italiana: «3.100» è tremilacento, «24,50» ventiquattro e
-- cinquanta, «2.400,00 €» duemilaquattrocento. Vuoto = null.
create or replace function public.numero_italiano(p_testo text)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  t text := regexp_replace(coalesce(p_testo, ''), '[^0-9,.\-]', '', 'g');
begin
  if t = '' then return null; end if;
  if position(',' in t) > 0 then
    t := replace(replace(t, '.', ''), ',', '.');
  elsif t ~ '^-?[0-9]{1,3}(\.[0-9]{3})+$' then
    t := replace(t, '.', '');
  end if;
  return t::numeric;
exception when others then
  raise exception using errcode = '22023', message = 'Questo numero non si legge: «' || p_testo || '».';
end;
$$;
revoke all on function public.numero_italiano(text) from public, anon;
grant execute on function public.numero_italiano(text) to authenticated, service_role;

-- ── 5. Distanza dalla sede ──────────────────────────────────────────────────
alter table public.orders
  add column if not exists distanza_sede_km numeric,
  add column if not exists distanza_sede_minuti integer,
  add column if not exists distanza_sede_il timestamptz;
comment on column public.orders.distanza_sede_km is
  'Km su strada dalla sede operativa al cantiere (solo andata). La calcola l''app e la salva con salva_distanza_cantiere; si azzera se cambiano work_lat/work_lng.';

create or replace function public.azzera_distanza_cantiere()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.work_lat is distinct from old.work_lat or new.work_lng is distinct from old.work_lng then
    new.distanza_sede_km := null;
    new.distanza_sede_minuti := null;
    new.distanza_sede_il := null;
  end if;
  return new;
end;
$$;
revoke all on function public.azzera_distanza_cantiere() from public, anon, authenticated;
drop trigger if exists trg_azzera_distanza_cantiere on public.orders;
create trigger trg_azzera_distanza_cantiere
  before update of work_lat, work_lng on public.orders
  for each row execute function public.azzera_distanza_cantiere();

create or replace function public.salva_distanza_cantiere(p_order_id uuid, p_km numeric, p_minuti integer)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
begin
  select company_id into v_company from public.orders where id = p_order_id;
  if v_company is null
     or not (public.has_permission_for_company(v_uid, 'can_view_orders', v_company)
             or public.has_permission_for_company(v_uid, 'can_view_mezzi', v_company)
             or public.has_permission_for_company(v_uid, 'can_view_operai', v_company)) then
    raise exception using errcode = '42501', message = 'Non puoi vedere questa commessa.';
  end if;
  if p_km is null or p_km < 0 or p_km > 2000 then
    raise exception using errcode = '22023', message = 'Distanza non valida.';
  end if;
  update public.orders
     set distanza_sede_km = round(p_km, 1),
         distanza_sede_minuti = p_minuti,
         distanza_sede_il = now()
   where id = p_order_id;
end;
$$;
revoke all on function public.salva_distanza_cantiere(uuid, numeric, integer) from public, anon;
grant execute on function public.salva_distanza_cantiere(uuid, numeric, integer) to authenticated;

-- ── Elenco operai: senza costo ──
drop function if exists public.manodopera_operai(uuid);
create function public.manodopera_operai(p_company_id uuid)
returns table (
  id uuid,
  nome text,
  cognome text,
  mansione text,
  telefono text,
  email text,
  colore_avatar text,
  foto_url text,
  attivo boolean,
  data_assunzione date,
  tipo_contratto text,
  employee_id uuid,
  ha_accesso_app boolean,
  documenti_scaduti integer,
  documenti_in_scadenza integer,
  prossima_scadenza date,
  mezzi text,
  cantieri_attivi integer,
  squadra_id uuid,
  squadra text,
  squadra_colore text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
#variable_conflict use_column
declare
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
begin
  if not public.has_permission_for_company(auth.uid(), 'can_view_operai', p_company_id) then
    raise exception using errcode = '42501', message = 'Non hai il permesso di vedere gli operai di questa azienda.';
  end if;

  return query
  select h.id,
         h.nome,
         h.cognome,
         coalesce(nullif(h.mansione, ''), nullif(e.qualifica, '')),
         coalesce(nullif(h.telefono, ''), nullif(e.phone, '')),
         coalesce(nullif(h.email, ''), nullif(e.email, '')),
         h.colore_avatar,
         h.foto_url,
         coalesce(h.attivo, true),
         coalesce(h.data_assunzione, e.data_assunzione),
         h.tipo_contratto,
         h.employee_id,
         h.user_id is not null,
         (select count(*)::int from public.hr_documenti d
           where d.hr_profilo_id = h.id and d.data_scadenza < v_oggi),
         (select count(*)::int from public.hr_documenti d
           where d.hr_profilo_id = h.id and d.data_scadenza >= v_oggi
             and d.data_scadenza <= v_oggi + coalesce(d.alert_giorni_prima, 30)),
         (select min(d.data_scadenza) from public.hr_documenti d
           where d.hr_profilo_id = h.id and d.data_scadenza >= v_oggi),
         (select string_agg(m.nome, ', ' order by m.nome) from public.mezzi m
           where m.assegnato_hr_profilo_id = h.id and m.deleted_at is null),
         (select count(distinct x.order_id)::int from (
            select a.order_id from public.order_campo_assignments a
             where h.user_id is not null and a.user_id = h.user_id and a.company_id = h.company_id
               and (a.data_fine_prevista is null or a.data_fine_prevista >= v_oggi)
            union
            select sc.order_id from public.squadre_commesse sc
             where sc.squadra_id = t.id and (sc.al is null or sc.al >= v_oggi)
          ) x),
         t.id,
         t.name,
         t.color
    from public.hr_profili h
    left join public.employees e on e.id = h.employee_id
    left join public.squadre_componenti sq on sq.hr_profilo_id = h.id
    left join public.external_teams t on t.id = sq.squadra_id and t.is_active
   where h.company_id = p_company_id
     and h.lavora_in_cantiere
   order by coalesce(h.attivo, true) desc, h.cognome, h.nome;
end;
$$;
revoke all on function public.manodopera_operai(uuid) from public, anon;
grant execute on function public.manodopera_operai(uuid) to authenticated;

-- ── Giornata: con mezzi e rapportino ──
drop function if exists public.manodopera_oggi(uuid, date);
create function public.manodopera_oggi(p_company_id uuid, p_giorno date default null)
returns table (
  profilo_id uuid,
  nome text,
  cognome text,
  mansione text,
  colore_avatar text,
  stato text,
  assenza text,
  prima_entrata time,
  ultima_uscita time,
  ultimo_tipo text,
  ultima_ora time,
  ore_lavorate numeric,
  fuori_zona boolean,
  cantiere_id uuid,
  cantiere text,
  previsto_id uuid,
  previsto text,
  squadra_id uuid,
  squadra text,
  squadra_colore text,
  mezzi text,
  rapportino text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
#variable_conflict use_column
declare
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_giorno date := coalesce(p_giorno, (now() at time zone 'Europe/Rome')::date);
begin
  if not public.has_permission_for_company(auth.uid(), 'can_view_operai', p_company_id) then
    raise exception using errcode = '42501', message = 'Non hai il permesso di vedere gli operai di questa azienda.';
  end if;

  return query
  with operai as (
    select h.id, h.nome, h.cognome, h.user_id, h.colore_avatar,
           coalesce(nullif(h.mansione, ''), nullif(e.qualifica, '')) as mansione,
           t.id as squadra_id, t.name as squadra, t.color as squadra_colore
      from public.hr_profili h
      left join public.employees e on e.id = h.employee_id
      left join public.squadre_componenti sq on sq.hr_profilo_id = h.id
      left join public.external_teams t on t.id = sq.squadra_id and t.is_active
     where h.company_id = p_company_id and h.lavora_in_cantiere and coalesce(h.attivo, true)
  ),
  timbri as (
    select t.profilo_id, t.tipo, t.timestamp, t.ora_evento, t.posizione_esito, t.order_id
      from public.hr_timbrature t
     where t.company_id = p_company_id and t.data_evento = v_giorno
       and t.profilo_id in (select o.id from operai o)
  ),
  ultimo as (
    select distinct on (t.profilo_id) t.profilo_id, t.tipo, t.ora_evento
      from timbri t
     order by t.profilo_id, t.timestamp desc
  ),
  riepilogo as (
    select t.profilo_id,
           min(t.ora_evento) filter (where t.tipo = 'entrata') as prima_entrata,
           max(t.ora_evento) filter (where t.tipo = 'uscita') as ultima_uscita,
           bool_or(t.posizione_esito = 'fuori') as fuori_zona
      from timbri t
     group by t.profilo_id
  ),
  cantiere_timbrato as (
    select distinct on (x.profilo_id) x.profilo_id, x.order_id
      from (
        select t.profilo_id, t.order_id, t.timestamp as quando
          from timbri t where t.order_id is not null
        union all
        select o.id, c.order_id, c.timestamp_evento
          from public.campo_timbrature c
          join operai o on o.user_id = c.user_id
         where c.company_id = p_company_id and c.order_id is not null
           and (c.timestamp_evento at time zone 'Europe/Rome')::date = v_giorno
      ) x
     order by x.profilo_id, x.quando desc
  ),
  previsto as (
    select distinct on (x.profilo_id) x.profilo_id, x.order_id
      from (
        -- Assegnato alla persona (a mano o con la squadra)…
        select o.id as profilo_id, a.order_id, 1 as peso, a.is_capocantiere as capo, a.data_inizio as dal
          from operai o
          join public.order_campo_assignments a
            on a.user_id = o.user_id and a.company_id = p_company_id
         where (a.data_inizio is null or a.data_inizio <= v_giorno)
           and (a.data_fine_prevista is null or a.data_fine_prevista >= v_giorno)
        union all
        -- …o la sua squadra è su quella commessa (vale anche per chi non ha l'app).
        select o.id, sc.order_id, 2, false, sc.dal
          from operai o
          join public.squadre_commesse sc on sc.squadra_id = o.squadra_id
         where (sc.dal is null or sc.dal <= v_giorno)
           and (sc.al is null or sc.al >= v_giorno)
      ) x
      join public.orders ord on ord.id = x.order_id and ord.deleted_at is null
     order by x.profilo_id, x.capo desc, x.peso, x.dal desc nulls last
  ),
  assente as (
    select distinct on (x.profilo_id) x.profilo_id, x.motivo
      from (
        select r.profilo_id, r.tipo as motivo, 1 as peso
          from public.hr_richieste r
         where r.company_id = p_company_id and r.stato = 'approvata'
           and r.tipo not in ('straordinario', 'cambio_turno', 'rimborso')
           and r.data_inizio <= v_giorno and coalesce(r.data_fine, r.data_inizio) >= v_giorno
        union all
        select a.hr_profilo_id, a.tipo, 2
          from public.hr_assenze_eventi a
         where a.company_id = p_company_id
           and a.data_inizio <= v_giorno and coalesce(a.data_fine, a.data_inizio) >= v_giorno
        union all
        select g.profilo_id, g.stato, 3
          from public.hr_giornate g
         where g.company_id = p_company_id and g.data = v_giorno
           and g.stato is not null and g.stato not in ('presente', 'smart_working', 'trasferta')
      ) x
     order by x.profilo_id, x.peso
  ),
  commesse as (
    select ord.id,
           concat_ws(' · ', nullif(ord.order_code, ''), nullif(ord.client_name, ''),
                     nullif(coalesce(nullif(ord.indirizzo_lavori, ''), ord.work_address), '')) as etichetta
      from public.orders ord
     where ord.id in (select ct.order_id from cantiere_timbrato ct union select pv.order_id from previsto pv)
  )
  select o.id,
         o.nome,
         o.cognome,
         o.mansione,
         o.colore_avatar,
         case
           when u.tipo in ('entrata', 'pausa_fine') and v_giorno < v_oggi then 'uscita_mancante'
           when u.tipo in ('entrata', 'pausa_fine') then 'al_lavoro'
           when u.tipo = 'pausa_inizio' then 'in_pausa'
           when u.tipo = 'uscita' then 'uscito'
           when ass.motivo is not null then 'assente'
           when public.manodopera_giorno_di_riposo(o.id, v_giorno) then 'riposo'
           else 'non_timbrato'
         end,
         ass.motivo,
         r.prima_entrata,
         r.ultima_uscita,
         u.tipo,
         u.ora_evento,
         case when v_giorno = v_oggi or g.ore_lavorate is null
              then coalesce(public.manodopera_ore_timbrate(o.id, v_giorno), g.ore_lavorate)
              else g.ore_lavorate end,
         coalesce(r.fuori_zona, false),
         ct.order_id,
         cc.etichetta,
         pv.order_id,
         cp.etichetta,
         o.squadra_id,
         o.squadra,
         o.squadra_colore,
         -- I mezzi che aveva in carico quel giorno (dallo storico dei mezzi).
         (select string_agg(distinct m.nome, ', ')
            from public.mezzi_assegnazioni ma
            join public.mezzi m on m.id = ma.mezzo_id and m.deleted_at is null
           where ma.hr_profilo_id = o.id
             and (ma.dal at time zone 'Europe/Rome')::date <= v_giorno
             and (ma.al is null or (ma.al at time zone 'Europe/Rome')::date >= v_giorno)),
         (select left(cr.descrizione_lavori, 200)
            from public.campo_rapportini cr
           where o.user_id is not null and cr.user_id = o.user_id and cr.data_lavoro = v_giorno
           order by cr.created_at desc limit 1)
    from operai o
    left join ultimo u on u.profilo_id = o.id
    left join riepilogo r on r.profilo_id = o.id
    left join assente ass on ass.profilo_id = o.id
    left join public.hr_giornate g on g.profilo_id = o.id and g.data = v_giorno
    left join cantiere_timbrato ct on ct.profilo_id = o.id
    left join commesse cc on cc.id = ct.order_id
    left join previsto pv on pv.profilo_id = o.id
    left join commesse cp on cp.id = pv.order_id
   order by o.squadra nulls last, o.cognome, o.nome;
end;
$$;
revoke all on function public.manodopera_oggi(uuid, date) from public, anon;
grant execute on function public.manodopera_oggi(uuid, date) to authenticated;

-- ── Scheda operaio: senza costo ──
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

-- ── Salva operaio: il costo solo con il Personale ──
create or replace function public.manodopera_salva_operaio(
  p_company_id uuid,
  p_profilo_id uuid,
  p_dati jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := p_profilo_id;
  v_h public.hr_profili;
  v_email text := nullif(lower(trim(coalesce(p_dati->>'email', ''))), '');
  v_nome text := nullif(trim(coalesce(p_dati->>'nome', '')), '');
  v_cognome text := nullif(trim(coalesce(p_dati->>'cognome', '')), '');
  v_costo numeric;
  -- Il costo di una persona lo scrive solo chi vede il Personale.
  v_costi boolean := public.has_permission_for_company(auth.uid(), 'can_view_persone', p_company_id);
begin
  if not public.has_permission_for_company(v_uid, 'can_edit_operai', p_company_id) then
    raise exception using errcode = '42501', message = 'Non hai il permesso di modificare gli operai.';
  end if;

  if v_id is null then
    if v_nome is null or v_cognome is null then
      raise exception using errcode = '22023', message = 'Scrivi nome e cognome dell''operaio.';
    end if;

    if v_email is not null then
      select h.id into v_id
        from public.hr_profili h
       where h.company_id = p_company_id and lower(h.email) = v_email
       order by h.lavora_in_cantiere desc, h.created_at
       limit 1;
    end if;

    if v_id is null then
      insert into public.hr_profili (company_id, nome, cognome, telefono, email, mansione,
                                     data_assunzione, tipo_contratto, attivo, lavora_in_cantiere)
      values (p_company_id, v_nome, v_cognome,
              nullif(trim(coalesce(p_dati->>'telefono', '')), ''),
              v_email,
              nullif(trim(coalesce(p_dati->>'mansione', '')), ''),
              nullif(p_dati->>'data_assunzione', '')::date,
              nullif(p_dati->>'tipo_contratto', ''),
              true, true)
      returning id into v_id;
    else
      update public.hr_profili
         set lavora_in_cantiere = true,
             attivo = true,
             telefono = coalesce(nullif(telefono, ''), nullif(trim(coalesce(p_dati->>'telefono', '')), '')),
             mansione = coalesce(nullif(mansione, ''), nullif(trim(coalesce(p_dati->>'mansione', '')), '')),
             updated_at = now()
       where id = v_id;
    end if;
  else
    select * into v_h from public.hr_profili where id = v_id and company_id = p_company_id;
    if not found
       or (not v_h.lavora_in_cantiere
           and not public.has_permission_for_company(v_uid, 'can_view_persone', p_company_id)) then
      raise exception using errcode = '42501', message = 'Questo operaio non c''è o non puoi modificarlo.';
    end if;
    if (p_dati ? 'nome' and v_nome is null) or (p_dati ? 'cognome' and v_cognome is null) then
      raise exception using errcode = '22023', message = 'Nome e cognome non possono restare vuoti.';
    end if;

    update public.hr_profili
       set nome            = case when p_dati ? 'nome' then v_nome else nome end,
           cognome         = case when p_dati ? 'cognome' then v_cognome else cognome end,
           telefono        = case when p_dati ? 'telefono' then nullif(trim(coalesce(p_dati->>'telefono', '')), '') else telefono end,
           email           = case when p_dati ? 'email' then v_email else email end,
           mansione        = case when p_dati ? 'mansione' then nullif(trim(coalesce(p_dati->>'mansione', '')), '') else mansione end,
           data_assunzione = case when p_dati ? 'data_assunzione' then nullif(p_dati->>'data_assunzione', '')::date else data_assunzione end,
           tipo_contratto  = case when p_dati ? 'tipo_contratto' then nullif(p_dati->>'tipo_contratto', '') else tipo_contratto end,
           attivo          = case when p_dati ? 'attivo' then coalesce((p_dati->>'attivo')::boolean, true) else attivo end,
           lavora_in_cantiere = case when p_dati ? 'lavora_in_cantiere'
                                     then coalesce((p_dati->>'lavora_in_cantiere')::boolean, lavora_in_cantiere)
                                     else lavora_in_cantiere end,
           updated_at      = now()
     where id = v_id;
  end if;

  select * into v_h from public.hr_profili where id = v_id;

  -- La scheda del costo (employees) la crea il trigger della fase 0; qui la si
  -- tiene allineata a nome, contatti e mansione, e si scrive il costo.
  if v_h.employee_id is not null then
    if v_costi and p_dati ? 'costo_orario' then
      v_costo := public.numero_italiano(p_dati->>'costo_orario');
      if v_costo is not null and v_costo < 0 then
        raise exception using errcode = '22023', message = 'Il costo orario non può essere negativo.';
      end if;
    end if;

    -- is_active lo allinea già il trigger sync_attivo_hr_verso_employee; l'email
    -- si scrive a parte e solo se cambia, perché il trigger dell'email collega
    -- da solo un account con lo stesso indirizzo.
    update public.employees
       set first_name     = v_h.nome,
           last_name      = v_h.cognome,
           phone          = coalesce(nullif(v_h.telefono, ''), phone),
           qualifica      = coalesce(nullif(v_h.mansione, ''), qualifica),
           costo_orario   = case when v_costi and p_dati ? 'costo_orario' then nullif(v_costo, 0) else costo_orario end,
           gross_salary   = case when v_costi and p_dati ? 'stipendio_lordo'
                                 then public.numero_italiano(p_dati->>'stipendio_lordo')
                                 else gross_salary end,
           monthly_hours  = case when v_costi and p_dati ? 'ore_mese'
                                 then round(public.numero_italiano(p_dati->>'ore_mese'))::int
                                 else monthly_hours end,
           updated_at     = now()
     where id = v_h.employee_id;

    if v_h.email is not null then
      update public.employees
         set email = v_h.email
       where id = v_h.employee_id and email is distinct from v_h.email;
    end if;
  end if;

  return v_id;
end;
$$;
revoke all on function public.manodopera_salva_operaio(uuid, uuid, jsonb) from public, anon;
grant execute on function public.manodopera_salva_operaio(uuid, uuid, jsonb) to authenticated;

-- ── 1. Il costo delle persone, nel Personale ────────────────────────────────
create or replace function public.personale_costo(p_profilo_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_h public.hr_profili;
  v_e public.employees;
begin
  select * into v_h from public.hr_profili where id = p_profilo_id;
  if not found or not public.has_permission_for_company(auth.uid(), 'can_view_persone', v_h.company_id) then
    raise exception using errcode = '42501', message = 'Non puoi vedere il costo di questa persona.';
  end if;
  select * into v_e from public.employees where id = v_h.employee_id;
  return jsonb_build_object(
    'ha_scheda_costo', v_h.employee_id is not null,
    'costo_orario', public.manodopera_costo_orario(v_h.employee_id),
    'costo_orario_scritto', case when coalesce(v_e.costo_orario, 0) > 0 then v_e.costo_orario end,
    'stipendio_lordo', v_e.gross_salary,
    'ore_mese', v_e.monthly_hours,
    'contributi_percento', coalesce(v_e.inps_rate, 28)
  );
end;
$$;
revoke all on function public.personale_costo(uuid) from public, anon;
grant execute on function public.personale_costo(uuid) to authenticated;

-- p_dati: costo_orario, stipendio_lordo, ore_mese, contributi_percento (vuoto
-- = da calcolare / non indicato). Se la persona non ha ancora la scheda del
-- costo, la crea.
create or replace function public.personale_salva_costo(p_profilo_id uuid, p_dati jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_h public.hr_profili;
  v_emp uuid;
  v_num numeric;
begin
  select * into v_h from public.hr_profili where id = p_profilo_id;
  if not found or not public.has_permission_for_company(auth.uid(), 'can_view_persone', v_h.company_id) then
    raise exception using errcode = '42501', message = 'Non puoi modificare il costo di questa persona.';
  end if;

  v_emp := v_h.employee_id;
  if v_emp is null then
    perform set_config('manodopera.crea_da_scheda', 'on', true);
    insert into public.employees (company_id, first_name, last_name, email, phone, user_id, is_active, role_type, area, data_assunzione, qualifica)
    values (v_h.company_id, v_h.nome, v_h.cognome, nullif(trim(v_h.email), ''), v_h.telefono,
            case when v_h.user_id is not null
                      and not exists (select 1 from public.employees x where x.company_id = v_h.company_id and x.user_id = v_h.user_id)
                 then v_h.user_id end,
            coalesce(v_h.attivo, true),
            case when v_h.lavora_in_cantiere then 'operaio' else 'staff_interno' end,
            case when v_h.lavora_in_cantiere then 'cantiere' else 'amministrazione' end,
            v_h.data_assunzione, v_h.mansione)
    returning id into v_emp;
    perform set_config('manodopera.crea_da_scheda', '', true);
    update public.hr_profili set employee_id = v_emp where id = v_h.id;
  end if;

  if p_dati ? 'costo_orario' then
    v_num := public.numero_italiano(p_dati->>'costo_orario');
    if v_num is not null and v_num < 0 then
      raise exception using errcode = '22023', message = 'Il costo orario non può essere negativo.';
    end if;
    update public.employees set costo_orario = nullif(v_num, 0) where id = v_emp;
  end if;
  if p_dati ? 'stipendio_lordo' then
    update public.employees
       set gross_salary = public.numero_italiano(p_dati->>'stipendio_lordo')
     where id = v_emp;
  end if;
  if p_dati ? 'ore_mese' then
    update public.employees
       set monthly_hours = round(public.numero_italiano(p_dati->>'ore_mese'))::int
     where id = v_emp;
  end if;
  if p_dati ? 'contributi_percento' then
    update public.employees
       set inps_rate = coalesce(public.numero_italiano(p_dati->>'contributi_percento'), 28)
     where id = v_emp;
  end if;
end;
$$;
revoke all on function public.personale_salva_costo(uuid, jsonb) from public, anon;
grant execute on function public.personale_salva_costo(uuid, jsonb) to authenticated;

-- ── Il cantiere previsto per una persona in un giorno ───────────────────────
-- Assegnato a lei (a mano o con la squadra) o alla sua squadra; il capocantiere
-- prima, poi l'assegnazione personale, poi la più recente.
create or replace function public.manodopera_cantiere_previsto(p_profilo_id uuid, p_giorno date)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select x.order_id
    from (
      select a.order_id, 1 as peso, coalesce(a.is_capocantiere, false) as capo, a.data_inizio as dal
        from public.hr_profili h
        join public.order_campo_assignments a on a.user_id = h.user_id and a.company_id = h.company_id
       where h.id = p_profilo_id and h.user_id is not null
         and (a.data_inizio is null or a.data_inizio <= p_giorno)
         and (a.data_fine_prevista is null or a.data_fine_prevista >= p_giorno)
      union all
      select sc.order_id, 2, false, sc.dal
        from public.squadre_componenti c
        join public.external_teams t on t.id = c.squadra_id and t.is_active
        join public.squadre_commesse sc on sc.squadra_id = c.squadra_id
       where c.hr_profilo_id = p_profilo_id
         and (sc.dal is null or sc.dal <= p_giorno)
         and (sc.al is null or sc.al >= p_giorno)
    ) x
    join public.orders o on o.id = x.order_id and o.deleted_at is null
   order by x.capo desc, x.peso, x.dal desc nulls last
   limit 1
$$;
revoke all on function public.manodopera_cantiere_previsto(uuid, date) from public, anon, authenticated;

create or replace function public.manodopera_etichetta_commessa(p_order_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select concat_ws(' · ', nullif(o.order_code, ''), nullif(o.client_name, ''),
                   nullif(coalesce(nullif(o.indirizzo_lavori, ''), o.work_address), ''))
    from public.orders o where o.id = p_order_id
$$;
revoke all on function public.manodopera_etichetta_commessa(uuid) from public, anon, authenticated;

-- ── 4. Il calendario del mese di un operaio ─────────────────────────────────
create or replace function public.manodopera_operaio_mese(p_profilo_id uuid, p_mese date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_h public.hr_profili;
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_inizio date := date_trunc('month', coalesce(p_mese, v_oggi))::date;
  v_fine date := (date_trunc('month', coalesce(p_mese, v_oggi)) + interval '1 month - 1 day')::date;
begin
  select * into v_h from public.hr_profili where id = p_profilo_id;
  if not found
     or not public.has_permission_for_company(v_uid, 'can_view_operai', v_h.company_id)
     or (not v_h.lavora_in_cantiere
         and not public.has_permission_for_company(v_uid, 'can_view_persone', v_h.company_id)) then
    raise exception using errcode = '42501', message = 'Questo operaio non c''è o non puoi vederlo.';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'data', d.giorno,
             'futuro', d.giorno > v_oggi,
             'stato', case
                        when t.prima is not null or t.ultima is not null then 'presente'
                        when ass.motivo is not null then 'assente'
                        when public.manodopera_giorno_di_riposo(v_h.id, d.giorno) then 'riposo'
                        when d.giorno > v_oggi then 'futuro'
                        else 'non_timbrato'
                      end,
             'assenza', ass.motivo,
             'prima_entrata', coalesce(g.prima_entrata, t.prima),
             'ultima_uscita', coalesce(g.ultima_uscita, t.ultima),
             'uscita_mancante', t.ultimo_tipo in ('entrata', 'pausa_fine') and d.giorno < v_oggi,
             'fuori_zona', coalesce(t.fuori, false),
             'ore', case when d.giorno = v_oggi or g.ore_lavorate is null
                         then coalesce(public.manodopera_ore_timbrate(v_h.id, d.giorno), g.ore_lavorate)
                         else g.ore_lavorate end,
             'cantiere_id', coalesce(ct.order_id, public.manodopera_cantiere_previsto(v_h.id, d.giorno)),
             'cantiere', public.manodopera_etichetta_commessa(coalesce(ct.order_id, public.manodopera_cantiere_previsto(v_h.id, d.giorno))),
             'cantiere_timbrato', ct.order_id is not null,
             'mezzi', (select string_agg(distinct m.nome, ', ')
                         from public.mezzi_assegnazioni ma
                         join public.mezzi m on m.id = ma.mezzo_id and m.deleted_at is null
                        where ma.hr_profilo_id = v_h.id
                          and (ma.dal at time zone 'Europe/Rome')::date <= d.giorno
                          and (ma.al is null or (ma.al at time zone 'Europe/Rome')::date >= d.giorno)),
             'rapportino', (select left(cr.descrizione_lavori, 300)
                              from public.campo_rapportini cr
                             where v_h.user_id is not null and cr.user_id = v_h.user_id and cr.data_lavoro = d.giorno
                             order by cr.created_at desc limit 1))
           order by d.giorno)
      from generate_series(v_inizio, v_fine, interval '1 day') as d0(g0)
      cross join lateral (select d0.g0::date as giorno) d
      left join lateral (
        select min(x.ora_evento) filter (where x.tipo = 'entrata') as prima,
               max(x.ora_evento) filter (where x.tipo = 'uscita') as ultima,
               (array_agg(x.tipo order by x.timestamp desc))[1] as ultimo_tipo,
               bool_or(x.posizione_esito = 'fuori') as fuori
          from public.hr_timbrature x
         where x.profilo_id = v_h.id and x.data_evento = d.giorno
      ) t on true
      left join public.hr_giornate g on g.profilo_id = v_h.id and g.data = d.giorno
      left join lateral (
        select y.motivo from (
          select r.tipo as motivo, 1 as peso from public.hr_richieste r
           where r.profilo_id = v_h.id and r.stato = 'approvata'
             and r.tipo not in ('straordinario', 'cambio_turno', 'rimborso')
             and r.data_inizio <= d.giorno and coalesce(r.data_fine, r.data_inizio) >= d.giorno
          union all
          select a.tipo, 2 from public.hr_assenze_eventi a
           where a.hr_profilo_id = v_h.id and a.data_inizio <= d.giorno and coalesce(a.data_fine, a.data_inizio) >= d.giorno
          union all
          select g2.stato, 3 from public.hr_giornate g2
           where g2.profilo_id = v_h.id and g2.data = d.giorno
             and g2.stato is not null and g2.stato not in ('presente', 'smart_working', 'trasferta')
        ) y order by y.peso limit 1
      ) ass on true
      left join lateral (
        select c.order_id from public.campo_timbrature c
         where v_h.user_id is not null and c.user_id = v_h.user_id and c.order_id is not null
           and (c.timestamp_evento at time zone 'Europe/Rome')::date = d.giorno
         order by c.timestamp_evento desc limit 1
      ) ct on true), '[]'::jsonb);
end;
$$;
revoke all on function public.manodopera_operaio_mese(uuid, date) from public, anon;
grant execute on function public.manodopera_operaio_mese(uuid, date) to authenticated;

-- ── 3. Cosa è successo quel giorno ──────────────────────────────────────────
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
      select cr.created_at as quando, 'rapportino'::text as tipo,
             'Rapportino' || case when cr.ore_lavorate is not null then ' · ' || trim(to_char(cr.ore_lavorate, 'FM990D0')) || ' h' else '' end as titolo,
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
      select g.created_at, 'giornale',
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
