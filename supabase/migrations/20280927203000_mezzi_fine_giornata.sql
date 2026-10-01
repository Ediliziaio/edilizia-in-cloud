-- Mezzi e attrezzi a fine giornata (26/09/2026, richiesta del founder: «a fine
-- giornata consegna le attrezzature, se ha usato delle attrezzature»).
--
-- Nel rapportino l'operaio (o il capocantiere / caposquadra per il cantiere)
-- segna cosa ha usato oggi e dove resta stasera:
--   · un attrezzo: in cantiere, sul furgone, in magazzino, lo tengo io;
--   · un furgone o un'auto: usato oggi e i km a fine giornata.
-- La posizione del mezzo si aggiorna subito (lo storico delle assegnazioni la
-- registra da solo), l'uso del giorno resta in mezzi_giornate e compare nel
-- diario del giorno in Manodopera.
--
--   campo_mezzi_giornata(ordine)                 cosa può segnare chi scrive
--   campo_mezzi_fine_giornata(ordine, giorno, righe, rapportino)  salva

create table if not exists public.mezzi_giornate (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  mezzo_id uuid not null references public.mezzi(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  hr_profilo_id uuid references public.hr_profili(id) on delete set null,
  giorno date not null,
  usato boolean not null default true,
  dove text not null default 'invariato',
  su_mezzo_id uuid references public.mezzi(id) on delete set null,
  contatore numeric,
  rapportino_id uuid references public.campo_rapportini(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint mezzi_giornate_dove check (dove in ('cantiere', 'magazzino', 'furgone', 'con_me', 'invariato')),
  constraint mezzi_giornate_una unique (mezzo_id, giorno, user_id)
);
comment on table public.mezzi_giornate is
  'Uso dei mezzi e degli attrezzi a fine giornata, segnato dal rapportino (campo_mezzi_fine_giornata). Si scrive solo dalla RPC.';
create index if not exists idx_mezzi_giornate_company_giorno on public.mezzi_giornate (company_id, giorno);
create index if not exists idx_mezzi_giornate_mezzo on public.mezzi_giornate (mezzo_id, giorno);

alter table public.mezzi_giornate enable row level security;
revoke all on public.mezzi_giornate from anon;
drop policy if exists mezzi_giornate_lettura on public.mezzi_giornate;
create policy mezzi_giornate_lettura on public.mezzi_giornate for select to authenticated
  using (user_id = (select auth.uid())
         or public.has_permission_for_company((select auth.uid()), 'can_view_mezzi', company_id)
         or public.has_permission_for_company((select auth.uid()), 'can_view_operai', company_id));
drop policy if exists blocco_utente_bloccato on public.mezzi_giornate;
create policy blocco_utente_bloccato on public.mezzi_giornate
  as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));

-- ── Cosa posso segnare su questo cantiere ───────────────────────────────────
-- I miei mezzi (in carico a me), gli attrezzi caricati sopra, e quelli che
-- stanno su questo cantiere.
create or replace function public.campo_mezzi_ammessi(p_order_id uuid)
returns table (mezzo_id uuid, dove_ora text)
language sql
stable
security definer
set search_path = public
as $$
  with miei as (
    select m.id from public.mezzi m
     where m.deleted_at is null and m.su_mezzo_id is null
       and m.assegnato_hr_profilo_id in (select public.miei_hr_profili())
  )
  select m.id, 'con_te' from public.mezzi m where m.id in (select id from miei)
  union
  select m.id, 'a_bordo' from public.mezzi m
   where m.deleted_at is null and m.su_mezzo_id in (select id from miei)
  union
  select m.id, 'cantiere' from public.mezzi m
   where m.deleted_at is null and m.su_mezzo_id is null
     and m.assegnato_order_id = p_order_id
     and m.id not in (select id from miei)
$$;
revoke all on function public.campo_mezzi_ammessi(uuid) from public, anon, authenticated;

create or replace function public.campo_mezzi_giornata(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
begin
  if auth.uid() is null or not public.campo_lavoro_su_commessa(p_order_id) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', m.id,
             'nome', m.nome,
             'tipo', m.tipo,
             'targa', m.targa,
             'veicolo', m.tipo in ('furgone', 'autocarro', 'autovettura'),
             'contatore', m.contatore,
             'contatore_unita', m.contatore_unita,
             'dove_ora', a.dove_ora,
             'su_mezzo', (select s.nome from public.mezzi s where s.id = m.su_mezzo_id),
             'segnato_oggi', exists (select 1 from public.mezzi_giornate g
                                      where g.mezzo_id = m.id and g.giorno = v_oggi and g.user_id = auth.uid()))
           order by (a.dove_ora = 'cantiere'), (m.tipo in ('furgone', 'autocarro', 'autovettura')) desc, m.nome)
      from public.campo_mezzi_ammessi(p_order_id) a
      join public.mezzi m on m.id = a.mezzo_id
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.campo_mezzi_giornata(uuid) from public, anon;
grant execute on function public.campo_mezzi_giornata(uuid) to authenticated;

