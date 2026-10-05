-- Mezzi e attrezzature (Fase D): inventario con lo scanner.
--
-- Un inventario è un giro di conta: si scelgono cosa (attrezzature, mezzi o
-- tutto, eventualmente una categoria) e dove (solo ciò che risulta in
-- magazzino, oppure tutto ovunque si trovi), poi si legge un QR dopo l'altro.
-- Per i ponteggi e le altre attrezzature a quantità si scrive quanto se n'è
-- contato. Alla chiusura: chi manca può diventare una segnalazione «non
-- trovato» per l'ufficio, e chi è stato trovato in magazzino ma risultava
-- altrove può tornare in magazzino anche nei dati.
--
-- In più: i messaggi sulle quantità scritti all'italiana («250 m²», «12,5 m»)
-- invece di «250. mq».

-- ── 0. Quantità scritte bene ────────────────────────────────────────────────
create or replace function public._mezzi_fmt_quantita(p numeric, p_unita text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select replace(rtrim(rtrim(to_char(p, 'FM999999990.00'), '0'), '.'), '.', ',')
         || coalesce(' ' || case p_unita when 'mq' then 'm²' when 'mc' then 'm³' when 'ml' then 'm' else p_unita end, '');
$$;
revoke all on function public._mezzi_fmt_quantita(numeric, text) from public, anon;

create or replace function public.mezzi_allocazioni_controlla()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_m record;
  v_in_uso numeric;
begin
  select company_id, gestione, quantita_totale, unita_misura, deleted_at
    into v_m from public.mezzi where id = new.mezzo_id;
  if v_m.company_id is null or v_m.deleted_at is not null then
    raise exception using errcode = '23503', message = 'Attrezzatura non trovata.';
  end if;
  if v_m.gestione is distinct from 'quantita' then
    raise exception using errcode = '22023',
      message = 'Solo le attrezzature a quantità si ripartiscono tra i cantieri.';
  end if;
  new.company_id := v_m.company_id;
  if new.al is null or new.al > (now() at time zone 'Europe/Rome')::date then
    v_in_uso := public.mezzi_quantita_in_uso(new.mezzo_id, new.id);
    if v_in_uso + new.quantita > v_m.quantita_totale then
      raise exception using errcode = '23514',
        message = format('Non basta: disponibili %s.',
                         public._mezzi_fmt_quantita(greatest(v_m.quantita_totale - v_in_uso, 0), v_m.unita_misura));
    end if;
  end if;
  return new;
end $$;

create or replace function public.mezzi_quantita_controlla_totale()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_in_uso numeric;
begin
  if new.gestione = 'quantita' and new.quantita_totale is not null then
    v_in_uso := public.mezzi_quantita_in_uso(new.id);
    if new.quantita_totale < v_in_uso then
      raise exception using errcode = '23514',
        message = format('Ne sono montati %s nei cantieri: il totale non può essere più basso.',
                         public._mezzi_fmt_quantita(v_in_uso, new.unita_misura));
    end if;
  end if;
  if old.gestione = 'quantita' and new.gestione = 'singola'
     and exists (select 1 from public.mezzi_allocazioni a
                  where a.mezzo_id = new.id and (a.al is null or a.al > (now() at time zone 'Europe/Rome')::date)) then
    raise exception using errcode = '23514',
      message = 'È ancora montato in qualche cantiere: fai rientrare tutto prima di cambiarlo in pezzo singolo.';
  end if;
  return new;
end $$;

-- ── 1. Inventari ────────────────────────────────────────────────────────────
create table if not exists public.mezzi_inventari (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  titolo       text not null check (btrim(titolo) <> ''),
  classe       text check (classe in ('mezzo','attrezzatura')),   -- vuoto = tutto
  categoria_id uuid references public.mezzi_categorie(id) on delete set null,
  dove         text not null default 'magazzino' check (dove in ('magazzino','ovunque')),
  note         text,
  avviato_da   uuid default auth.uid() references public.profiles(id) on delete set null,
  chiuso_at    timestamptz,
  chiuso_da    uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_mezzi_inventari_company on public.mezzi_inventari(company_id, created_at desc);

alter table public.mezzi_inventari enable row level security;
revoke all on public.mezzi_inventari from anon;
drop policy if exists mezzi_inventari_lettura on public.mezzi_inventari;
create policy mezzi_inventari_lettura on public.mezzi_inventari for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_mezzi', company_id));
drop policy if exists mezzi_inventari_modifica on public.mezzi_inventari;
create policy mezzi_inventari_modifica on public.mezzi_inventari for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', company_id));
drop policy if exists blocco_utente_bloccato on public.mezzi_inventari;
create policy blocco_utente_bloccato on public.mezzi_inventari
  as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));

