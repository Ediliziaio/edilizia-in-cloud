-- Manodopera e Mezzi, fase 1: il permesso «Operai» e le letture della
-- scheda operai per l'ufficio (26/09/2026, richiesta di Florin).
--
-- La nuova voce di menu «Manodopera e Mezzi» ha tre schede — Operai,
-- Subappaltatori, Mezzi e attrezzature — e ognuna ha il suo permesso. Quello
-- degli operai non c'era:
--   · due colonne su staff_permissions, can_view_operai e can_edit_operai, che
--     has_permission_for_company legge per nome come tutte le altre;
--   · la modifica segue la visibilità salvo «Sola lettura» (trigger
--     permessi_modifica_segue_visibilita, come per i mezzi il 24/09);
--   · chi oggi vede i dipendenti o il Personale continua a vedere gli operai
--     (10 persone): nessuno perde niente.
--
-- Le tabelle del Personale (hr_profili, hr_timbrature, hr_giornate,
-- hr_documenti) restano chiuse come oggi: dentro ci sono IBAN, PIN di
-- timbratura, contatti privati e note interne, che chi organizza i cantieri
-- non deve vedere. L'ufficio legge gli operai attraverso quattro funzioni che
-- controllano il permesso e restituiscono solo i campi che servono:
--   · manodopera_operai(azienda)          elenco con costo orario, documenti
--                                          scaduti, mezzi in carico, cantieri;
--   · manodopera_oggi(azienda, giorno)    chi è al lavoro, in pausa, uscito,
--                                          assente o non ha timbrato;
--   · manodopera_operaio(scheda)          la scheda del singolo operaio;
--   · manodopera_salva_operaio(...)       crea o modifica un operaio (la
--                                          scheda del costo la crea il trigger
--                                          della fase 0).
-- Stipendio lordo, ore al mese e contributi li vede solo chi può modificare gli
-- operai; il costo orario lo vede chi li vede, perché è quello che finisce
-- sulle commesse.
--
-- Idempotente. Scrive 10 righe di staff_permissions: lock e tempi stretti.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── Colonne ─────────────────────────────────────────────────────────────────
alter table public.staff_permissions
  add column if not exists can_view_operai boolean not null default false,
  add column if not exists can_edit_operai boolean not null default false;

comment on column public.staff_permissions.can_view_operai is
  'Vede gli operai in Manodopera e Mezzi (elenco, presenze del giorno, scheda). La modifica la deriva il trigger permessi_modifica_segue_visibilita.';
comment on column public.staff_permissions.can_edit_operai is
  'Modifica gli operai (crea, cambia, costo orario): = can_view_operai se non in sola lettura (trigger).';

-- ── La modifica segue la visibilità, anche per gli operai ───────────────────
create or replace function public.permessi_modifica_segue_visibilita()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  scrive boolean := not coalesce(new.sola_lettura, false);
begin
  new.can_edit_orders                  := coalesce(new.can_view_orders, false) and scrive;
  new.can_edit_warehouse               := coalesce(new.can_view_warehouse, false) and scrive;
  new.can_edit_mezzi                   := coalesce(new.can_view_mezzi, false) and scrive;
  new.can_edit_operai                  := coalesce(new.can_view_operai, false) and scrive;
  new.can_edit_customers               := coalesce(new.can_view_customers, false) and scrive;
  new.can_edit_tickets                 := coalesce(new.can_view_tickets, false) and scrive;
  new.can_edit_giornale_lavori         := coalesce(new.can_view_giornale_lavori, false) and scrive;
  new.can_edit_marketing_contacts      := coalesce(new.can_view_marketing_contacts, false) and scrive;
  new.can_edit_marketing_opportunities := coalesce(new.can_view_marketing_opportunities, false) and scrive;
  new.can_edit_preventivi              := coalesce(new.can_view_preventivi, false) and scrive;
  new.can_edit_marketing               := new.can_edit_marketing_contacts or new.can_edit_marketing_opportunities;

  if not scrive then
    new.can_edit_settings                := false;
    new.can_edit_settings_profile        := false;
    new.can_edit_settings_orders         := false;
    new.can_edit_settings_customization  := false;
    new.can_edit_settings_people         := false;
    new.can_edit_settings_pricing        := false;
    new.can_edit_settings_scontistica    := false;
    new.can_edit_settings_finanziamenti  := false;
    new.can_edit_settings_bundle         := false;
    new.can_edit_settings_suppliers      := false;
    new.can_edit_settings_integrations   := false;
    new.can_manage_payments              := false;
    new.can_manage_suppliers             := false;
    new.can_manage_warehouse_items       := false;
    new.can_manage_portal                := false;
    new.can_approve_orders               := false;
    new.can_approve_discounts            := false;
    new.can_delete_orders                := false;
  end if;

  return new;
