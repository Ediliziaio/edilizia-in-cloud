-- ============================================================================
-- Subappalto dal computo, lotto 4 (docs/piano-subappalto-computo-listino.md):
-- «chi fa cosa». Le voci della commessa si affidano alle ditte, anche divise
-- per quantità (300 mq a Rossi, 120 a Bianchi: la voce resta una).
--
-- subappalto_affidamenti: una riga = una quota di una voce a una ditta, col
-- prezzo della ditta. L'unica tabella nuova del piano (sezione 2.2).
--   · La somma delle quote non supera MAI la quantità della voce: lo controlla
--     il database dentro le funzioni, con la voce bloccata (FOR UPDATE).
--   · Il venduto NON si scrive qui: sta sulla voce, dietro il permesso costi.
--   · Si legge con commesse + costi; si scrive SOLO con le funzioni sotto, che
--     controllano commesse + costi (nessuna regola di scrittura diretta).
--   · Cancellare una fase o una voce porta via le quote in bozza; una quota a
--     contratto la blocca (chiave NO ACTION: la purga dell'azienda, che toglie
--     tutto nello stesso comando, passa).
--   · La ditta sulla fase (order_external_teams) segue da sola: una riga per
--     ditta e fase con costo_origine 'contratto' e previsto = Σ quote × prezzo.
--     Se la ditta non ha una squadra, nasce (calendario e app cantiere).
--
-- Funzioni: affida_voci, affidamento_modifica, affidamento_togli. Tutte
-- chiuse ad anon; DEFINER con controllo esplicito dei permessi sull'azienda
-- della commessa.
-- ============================================================================

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Chiave composta per legare la ditta all'azienda (come external_teams).
alter table public.subappaltatori
  drop constraint if exists subappaltatori_company_id_id_key;
alter table public.subappaltatori
  add constraint subappaltatori_company_id_id_key unique (company_id, id);

create table if not exists public.subappalto_affidamenti (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  voce_id uuid not null references public.order_work_phase_voci(id) on delete no action,
  subappaltatore_id uuid not null,
  contratto_id uuid references public.contratti_subappalto(id) on delete set null,
  quantita numeric(14,3) not null check (quantita > 0),
  prezzo_unitario numeric(12,4) check (prezzo_unitario is null or prezzo_unitario >= 0),
  origine_prezzo text not null default 'manuale'
    check (origine_prezzo in ('listino_ditta', 'costo_aziendale', 'manuale')),
  variante_id uuid references public.tariffa_costi_varianti(id) on delete set null,
  comprende text not null default 'posa' check (comprende in ('posa', 'fornitura_e_posa')),
  stato text not null default 'bozza' check (stato in ('bozza', 'a_contratto')),
  note text,
  creato_da uuid default auth.uid(),
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now(),
  constraint subappalto_affidamenti_ditta_stessa_azienda
    foreign key (company_id, subappaltatore_id) references public.subappaltatori (company_id, id) on delete cascade
);
create index if not exists subappalto_affidamenti_voce_idx on public.subappalto_affidamenti (voce_id);
create index if not exists subappalto_affidamenti_order_idx on public.subappalto_affidamenti (order_id);
create index if not exists subappalto_affidamenti_ditta_idx on public.subappalto_affidamenti (subappaltatore_id);
create index if not exists subappalto_affidamenti_contratto_idx on public.subappalto_affidamenti (contratto_id) where contratto_id is not null;

comment on table public.subappalto_affidamenti is
  'Chi fa cosa: una quota di una voce della commessa affidata a un subappaltatore, col suo prezzo. Σ quote ≤ quantità della voce. Si scrive solo con affida_voci / affidamento_modifica / affidamento_togli.';

alter table public.subappalto_affidamenti enable row level security;
revoke all on public.subappalto_affidamenti from anon;
grant select on public.subappalto_affidamenti to authenticated;
grant all on public.subappalto_affidamenti to service_role;

drop policy if exists affidamenti_lettura on public.subappalto_affidamenti;
create policy affidamenti_lettura on public.subappalto_affidamenti
  for select to authenticated
  using (
    company_id in (select unnest(public.aziende_con_permesso('can_view_orders')))
    and company_id in (select unnest(public.aziende_con_permesso('can_view_costs')))
    and not (select public.utente_bloccato())
  );