drop trigger if exists trg_mezzi_inventari_updated on public.mezzi_inventari;
create trigger trg_mezzi_inventari_updated before update on public.mezzi_inventari
  for each row execute function public.set_updated_at();

-- Una conta per attrezzo e inventario; per le quantità si corregge il numero.
alter table public.mezzi_scansioni
  add column if not exists inventario_id uuid references public.mezzi_inventari(id) on delete cascade;
create unique index if not exists uq_mezzi_scansioni_inventario
  on public.mezzi_scansioni(inventario_id, mezzo_id) where inventario_id is not null;
drop policy if exists mezzi_scansioni_modifica on public.mezzi_scansioni;
create policy mezzi_scansioni_modifica on public.mezzi_scansioni for update to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', company_id));

-- Cosa ci si aspetta di trovare: per i pezzi singoli il pezzo, per le
-- quantità quanto ne deve esserci (in magazzino: il disponibile).
create or replace function public._mezzi_inventario_atteso(p_inventario uuid)
returns table (mezzo_id uuid, quantita_attesa numeric)
language sql
stable
security definer
set search_path to 'public'
as $$
  select m.id,
         case when m.gestione = 'quantita' then
           case when i.dove = 'magazzino' then m.quantita_totale - public.mezzi_quantita_in_uso(m.id)
                else m.quantita_totale end
         end
    from public.mezzi_inventari i
    join public.mezzi m on m.company_id = i.company_id and m.deleted_at is null
   where i.id = p_inventario
     and (i.classe is null or m.classe = i.classe)
     and (i.categoria_id is null or m.categoria_id = i.categoria_id)
     and (i.dove = 'ovunque'
          or (m.gestione = 'quantita' and m.quantita_totale - public.mezzi_quantita_in_uso(m.id) > 0)
          or (m.gestione = 'singola' and m.stato <> 'in_officina' and m.assegnato_order_id is null
              and m.assegnato_hr_profilo_id is null and m.su_mezzo_id is null));
$$;
revoke all on function public._mezzi_inventario_atteso(uuid) from public, anon, authenticated;