-- ── Salva: cosa ho usato e dove resta stasera ───────────────────────────────
-- p_righe: [{mezzo_id, usato, dove, su_mezzo_id?, contatore?}]
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
  v_n integer := 0;
begin
  select company_id into v_company from public.orders where id = p_order_id and deleted_at is null;
  if v_uid is null or v_company is null or not public.campo_lavoro_su_commessa(p_order_id) then
    raise exception using errcode = '42501', message = 'Non lavori su questo cantiere.';
  end if;
  if p_giorno is null or p_giorno < v_oggi - 1 or p_giorno > v_oggi then
    raise exception using errcode = '22023', message = 'Mezzi e attrezzi si segnano per oggi o per ieri.';
  end if;
  if jsonb_typeof(p_righe) is distinct from 'array' then
    return 0;
  end if;
  select h.id into v_hr from public.hr_profili h
   where h.id in (select public.miei_hr_profili()) and h.company_id = v_company
   order by h.attivo desc nulls last limit 1;

  for r in select * from jsonb_array_elements(p_righe) loop
    select m.* into v_mezzo
      from public.mezzi m
     where m.id = (r->>'mezzo_id')::uuid and m.company_id = v_company
       and m.id in (select a.mezzo_id from public.campo_mezzi_ammessi(p_order_id) a);
    if v_mezzo.id is null then
      continue;   -- non è un mezzo che posso segnare qui
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
       where m.id = (r->>'su_mezzo_id')::uuid and m.deleted_at is null and m.su_mezzo_id is null
         and m.tipo in ('furgone', 'autocarro', 'autovettura')
         and m.assegnato_hr_profilo_id in (select public.miei_hr_profili());
      if v_su is null then v_dove := 'invariato'; end if;
    end if;
    if v_dove = 'con_me' and v_hr is null then
      v_dove := 'invariato';
    end if;

    if v_dove = 'cantiere' then
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
      (company_id, mezzo_id, order_id, user_id, hr_profilo_id, giorno, usato, dove, su_mezzo_id, contatore, rapportino_id)
    values
      (v_company, v_mezzo.id, p_order_id, v_uid, v_hr, p_giorno, coalesce((r->>'usato')::boolean, true), v_dove, v_su,
       v_contatore, p_rapportino_id)
    on conflict (mezzo_id, giorno, user_id) do update
      set order_id = excluded.order_id, usato = excluded.usato, dove = excluded.dove, su_mezzo_id = excluded.su_mezzo_id,
          contatore = coalesce(excluded.contatore, mezzi_giornate.contatore),
          rapportino_id = coalesce(excluded.rapportino_id, mezzi_giornate.rapportino_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.campo_mezzi_fine_giornata(uuid, date, jsonb, uuid) from public, anon;
grant execute on function public.campo_mezzi_fine_giornata(uuid, date, jsonb, uuid) to authenticated;

-- ── Diario del giorno: anche l'uso dei mezzi ────────────────────────────────
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
         -- lo spostamento fatto dal rapportino si legge nella riga qui sotto
         and not exists (select 1 from public.mezzi_giornate mg
                          where mg.mezzo_id = ma.mezzo_id and mg.giorno = v_giorno and mg.user_id = ma.created_by)
      union all
      -- Mezzi e attrezzi segnati a fine giornata
      select mg.created_at, 'mezzo',
             case when mg.usato then 'Usato: ' else '' end || m.nome
               || case mg.dove when 'cantiere' then ' · resta in cantiere'
                               when 'magazzino' then ' · riportato in magazzino'
                               when 'furgone' then ' · sul ' || coalesce((select s.nome from public.mezzi s where s.id = mg.su_mezzo_id), 'furgone')
                               when 'con_me' then ' · lo tiene con sé'
                               else '' end
               || case when mg.contatore is not null
                       then ' · ' || replace(to_char(mg.contatore, 'FM999,999,990'), ',', '.') || ' ' || coalesce(m.contatore_unita::text, 'km')
                       else '' end,
             null,
             coalesce(nullif(trim(coalesce(h.nome, '') || ' ' || coalesce(h.cognome, '')), ''),
                      nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')),
             mg.order_id, public.manodopera_etichetta_commessa(mg.order_id), m.id, m.nome
        from public.mezzi_giornate mg
        join public.mezzi m on m.id = mg.mezzo_id
        left join public.hr_profili h on h.id = mg.hr_profilo_id
        left join public.profiles p on p.id = mg.user_id
       where mg.company_id = p_company_id and mg.giorno = v_giorno
         and (mg.usato or mg.dove <> 'invariato')
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