-- La ditta sulla fase segue le quote --------------------------------------------
alter table public.order_external_teams drop constraint if exists order_external_teams_costo_origine_check;
alter table public.order_external_teams add constraint order_external_teams_costo_origine_check
  check (costo_origine is null or costo_origine = any (array['listino', 'preventivo', 'manuale', 'contratto']));

create or replace function public.affidamenti_allinea_ditta(p_order uuid, p_fase uuid, p_subappaltatore uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_azienda uuid;
  v_squadra uuid;
  v_iva numeric;
  v_netto numeric;
  v_n int;
begin
  select o.company_id into v_azienda from public.orders o where o.id = p_order;
  select count(*), coalesce(sum(round(a.quantita * coalesce(a.prezzo_unitario, 0), 2)), 0)
    into v_n, v_netto
    from public.subappalto_affidamenti a
    join public.order_work_phase_voci v on v.id = a.voce_id
   where a.order_id = p_order and v.phase_id = p_fase and a.subappaltatore_id = p_subappaltatore;

  select e.id, coalesce(e.vat_rate, 0) into v_squadra, v_iva
    from public.external_teams e
   where e.company_id = v_azienda and e.subappaltatore_id = p_subappaltatore
   order by e.is_active desc nulls last, e.created_at
   limit 1;

  if v_n = 0 then
    if v_squadra is not null then
      -- La riga nata dagli affidamenti se ne va; una ditta assegnata a mano prima resta, «a mano».
      delete from public.order_external_teams
       where order_id = p_order and phase_id = p_fase and external_team_id = v_squadra
         and costo_origine = 'contratto' and notes = 'Dagli affidamenti';
      update public.order_external_teams set costo_origine = 'manuale'
       where order_id = p_order and phase_id = p_fase and external_team_id = v_squadra and costo_origine = 'contratto';
    end if;
    return;
  end if;

  if v_squadra is null then
    insert into public.external_teams (company_id, name, kind, is_active, subappaltatore_id, vat_rate)
    select v_azienda, s.ragione_sociale, 'esterna', true, s.id, 0
      from public.subappaltatori s where s.id = p_subappaltatore
    returning id, 0 into v_squadra, v_iva;
  end if;

  update public.order_external_teams
     set cost_preventivo = round(v_netto * (1 + v_iva / 100), 2), costo_origine = 'contratto'
   where order_id = p_order and phase_id = p_fase and external_team_id = v_squadra;
  if not found then
    insert into public.order_external_teams (order_id, external_team_id, phase_id, total_cost, cost_preventivo, costo_origine, vat_rate, is_paid, notes)
    values (p_order, v_squadra, p_fase, 0, round(v_netto * (1 + v_iva / 100), 2), 'contratto', v_iva, false, 'Dagli affidamenti');
  end if;
end;
$$;
revoke all on function public.affidamenti_allinea_ditta(uuid, uuid, uuid) from public, anon, authenticated;

-- Tre trigger per istruzione (le tabelle di transizione non si combinano fra eventi):
-- dopo ogni scrittura la ditta sulla fase si riallinea.
create or replace function public.affidamenti_dopo_inserimento()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select distinct n.order_id, v.phase_id, n.subappaltatore_id
             from nuove n join public.order_work_phase_voci v on v.id = n.voce_id loop
    perform public.affidamenti_allinea_ditta(r.order_id, r.phase_id, r.subappaltatore_id);
  end loop;
  return null;
end $$;
create or replace function public.affidamenti_dopo_cancellazione()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  -- La voce può essere già sparita (fase cancellata): si ripulisce per commessa e ditta.
  for r in select distinct o.order_id, o.subappaltatore_id, v.phase_id
             from vecchie o left join public.order_work_phase_voci v on v.id = o.voce_id loop
    if r.phase_id is not null then
      perform public.affidamenti_allinea_ditta(r.order_id, r.phase_id, r.subappaltatore_id);
    end if;
  end loop;
  return null;
end $$;
revoke all on function public.affidamenti_dopo_inserimento() from public, anon, authenticated;
revoke all on function public.affidamenti_dopo_cancellazione() from public, anon, authenticated;

create or replace function public.affidamenti_dopo_aggiornamento()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select distinct x.order_id, v.phase_id, x.subappaltatore_id
             from (select order_id, voce_id, subappaltatore_id from nuove
                   union select order_id, voce_id, subappaltatore_id from vecchie) x
             join public.order_work_phase_voci v on v.id = x.voce_id loop
    perform public.affidamenti_allinea_ditta(r.order_id, r.phase_id, r.subappaltatore_id);
  end loop;
  return null;
end $$;
revoke all on function public.affidamenti_dopo_aggiornamento() from public, anon, authenticated;

drop trigger if exists affidamenti_ins on public.subappalto_affidamenti;
create trigger affidamenti_ins after insert on public.subappalto_affidamenti
  referencing new table as nuove for each statement execute function public.affidamenti_dopo_inserimento();
drop trigger if exists affidamenti_upd on public.subappalto_affidamenti;
create trigger affidamenti_upd after update on public.subappalto_affidamenti
  referencing old table as vecchie new table as nuove for each statement execute function public.affidamenti_dopo_aggiornamento();
drop trigger if exists affidamenti_del on public.subappalto_affidamenti;
create trigger affidamenti_del after delete on public.subappalto_affidamenti
  referencing old table as vecchie for each statement execute function public.affidamenti_dopo_cancellazione();

-- Una voce cancellata porta via le sue quote in bozza; quelle a contratto la bloccano.
create or replace function public.voce_cancellata_togli_affidamenti()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Se sparisce l'intera commessa o l'azienda (purga: DELETE su companies a cascata) le quote se ne vanno con lei.
  if exists (select 1 from public.orders o where o.id = old.order_id)
     and exists (select 1 from public.companies c where c.id = old.company_id)
     and exists (select 1 from public.subappalto_affidamenti a where a.voce_id = old.id and a.stato = 'a_contratto') then
    raise exception using errcode = '23503',
      message = format('La voce «%s» è in un contratto di subappalto: prima va tolta dal contratto con una variante.', left(old.descrizione, 80));
  end if;
  delete from public.subappalto_affidamenti a where a.voce_id = old.id;
  return old;
end $$;
revoke all on function public.voce_cancellata_togli_affidamenti() from public, anon, authenticated;
drop trigger if exists voce_cancellata_togli_affidamenti on public.order_work_phase_voci;
create trigger voce_cancellata_togli_affidamenti before delete on public.order_work_phase_voci
  for each row execute function public.voce_cancellata_togli_affidamenti();

-- Un contratto cancellato libera le sue quote: tornano in bozza.
create or replace function public.affidamento_senza_contratto_bozza()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.contratto_id is null then new.stato := 'bozza'; end if;
  return new;
end $$;
revoke all on function public.affidamento_senza_contratto_bozza() from public, anon, authenticated;
drop trigger if exists affidamento_senza_contratto_bozza on public.subappalto_affidamenti;
create trigger affidamento_senza_contratto_bozza before insert or update of contratto_id, stato on public.subappalto_affidamenti
  for each row execute function public.affidamento_senza_contratto_bozza();

-- Il prezzo proposto per una voce e una ditta, oggi: listino della ditta, poi costo aziendale.
create or replace function public.affidamento_prezzo_proposto(p_voce uuid, p_subappaltatore uuid,
  out prezzo numeric, out origine text, out variante uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with v as (select vv.tariffa_id, vv.company_id from public.order_work_phase_voci vv where vv.id = p_voce),
  ditta as (
    select tv.id, tv.costo from public.tariffa_costi_varianti tv, v
     where tv.tariffa_id = v.tariffa_id and tv.company_id = v.company_id and tv.subappaltatore_id = p_subappaltatore
       and tv.attivo and tv.costo is not null
       and tv.valid_from <= (now() at time zone 'Europe/Rome')::date
       and (tv.valid_to is null or tv.valid_to >= (now() at time zone 'Europe/Rome')::date)
     order by tv.is_default desc, tv.sort_order, tv.created_at
     limit 1
  ),
  azienda as (
    select coalesce(nullif(t.costo_interno, 0), nullif(t.prezzo_costo, 0), nullif(t.costo_default, 0)) as costo
      from public.tariffe_aziendali t, v where t.id = v.tariffa_id and t.company_id = v.company_id
  )
  select coalesce((select costo from ditta), (select costo from azienda)),
         case when exists (select 1 from ditta) then 'listino_ditta'
              when (select costo from azienda) is not null then 'costo_aziendale'
              else 'manuale' end,
         (select id from ditta)
$$;
revoke all on function public.affidamento_prezzo_proposto(uuid, uuid) from public, anon, authenticated;

-- Affidare -----------------------------------------------------------------------
-- p_voci: [{voce_id, quantita?}] — senza quantità si affida tutto il resto della voce.
create or replace function public.affida_voci(p_order uuid, p_subappaltatore uuid, p_voci jsonb, p_comprende text default 'posa')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_azienda uuid;
  r jsonb;
  v_voce record;
  v_gia numeric;
  v_quantita numeric;
  v_prezzo record;
  n_affidate int := 0;
  n_piene int := 0;
begin
  select o.company_id into v_azienda from public.orders o where o.id = p_order;
  if v_azienda is null
     or not (public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda)
             and public.has_permission_for_company(auth.uid(), 'can_view_costs', v_azienda)) then
    raise exception using errcode = '42501', message = 'Per affidare le voci servono i permessi sulle commesse e sui costi.';
  end if;
  if not exists (select 1 from public.subappaltatori s where s.id = p_subappaltatore and s.company_id = v_azienda) then
    raise exception using errcode = '22023', message = 'La ditta non è di questa azienda.';
  end if;
  if p_comprende not in ('posa', 'fornitura_e_posa') then
    raise exception using errcode = '22023', message = 'Il prezzo comprende «posa» o «fornitura e posa».';
  end if;
  if p_voci is null or jsonb_typeof(p_voci) <> 'array' then
    raise exception using errcode = '22023', message = 'Le voci non sono un elenco.';
  end if;

  for r in select value from jsonb_array_elements(p_voci) loop
    select v.id, v.quantita, v.descrizione into v_voce
      from public.order_work_phase_voci v
     where v.id = nullif(r->>'voce_id', '')::uuid and v.order_id = p_order
     for update;
    if not found then
      raise exception using errcode = '22023', message = 'Una voce non è di questa commessa.';
    end if;
    select coalesce(sum(a.quantita), 0) into v_gia from public.subappalto_affidamenti a where a.voce_id = v_voce.id;
    v_quantita := coalesce(nullif(r->>'quantita', '')::numeric, coalesce(v_voce.quantita, 0) - v_gia);
    if v_quantita <= 0 then
      n_piene := n_piene + 1;
      continue;
    end if;
    if v_quantita > coalesce(v_voce.quantita, 0) - v_gia + 0.0005 then
      raise exception using errcode = '23514',
        message = format('«%s»: restano %s da affidare, non %s.', left(v_voce.descrizione, 80),
                         trim(to_char(coalesce(v_voce.quantita, 0) - v_gia, 'FM999G999G990D999')), trim(to_char(v_quantita, 'FM999G999G990D999')));
    end if;
    select * into v_prezzo from public.affidamento_prezzo_proposto(v_voce.id, p_subappaltatore);
    -- La stessa ditta sulla stessa voce: si somma alla sua quota in bozza invece di farne due.
    update public.subappalto_affidamenti a set quantita = a.quantita + v_quantita, aggiornato_il = now()
     where a.voce_id = v_voce.id and a.subappaltatore_id = p_subappaltatore and a.stato = 'bozza';
    if not found then
      insert into public.subappalto_affidamenti (company_id, order_id, voce_id, subappaltatore_id, quantita, prezzo_unitario, origine_prezzo, variante_id, comprende)
      values (v_azienda, p_order, v_voce.id, p_subappaltatore, v_quantita, v_prezzo.prezzo, v_prezzo.origine, v_prezzo.variante, p_comprende);
    end if;
    n_affidate := n_affidate + 1;
  end loop;

  return jsonb_build_object('affidate', n_affidate, 'gia_piene', n_piene);
end;
$$;
revoke all on function public.affida_voci(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.affida_voci(uuid, uuid, jsonb, text) to authenticated, service_role;

-- Cambiare una quota in bozza: quantità, prezzo, cosa comprende ------------------
create or replace function public.affidamento_modifica(p_id uuid, p_quantita numeric default null, p_prezzo numeric default null,
  p_comprende text default null, p_togli_prezzo boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.subappalto_affidamenti%rowtype;
  v_tot numeric;
  v_altri numeric;
begin
  select * into v_a from public.subappalto_affidamenti where id = p_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'Affidamento non trovato.';
  end if;
  if not (public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_a.company_id)
          and public.has_permission_for_company(auth.uid(), 'can_view_costs', v_a.company_id)) then
    raise exception using errcode = '42501', message = 'Per cambiare un affidamento servono i permessi sulle commesse e sui costi.';
  end if;
  if v_a.stato <> 'bozza' then
    raise exception using errcode = '23514', message = 'L''affidamento è in un contratto: si cambia con una variante del contratto.';
  end if;
  if p_quantita is not null then
    select quantita into v_tot from public.order_work_phase_voci where id = v_a.voce_id for update;
    select coalesce(sum(quantita), 0) into v_altri from public.subappalto_affidamenti where voce_id = v_a.voce_id and id <> p_id;
    if p_quantita <= 0 or p_quantita > coalesce(v_tot, 0) - v_altri + 0.0005 then
      raise exception using errcode = '23514',
        message = format('La quantità va da 0 a %s (il resto della voce).', trim(to_char(coalesce(v_tot, 0) - v_altri, 'FM999G999G990D999')));
    end if;
  end if;
  if p_prezzo is not null and p_prezzo < 0 then
    raise exception using errcode = '22023', message = 'Il prezzo non può essere negativo.';
  end if;
  if p_comprende is not null and p_comprende not in ('posa', 'fornitura_e_posa') then
    raise exception using errcode = '22023', message = 'Il prezzo comprende «posa» o «fornitura e posa».';
  end if;
  update public.subappalto_affidamenti set
    quantita = coalesce(p_quantita, quantita),
    prezzo_unitario = case when p_togli_prezzo then null when p_prezzo is not null then p_prezzo else prezzo_unitario end,
    origine_prezzo = case when p_prezzo is not null or p_togli_prezzo then 'manuale' else origine_prezzo end,
    variante_id = case when p_prezzo is not null or p_togli_prezzo then null else variante_id end,
    comprende = coalesce(p_comprende, comprende),
    aggiornato_il = now()
   where id = p_id;
end;
$$;
revoke all on function public.affidamento_modifica(uuid, numeric, numeric, text, boolean) from public, anon;
grant execute on function public.affidamento_modifica(uuid, numeric, numeric, text, boolean) to authenticated, service_role;

-- Togliere quote in bozza -----------------------------------------------------------
create or replace function public.affidamento_togli(p_ids uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aziende uuid[];
  v_n int;
begin
  select array_agg(distinct company_id) into v_aziende from public.subappalto_affidamenti where id = any(p_ids);
  if v_aziende is null then return 0; end if;
  if cardinality(v_aziende) > 1
     or not (public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_aziende[1])
             and public.has_permission_for_company(auth.uid(), 'can_view_costs', v_aziende[1])) then
    raise exception using errcode = '42501', message = 'Per togliere un affidamento servono i permessi sulle commesse e sui costi.';
  end if;
  if exists (select 1 from public.subappalto_affidamenti where id = any(p_ids) and stato <> 'bozza') then
    raise exception using errcode = '23514', message = 'Un affidamento è in un contratto: si toglie con una variante del contratto.';
  end if;
  delete from public.subappalto_affidamenti where id = any(p_ids);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.affidamento_togli(uuid[]) from public, anon;
grant execute on function public.affidamento_togli(uuid[]) to authenticated, service_role;