-- Legge un codice (o un attrezzo scelto a mano) e lo conta.
create or replace function public.mezzi_inventario_conta(
  p_inventario uuid,
  p_codice text default null,
  p_quantita numeric default null,
  p_mezzo_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.mezzi_inventari;
  v_codice text := nullif(upper(regexp_replace(btrim(coalesce(p_codice, '')), '\s+', '', 'g')), '');
  v_m public.mezzi;
  v_hr uuid;
  v_id uuid;
  v_esito text;
  v_atteso boolean;
begin
  select * into v_inv from public.mezzi_inventari where id = p_inventario;
  if v_uid is null or v_inv.id is null
     or not public.has_permission_for_company(v_uid, 'can_edit_mezzi', v_inv.company_id) then
    raise exception using errcode = '42501', message = 'Inventario non trovato.';
  end if;
  if v_inv.chiuso_at is not null then
    raise exception using errcode = '22023', message = 'Questo inventario è chiuso.';
  end if;
  if p_quantita is not null and p_quantita < 0 then
    raise exception using errcode = '22023', message = 'La quantità contata non può essere negativa.';
  end if;

  if p_mezzo_id is not null then
    select * into v_m from public.mezzi
     where id = p_mezzo_id and company_id = v_inv.company_id and deleted_at is null;
  else
    if v_codice ~ '^(ATT|MZ)-?\d{1,9}$' then
      v_codice := public._mezzi_formatta_codice(substring(v_codice from '^(ATT|MZ)'),
                                                substring(v_codice from '(\d+)$')::integer);
    end if;
    select * into v_m from public.mezzi
     where company_id = v_inv.company_id and upper(codice) = v_codice and deleted_at is null;
  end if;
  if v_m.id is null then
    return jsonb_build_object('esito', 'sconosciuto', 'codice', v_codice);
  end if;

  select h.id into v_hr from public.hr_profili h
   where h.id in (select public.miei_hr_profili()) and h.company_id = v_inv.company_id
   order by h.attivo desc nulls last
   limit 1;

  select s.id into v_id from public.mezzi_scansioni s
   where s.inventario_id = p_inventario and s.mezzo_id = v_m.id;
  if v_id is null then
    insert into public.mezzi_scansioni (company_id, mezzo_id, user_id, hr_profilo_id, azione, quantita, inventario_id)
    values (v_inv.company_id, v_m.id, v_uid, v_hr, 'inventario',
            case when v_m.gestione = 'quantita' then round(p_quantita, 2) end, p_inventario);
    v_esito := 'contato';
  elsif p_quantita is not null and v_m.gestione = 'quantita' then
    update public.mezzi_scansioni set quantita = round(p_quantita, 2) where id = v_id;
    v_esito := 'aggiornato';
  else
    v_esito := 'gia_contato';
  end if;

  v_atteso := exists (select 1 from public._mezzi_inventario_atteso(p_inventario) a where a.mezzo_id = v_m.id);
  return jsonb_build_object(
    'esito', v_esito,
    'atteso', v_atteso,
    'mezzo', public._mezzo_scheda_campo(v_m.id));
end $$;
revoke all on function public.mezzi_inventario_conta(uuid, text, numeric, uuid) from public, anon;
grant execute on function public.mezzi_inventario_conta(uuid, text, numeric, uuid) to authenticated;

-- Chiude il giro. Facoltativo: segnala all'ufficio chi manca (una
-- segnalazione «non trovato» per pezzo, o per la quantità che manca) e
-- riporta in magazzino, anche nei dati, chi è stato trovato lì ma risultava
-- altrove. Restituisce quanti ne ha toccati.
create or replace function public.mezzi_inventario_chiudi(
  p_inventario uuid,
  p_segnala_mancanti boolean default false,
  p_riporta_in_magazzino boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.mezzi_inventari;
  v_segnalati integer := 0;
  v_spostati integer := 0;
  v_titolo text;
begin
  select * into v_inv from public.mezzi_inventari where id = p_inventario for update;
  if v_uid is null or v_inv.id is null
     or not public.has_permission_for_company(v_uid, 'can_edit_mezzi', v_inv.company_id) then
    raise exception using errcode = '42501', message = 'Inventario non trovato.';
  end if;
  if v_inv.chiuso_at is not null then
    raise exception using errcode = '22023', message = 'Questo inventario è già chiuso.';
  end if;
  v_titolo := v_inv.titolo;

  if p_segnala_mancanti then
    with mancanti as (
      select a.mezzo_id, a.quantita_attesa, m.gestione, m.unita_misura, s.quantita as contata, s.id as conta_id
        from public._mezzi_inventario_atteso(p_inventario) a
        join public.mezzi m on m.id = a.mezzo_id
        left join public.mezzi_scansioni s on s.inventario_id = p_inventario and s.mezzo_id = a.mezzo_id
       where (m.gestione = 'singola' and s.id is null)
          or (m.gestione = 'quantita' and coalesce(s.quantita, 0) < coalesce(a.quantita_attesa, 0))
    ),
    nuove as (
      insert into public.mezzi_segnalazioni (company_id, mezzo_id, tipo, descrizione)
      select v_inv.company_id, x.mezzo_id, 'smarrito',
             case when x.gestione = 'quantita' then
               format('%s: contati %s su %s attesi, mancano %s.', v_titolo,
                      public._mezzi_fmt_quantita(coalesce(x.contata, 0), x.unita_misura),
                      public._mezzi_fmt_quantita(x.quantita_attesa, x.unita_misura),
                      public._mezzi_fmt_quantita(x.quantita_attesa - coalesce(x.contata, 0), x.unita_misura))
             else format('%s: non trovato.', v_titolo) end
        from mancanti x
       -- non ripetere una segnalazione «non trovato» ancora aperta
       where not exists (select 1 from public.mezzi_segnalazioni sg
                          where sg.mezzo_id = x.mezzo_id and sg.tipo = 'smarrito' and sg.stato <> 'chiusa')
      returning 1
    )
    select count(*) into v_segnalati from nuove;
  end if;

  -- solo per i giri in magazzino: trovato ovunque non dice dove deve stare
  if p_riporta_in_magazzino and v_inv.dove = 'magazzino' then
    with trovati_altrove as (
      update public.mezzi m
         set assegnato_order_id = null, assegnato_hr_profilo_id = null, su_mezzo_id = null
        from public.mezzi_scansioni s
       where s.inventario_id = p_inventario and s.mezzo_id = m.id
         and m.gestione = 'singola' and m.deleted_at is null
         and m.tipo not in ('furgone', 'autocarro', 'autovettura')
         and (m.assegnato_order_id is not null or m.assegnato_hr_profilo_id is not null or m.su_mezzo_id is not null)
      returning 1
    )
    select count(*) into v_spostati from trovati_altrove;
  end if;

  update public.mezzi_inventari set chiuso_at = now(), chiuso_da = v_uid where id = p_inventario;
  return jsonb_build_object('segnalati', v_segnalati, 'riportati_in_magazzino', v_spostati);
end $$;
revoke all on function public.mezzi_inventario_chiudi(uuid, boolean, boolean) from public, anon;
grant execute on function public.mezzi_inventario_chiudi(uuid, boolean, boolean) to authenticated;
