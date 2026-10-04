-- ============================================================================
-- Rapportini e presenze: ogni azienda sceglie come lavora (04/10/2026)
-- ============================================================================
-- Principio del titolare: il software si cuce sull'azienda, non il contrario.
-- Chi ha un capocantiere vuole UN rapportino per cantiere e giorno; chi lavora
-- a squadre piccole vuole che ognuno scriva il suo. Le ore possono venire
-- dalle timbrature o essere scritte dal capo. Tre scelte, per azienda:
--
--   chi_compila    'ognuno'   ogni operaio manda il suo rapportino (come oggi)
--                  'capo'     lo manda il capocantiere/caposquadra per tutti
--   ore_dalle      'capo'     il capo scrive a mano le ore di ognuno (come oggi)
--                  'timbrature' le ore partono da quelle timbrate; il capo
--                              conferma, aggiunge chi non ha timbrato e può
--                              correggere
--   avviso_scostamento_minuti
--                  null       nessun avviso (come oggi)
--                  N          il capo vede un avviso se le ore scritte
--                              differiscono dalle timbrate di più di N minuti
--
-- Senza riga in campo_regole_azienda valgono i valori «come oggi»: nessuna
-- azienda cambia comportamento finché non sceglie.
--
-- Qualunque sia il flusso scelto, UNA cosa non è una scelta: la stessa persona
-- non si conta due volte nello stesso giorno e cantiere. Per questo la lista
-- del capo ora dice anche chi è già stato registrato da un collega, e il
-- rapportino personale può sapere se le sue ore sono già nelle presenze di
-- qualcun altro (campo_ore_gia_registrate).
--
-- Tabella chiusa (RLS senza policy): si legge e si scrive solo dalle funzioni
-- qui sotto, che controllano il permesso. Idempotente.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── Le regole ───────────────────────────────────────────────────────────────
create table if not exists public.campo_regole_azienda (
  company_id                uuid primary key references public.companies(id) on delete cascade,
  chi_compila               text not null default 'ognuno'
                              check (chi_compila in ('ognuno', 'capo')),
  ore_dalle                 text not null default 'capo'
                              check (ore_dalle in ('capo', 'timbrature')),
  avviso_scostamento_minuti integer
                              check (avviso_scostamento_minuti is null
                                     or avviso_scostamento_minuti between 5 and 480),
  aggiornato_il             timestamptz not null default now(),
  aggiornato_da             uuid references auth.users(id) on delete set null
);
comment on table public.campo_regole_azienda is
  'Come l''azienda gestisce rapportini e presenze di cantiere. Nessuna riga = valori «come oggi». Si usa solo dalle funzioni campo_regole_*.';

alter table public.campo_regole_azienda enable row level security;
revoke all on table public.campo_regole_azienda from anon, authenticated;

-- ── Ore timbrate su UN cantiere in un giorno ────────────────────────────────
-- Come manodopera_ore_timbrate, ma contando solo i tratti del cantiere
-- chiesto (entrata→uscita e fine pausa→inizio pausa dello stesso cantiere).
-- null = nessuna timbratura quel giorno su quel cantiere.
create or replace function public.campo_ore_timbrate_cantiere(p_profilo_id uuid, p_order_id uuid, p_giorno date)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with t as (
    select tipo,
           "timestamp" as quando,
           order_id,
           lag(tipo) over w as tipo_prima,
           lag("timestamp") over w as quando_prima,
           lag(order_id) over w as order_prima,
           row_number() over (order by "timestamp" desc) as dal_fondo
      from public.hr_timbrature
     where profilo_id = p_profilo_id and data_evento = p_giorno
    window w as (order by "timestamp")
  )
  select jsonb_build_object(
           'ore', round((
               coalesce(sum(extract(epoch from quando - quando_prima))
                          filter (where tipo in ('uscita', 'pausa_inizio')
                                    and tipo_prima in ('entrata', 'pausa_fine')
                                    and order_prima = p_order_id), 0)
             + coalesce(max(extract(epoch from now() - quando))
                          filter (where dal_fondo = 1 and tipo in ('entrata', 'pausa_fine')
                                    and order_id = p_order_id
                                    and p_giorno = (now() at time zone 'Europe/Rome')::date), 0)
           ) / 3600.0, 2),
           'aperta', coalesce(bool_or(dal_fondo = 1 and tipo in ('entrata', 'pausa_fine')
                                      and order_id = p_order_id
                                      and p_giorno = (now() at time zone 'Europe/Rome')::date), false))
    from t
   where p_profilo_id is not null
  having count(*) filter (where order_id = p_order_id) > 0