end;
$$;
revoke all on function public.permessi_modifica_segue_visibilita() from public, anon, authenticated;

-- ── Chi vedeva dipendenti o Personale continua a vedere gli operai ──────────
update public.staff_permissions
   set can_view_operai = true
 where (can_view_employees or can_view_persone) and not can_view_operai;

-- ── Il costo orario di un operaio (stessa formula di costo_orario_dipendente,
--    senza il controllo d'accesso: lo fanno le funzioni che la chiamano) ─────
create or replace function public.manodopera_costo_orario(p_employee_id uuid)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when e.costo_orario is not null and e.costo_orario > 0 then e.costo_orario
    when coalesce(e.gross_salary, 0) > 0 and coalesce(e.monthly_hours, 0) > 0
      then round((e.gross_salary * (1 + coalesce(e.inps_rate, 28) / 100.0)) / e.monthly_hours, 2)
    else null
  end
  from public.employees e
  where e.id = p_employee_id
$$;
revoke all on function public.manodopera_costo_orario(uuid) from public, anon, authenticated;

-- ── Le ore di un giorno contate dalle timbrature ────────────────────────────
-- Entrata→uscita e fine pausa→inizio pausa; oggi conta anche il tratto ancora
-- aperto. Serve dove la giornata (hr_giornate) non c'è ancora o, per oggi, è
-- ferma all'ultima uscita. Nessuna timbratura: null.
create or replace function public.manodopera_ore_timbrate(p_profilo_id uuid, p_giorno date)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  with t as (
    select tipo,
           "timestamp" as quando,
           lag(tipo) over (order by "timestamp") as tipo_prima,
           lag("timestamp") over (order by "timestamp") as quando_prima,
           row_number() over (order by "timestamp" desc) as dal_fondo
      from public.hr_timbrature
     where profilo_id = p_profilo_id and data_evento = p_giorno
  )
  select round((
           coalesce(sum(extract(epoch from quando - quando_prima))
                      filter (where tipo in ('uscita', 'pausa_inizio') and tipo_prima in ('entrata', 'pausa_fine')), 0)
         + coalesce(max(extract(epoch from now() - quando))
                      filter (where dal_fondo = 1 and tipo in ('entrata', 'pausa_fine')
                                and p_giorno = (now() at time zone 'Europe/Rome')::date), 0)
         ) / 3600.0, 2)
    from t
  having count(*) > 0
$$;
revoke all on function public.manodopera_ore_timbrate(uuid, date) from public, anon, authenticated;

-- ── Elenco operai ───────────────────────────────────────────────────────────
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
  costo_orario numeric,
  costo_orario_scritto boolean,
  documenti_scaduti integer,
  documenti_in_scadenza integer,
  prossima_scadenza date,
  mezzi text,
  cantieri_attivi integer
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
         public.manodopera_costo_orario(h.employee_id),
         coalesce(e.costo_orario, 0) > 0,
         (select count(*)::int from public.hr_documenti d
           where d.hr_profilo_id = h.id and d.data_scadenza < v_oggi),
         (select count(*)::int from public.hr_documenti d
           where d.hr_profilo_id = h.id and d.data_scadenza >= v_oggi
             and d.data_scadenza <= v_oggi + coalesce(d.alert_giorni_prima, 30)),
         (select min(d.data_scadenza) from public.hr_documenti d
           where d.hr_profilo_id = h.id and d.data_scadenza >= v_oggi),
         (select string_agg(m.nome, ', ' order by m.nome) from public.mezzi m
           where m.assegnato_hr_profilo_id = h.id and m.deleted_at is null),
         (select count(distinct a.order_id)::int from public.order_campo_assignments a
           where h.user_id is not null and a.user_id = h.user_id and a.company_id = h.company_id
             and (a.data_fine_prevista is null or a.data_fine_prevista >= v_oggi))
    from public.hr_profili h
    left join public.employees e on e.id = h.employee_id
   where h.company_id = p_company_id
     and h.lavora_in_cantiere
   order by coalesce(h.attivo, true) desc, h.cognome, h.nome;
end;
$$;
revoke all on function public.manodopera_operai(uuid) from public, anon;
grant execute on function public.manodopera_operai(uuid) to authenticated;

-- ── La giornata degli operai ────────────────────────────────────────────────
-- stato: al_lavoro · in_pausa · uscito · uscita_mancante (giorno passato
-- senza uscita) · assente (ferie, permesso, malattia…: il motivo in «assenza»)
-- · non_timbrato. Il cantiere è quello della timbratura dall'app di cantiere,
-- se c'è; «previsto» è quello dell'assegnazione in commessa per quel giorno.
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
  previsto text
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
           coalesce(nullif(h.mansione, ''), nullif(e.qualifica, '')) as mansione
      from public.hr_profili h
      left join public.employees e on e.id = h.employee_id
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
    select distinct on (o.id) o.id as profilo_id, a.order_id
      from operai o
      join public.order_campo_assignments a
        on a.user_id = o.user_id and a.company_id = p_company_id
     where (a.data_inizio is null or a.data_inizio <= v_giorno)
       and (a.data_fine_prevista is null or a.data_fine_prevista >= v_giorno)
     order by o.id, a.is_capocantiere desc, a.data_inizio desc nulls last, a.created_at desc
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
         cp.etichetta
    from operai o
    left join ultimo u on u.profilo_id = o.id
    left join riepilogo r on r.profilo_id = o.id
    left join assente ass on ass.profilo_id = o.id
    left join public.hr_giornate g on g.profilo_id = o.id and g.data = v_giorno
    left join cantiere_timbrato ct on ct.profilo_id = o.id
    left join commesse cc on cc.id = ct.order_id
    left join previsto pv on pv.profilo_id = o.id
    left join commesse cp on cp.id = pv.order_id
   order by o.cognome, o.nome;
end;
$$;
revoke all on function public.manodopera_oggi(uuid, date) from public, anon;
grant execute on function public.manodopera_oggi(uuid, date) to authenticated;

-- ── Scheda del singolo operaio ──────────────────────────────────────────────
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
    'cantieri', coalesce((
      select jsonb_agg(jsonb_build_object(
               'order_id', a.order_id, 'codice', ord.order_code, 'cliente', ord.client_name,
               'indirizzo', coalesce(nullif(ord.indirizzo_lavori, ''), ord.work_address),
               'dal', a.data_inizio, 'al', a.data_fine_prevista,
               'capocantiere', coalesce(a.is_capocantiere, false),
               'in_corso', (a.data_fine_prevista is null or a.data_fine_prevista >= v_oggi))
             order by (a.data_fine_prevista is null or a.data_fine_prevista >= v_oggi) desc,
                      a.data_inizio desc nulls last)
        from public.order_campo_assignments a
        join public.orders ord on ord.id = a.order_id
       where v_h.user_id is not null and a.user_id = v_h.user_id
         and a.company_id = v_h.company_id), '[]'::jsonb),
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

-- ── Crea o modifica un operaio ──────────────────────────────────────────────
-- p_dati: nome, cognome, telefono, email, mansione, data_assunzione,
-- tipo_contratto, attivo, lavora_in_cantiere, costo_orario, stipendio_lordo,
-- ore_mese. Si cambiano solo le chiavi presenti. Una persona già nel Personale
-- con la stessa email non viene doppiata: diventa operaio.
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
    if p_dati ? 'costo_orario' then
      v_costo := nullif(replace(coalesce(p_dati->>'costo_orario', ''), ',', '.'), '')::numeric;
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
           costo_orario   = case when p_dati ? 'costo_orario' then nullif(v_costo, 0) else costo_orario end,
           gross_salary   = case when p_dati ? 'stipendio_lordo'
                                 then nullif(replace(coalesce(p_dati->>'stipendio_lordo', ''), ',', '.'), '')::numeric
                                 else gross_salary end,
           monthly_hours  = case when p_dati ? 'ore_mese'
                                 then nullif(p_dati->>'ore_mese', '')::numeric::int
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