$$;
revoke all on function public.campo_ore_timbrate_cantiere(uuid, uuid, date) from public, anon, authenticated;

-- ── Leggere le regole (ufficio) ─────────────────────────────────────────────
create or replace function public.campo_regole_azienda_leggi(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  r public.campo_regole_azienda;
begin
  if auth.uid() is null
     or not (public.campo_e_ufficio(p_company_id)
             or public.has_permission_for_company(auth.uid(), 'can_view_settings_orders', p_company_id)) then
    raise exception using errcode = '42501', message = 'Non puoi vedere queste impostazioni.';
  end if;
  select * into r from public.campo_regole_azienda where company_id = p_company_id;
  return jsonb_build_object(
    'chi_compila', coalesce(r.chi_compila, 'ognuno'),
    'ore_dalle', coalesce(r.ore_dalle, 'capo'),
    'avviso_scostamento_minuti', r.avviso_scostamento_minuti,
    'scelte_fatte', r.company_id is not null);
end;
$$;
revoke all on function public.campo_regole_azienda_leggi(uuid) from public, anon;
grant execute on function public.campo_regole_azienda_leggi(uuid) to authenticated;

-- ── Salvare le regole (ufficio) ─────────────────────────────────────────────
create or replace function public.campo_regole_azienda_salva(
  p_company_id uuid,
  p_chi_compila text,
  p_ore_dalle text,
  p_avviso_minuti integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception using errcode = '42501', message = 'Non puoi cambiare queste impostazioni.';
  end if;
  if p_chi_compila not in ('ognuno', 'capo') then
    raise exception using errcode = '22023', message = 'Scelta non valida: chi compila il rapportino.';
  end if;
  if p_ore_dalle not in ('capo', 'timbrature') then
    raise exception using errcode = '22023', message = 'Scelta non valida: da dove vengono le ore.';
  end if;
  if p_avviso_minuti is not null and (p_avviso_minuti < 5 or p_avviso_minuti > 480) then
    raise exception using errcode = '22023', message = 'Lo scostamento va da 5 minuti a 8 ore.';
  end if;

  insert into public.campo_regole_azienda as r (company_id, chi_compila, ore_dalle, avviso_scostamento_minuti, aggiornato_il, aggiornato_da)
  values (p_company_id, p_chi_compila, p_ore_dalle, p_avviso_minuti, now(), auth.uid())
  on conflict (company_id) do update
     set chi_compila = excluded.chi_compila,
         ore_dalle = excluded.ore_dalle,
         avviso_scostamento_minuti = excluded.avviso_scostamento_minuti,
         aggiornato_il = now(),
         aggiornato_da = auth.uid();

  return public.campo_regole_azienda_leggi(p_company_id);
end;
$$;
revoke all on function public.campo_regole_azienda_salva(uuid, text, text, integer) from public, anon;
grant execute on function public.campo_regole_azienda_salva(uuid, text, text, integer) to authenticated;

-- ── Le regole che valgono su una commessa (app campo) ───────────────────────
-- Non c'è nulla di riservato: sono scelte di flusso. Le vede chi lavora su
-- quella commessa e l'ufficio; per tutti gli altri valgono i valori «come oggi».
create or replace function public.campo_regole_per_ordine(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_company uuid;
  r public.campo_regole_azienda;
begin
  select company_id into v_company from public.orders where id = p_order_id and deleted_at is null;
  if auth.uid() is not null and v_company is not null
     and (public.campo_e_ufficio(v_company)
          or exists (select 1 from public.order_campo_assignments a
                      where a.order_id = p_order_id and a.user_id = auth.uid())) then
    select * into r from public.campo_regole_azienda where company_id = v_company;
  end if;
  return jsonb_build_object(
    'chi_compila', coalesce(r.chi_compila, 'ognuno'),
    'ore_dalle', coalesce(r.ore_dalle, 'capo'),
    'avviso_scostamento_minuti', r.avviso_scostamento_minuti);
end;
$$;
revoke all on function public.campo_regole_per_ordine(uuid) from public, anon;
grant execute on function public.campo_regole_per_ordine(uuid) to authenticated;

-- ── Le mie ore sono già nel rapportino di un collega? ───────────────────────
-- Se il capo ha già messo me nelle presenze di oggi su questo cantiere, il mio
-- rapportino personale non deve riportare le stesse ore. Conta solo ciò che è
-- inviato o approvato: un rapportino rifiutato non vale.
create or replace function public.campo_ore_gia_registrate(p_order_id uuid, p_giorno date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_giorno date := coalesce(p_giorno, (now() at time zone 'Europe/Rome')::date);
  v_company uuid;
  v_res jsonb;
begin
  select company_id into v_company from public.orders where id = p_order_id and deleted_at is null;
  if v_uid is null or v_company is null then
    return null;
  end if;

  select jsonb_build_object(
           'ore', sum(coalesce((pz->>'ore')::numeric, 0)),
           'da', max(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))))
    into v_res
    from public.campo_rapportini cr
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(cr.presenze) = 'array' then cr.presenze else '[]'::jsonb end) pz
    left join public.profiles p on p.id = cr.user_id
   where cr.order_id = p_order_id
     and cr.company_id = v_company
     and cr.data_lavoro = v_giorno
     and cr.user_id <> v_uid
     and cr.stato in ('inviato', 'approvato')
     and (pz->>'employee_id') in (select e.id::text from public.employees e
                                   where e.user_id = v_uid and e.company_id = v_company)
  having count(*) > 0;

  return v_res;
end;
$$;
revoke all on function public.campo_ore_gia_registrate(uuid, date) from public, anon;
grant execute on function public.campo_ore_gia_registrate(uuid, date) to authenticated;

-- ── La lista del capo: ore timbrate e chi è già registrato ──────────────────
-- Stessa funzione di prima (stessa logica per chi elenca), con tre campi in più
-- per ogni persona:
--   ore_timbrate       ore timbrate su QUESTO cantiere quel giorno (null = nessuna)
--   timbratura_aperta  è ancora dentro, l'uscita non c'è
--   gia_registrato_da_altri  un altro rapportino inviato/approvato la include già
create or replace function public.campo_squadra_rapportino(p_order_id uuid, p_giorno date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_giorno date := coalesce(p_giorno, (now() at time zone 'Europe/Rome')::date);
  v_tutto boolean;
  v_mie uuid[];
begin
  select company_id into v_company from public.orders where id = p_order_id and deleted_at is null;
  if v_uid is null or v_company is null then
    return '[]'::jsonb;
  end if;
  v_tutto := public.campo_e_ufficio(v_company)
             or exists (select 1 from public.order_campo_assignments a
                         where a.order_id = p_order_id and a.user_id = v_uid and a.is_capocantiere);
  v_mie := array(select sc.squadra_id from public.squadre_commesse sc
                  where sc.order_id = p_order_id and sc.squadra_id in (select public.campo_mie_squadre_capo()));
  if not v_tutto and cardinality(v_mie) = 0 then
    return '[]'::jsonb;
  end if;

  return coalesce((
    with righe as (
      -- le squadre del giorno
      select coalesce('emp-' || h.employee_id::text, 'hr-' || h.id::text) as key,
             h.employee_id, null::uuid as subappaltatore_id, h.user_id,
             trim(coalesce(h.nome, '') || ' ' || coalesce(h.cognome, '')) as nome,
             t.name as squadra, 1 as prio, h.id as profilo_id
        from public.squadre_commesse sc
        join public.external_teams t on t.id = sc.squadra_id and t.is_active
        join public.hr_profili h
          on h.company_id = sc.company_id and coalesce(h.attivo, true)
         and (h.id = t.responsabile_hr_profilo_id
              or exists (select 1 from public.squadre_componenti c where c.squadra_id = t.id and c.hr_profilo_id = h.id))
       where sc.order_id = p_order_id
         and (v_tutto or sc.squadra_id = any(v_mie))
         and (sc.dal is null or sc.dal <= v_giorno) and (sc.al is null or sc.al >= v_giorno)
      -- persone messe sulle fasi di quel giorno (o su tutta la commessa)
      union all
      select 'emp-' || e.id::text, e.id, null, e.user_id,
             trim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')), null, 2,
             (select hp.id from public.hr_profili hp
               where hp.employee_id = e.id and hp.company_id = v_company
               order by coalesce(hp.attivo, true) desc limit 1)
        from public.order_employees oe
        join public.employees e on e.id = oe.employee_id and coalesce(e.is_active, true)
        left join public.order_work_phases ph on ph.id = oe.phase_id
       where v_tutto and oe.order_id = p_order_id
         and (ph.id is null or ((ph.start_date is null or ph.start_date <= v_giorno)
                                and (ph.end_date is null or ph.end_date >= v_giorno)))
      -- ditte in subappalto
      union all
      select 'sub-' || ss.id::text, null, ss.id, s.user_id, ss.ragione_sociale, 'Ditta', 3, null::uuid
        from public.subappaltatori_sicurezza ss
        left join public.subappaltatori s on s.id = ss.campo_subappaltatore_id
       where v_tutto and ss.order_id = p_order_id
      -- chi ha l'accesso senza scheda del Personale
      union all
      select 'usr-' || a.user_id::text, null, null, a.user_id,
             trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), null, 4,
             public.hr_profilo_da_user(a.user_id, v_company)
        from public.order_campo_assignments a
        join public.profiles p on p.id = a.user_id
       where v_tutto and a.order_id = p_order_id and a.role_type = 'employee'
         and not exists (select 1 from public.employees e where e.user_id = a.user_id and e.company_id = v_company)
    ),
    uniche as (
      select distinct on (r.key) r.*
        from righe r
       where nullif(r.nome, '') is not null
       order by r.key, r.prio
    )
    select jsonb_agg(jsonb_build_object(
             'key', u.key,
             'employee_id', u.employee_id,
             'subappaltatore_id', u.subappaltatore_id,
             'nome', u.nome,
             'squadra', u.squadra,
             'sono_io', u.user_id is not null and u.user_id = v_uid,
             'rapportino_inviato', u.user_id is not null and u.user_id <> v_uid
                                   and exists (select 1 from public.campo_rapportini cr
                                                where cr.user_id = u.user_id and cr.order_id = p_order_id
                                                  and cr.data_lavoro = v_giorno),
             'ore_timbrate', (x.t->>'ore')::numeric,
             'timbratura_aperta', coalesce((x.t->>'aperta')::boolean, false),
             'gia_registrato_da_altri', u.employee_id is not null
                                   and exists (select 1
                                                 from public.campo_rapportini cr2
                                                 cross join lateral jsonb_array_elements(
                                                   case when jsonb_typeof(cr2.presenze) = 'array'
                                                        then cr2.presenze else '[]'::jsonb end) pz
                                                where cr2.order_id = p_order_id
                                                  and cr2.data_lavoro = v_giorno
                                                  and cr2.user_id <> v_uid
                                                  and cr2.stato in ('inviato', 'approvato')
                                                  and pz->>'employee_id' = u.employee_id::text))
           order by (u.squadra is null), u.squadra, u.nome)
      from uniche u
      left join lateral (select public.campo_ore_timbrate_cantiere(u.profilo_id, p_order_id, v_giorno) as t) x on true
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.campo_squadra_rapportino(uuid, date) from public, anon;
grant execute on function public.campo_squadra_rapportino(uuid, date) to authenticated;
