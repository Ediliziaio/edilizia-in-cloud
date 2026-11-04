-- Fatture ricevute collegate ai mezzi e ai DDT (richiesta di un cliente, vale per tutti).
--   fattura_ricevuta_mezzi: l'importo sta sul legame, non sulla fattura. Carburante e leasing citano molti
--     veicoli sulla stessa fattura: dare il totale a ciascuno gonfierebbe i costi. Le proposte nate dalle
--     targhe restano non confermate finché una persona non le guarda.
--   fattura_ddt: il riferimento può esistere senza la bolla, perché chi non carica le bolle ha comunque i
--     numeri di DDT nell'XML.
--   Un trigger riempie i due legami a ogni fattura nuova, e non blocca mai l'import: un errore qui non deve
--   far perdere una fattura.
-- Tabelle nuove e vuote, nessuna riga scritta su quelle esistenti.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create table if not exists public.fattura_ricevuta_mezzi (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  fattura_ricevuta_id uuid not null references public.fatture_ricevute(id) on delete cascade,
  mezzo_id uuid not null references public.mezzi(id) on delete cascade,
  importo numeric,
  origine text not null default 'manuale' check (origine in ('targa', 'manuale')),
  confermata boolean not null default false,
  confermata_da uuid references auth.users(id) on delete set null,
  confermata_at timestamptz,
  nota text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (fattura_ricevuta_id, mezzo_id)
);
create index if not exists fattura_ricevuta_mezzi_mezzo on public.fattura_ricevuta_mezzi (mezzo_id);
create index if not exists fattura_ricevuta_mezzi_azienda on public.fattura_ricevuta_mezzi (company_id);

create table if not exists public.fattura_ddt (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  fattura_ricevuta_id uuid not null references public.fatture_ricevute(id) on delete cascade,
  numero_ddt text not null,
  data_ddt date,
  ddt_ricezione_id uuid references public.ddt_ricezione(id) on delete set null,
  origine text not null default 'manuale' check (origine in ('xml', 'manuale')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists fattura_ddt_unico on public.fattura_ddt (fattura_ricevuta_id, numero_ddt, coalesce(data_ddt, date '0001-01-01'));
create index if not exists fattura_ddt_azienda on public.fattura_ddt (company_id, numero_ddt);
create index if not exists fattura_ddt_bolla on public.fattura_ddt (ddt_ricezione_id);

-- Il legame resta dentro l'azienda, e company_id si deduce dalla fattura invece di fidarsi del browser.
create or replace function public.fattura_legame_stessa_azienda()
returns trigger language plpgsql set search_path = public as $$
declare v_azienda uuid;
begin
  select company_id into v_azienda from public.fatture_ricevute where id = new.fattura_ricevuta_id;
  if v_azienda is null then raise exception 'Fattura non trovata.' using errcode = 'P0002'; end if;
  new.company_id := v_azienda;
  if tg_table_name = 'fattura_ricevuta_mezzi' then
    if not exists (select 1 from public.mezzi m where m.id = new.mezzo_id and m.company_id = v_azienda) then
      raise exception 'Il mezzo appartiene a un''altra azienda.' using errcode = '42501';
    end if;
  elsif new.ddt_ricezione_id is not null and not exists (select 1 from public.ddt_ricezione d where d.id = new.ddt_ricezione_id and d.company_id = v_azienda) then
    raise exception 'Il DDT appartiene a un''altra azienda.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.fattura_legame_stessa_azienda() from public, anon, authenticated;

drop trigger if exists fattura_ricevuta_mezzi_azienda_t on public.fattura_ricevuta_mezzi;
create trigger fattura_ricevuta_mezzi_azienda_t before insert or update on public.fattura_ricevuta_mezzi
  for each row execute function public.fattura_legame_stessa_azienda();
drop trigger if exists fattura_ddt_azienda_t on public.fattura_ddt;
create trigger fattura_ddt_azienda_t before insert or update on public.fattura_ddt
  for each row execute function public.fattura_legame_stessa_azienda();

alter table public.fattura_ricevuta_mezzi enable row level security;
alter table public.fattura_ddt enable row level security;

drop policy if exists blocco_utente_bloccato on public.fattura_ricevuta_mezzi;
create policy blocco_utente_bloccato on public.fattura_ricevuta_mezzi as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
drop policy if exists fattura_ricevuta_mezzi_legge on public.fattura_ricevuta_mezzi;
create policy fattura_ricevuta_mezzi_legge on public.fattura_ricevuta_mezzi for select to authenticated
  using (company_id = any ((select public.aziende_con_permesso('can_view_costs'))::uuid[]));
drop policy if exists fattura_ricevuta_mezzi_scrive on public.fattura_ricevuta_mezzi;
create policy fattura_ricevuta_mezzi_scrive on public.fattura_ricevuta_mezzi for all to authenticated
  using (company_id = any ((select public.aziende_con_permesso('can_view_costs'))::uuid[]) and not public.utente_sola_lettura(company_id))
  with check (company_id = any ((select public.aziende_con_permesso('can_view_costs'))::uuid[]) and not public.utente_sola_lettura(company_id));

drop policy if exists blocco_utente_bloccato on public.fattura_ddt;
create policy blocco_utente_bloccato on public.fattura_ddt as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
drop policy if exists fattura_ddt_legge on public.fattura_ddt;
create policy fattura_ddt_legge on public.fattura_ddt for select to authenticated
  using (company_id = any ((select public.aziende_con_permesso('can_view_costs'))::uuid[]));
drop policy if exists fattura_ddt_scrive on public.fattura_ddt;
create policy fattura_ddt_scrive on public.fattura_ddt for all to authenticated
  using (company_id = any ((select public.aziende_con_permesso('can_view_costs'))::uuid[]) and not public.utente_sola_lettura(company_id))
  with check (company_id = any ((select public.aziende_con_permesso('can_view_costs'))::uuid[]) and not public.utente_sola_lettura(company_id));

revoke all on public.fattura_ricevuta_mezzi, public.fattura_ddt from public, anon;
grant select, insert, update, delete on public.fattura_ricevuta_mezzi, public.fattura_ddt to authenticated;
grant all on public.fattura_ricevuta_mezzi, public.fattura_ddt to service_role;

-- Una fattura: i DDT dall'XML e le targhe dalle righe. Rilanciarla non cambia ciò che esiste già.
create or replace function public.fattura_collega_ddt_e_mezzi(p_fattura_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f public.fatture_ricevute%rowtype; v_ddt integer := 0; v_mezzi integer := 0; v_nota boolean; n integer;
begin
  select * into f from public.fatture_ricevute where id = p_fattura_id;
  if not found then return jsonb_build_object('ddt', 0, 'mezzi', 0); end if;
  v_nota := public.e_nota_credito_ricevuta(f.tipo_documento);

  if f.xml_raw is not null and position('NumeroDDT' in f.xml_raw) > 0 then
    with letti as (
      select distinct left(btrim(m[1]), 100) as numero,
             case when m[2] ~ '^\d{4}-\d{2}-\d{2}$' then m[2]::date end as data
        from regexp_matches(f.xml_raw, '<(?:[\w.-]+:)?NumeroDDT>\s*([^<]+?)\s*</(?:[\w.-]+:)?NumeroDDT>\s*<(?:[\w.-]+:)?DataDDT>\s*([^<]+?)\s*</', 'g') as m
    ), scritti as (
      insert into public.fattura_ddt (company_id, fattura_ricevuta_id, numero_ddt, data_ddt, origine, created_by, ddt_ricezione_id)
      select f.company_id, f.id, l.numero, l.data, 'xml', null,
             (select case when count(*) = 1 then min(d.id::text)::uuid end from public.ddt_ricezione d
               where d.company_id = f.company_id and d.numero_ddt = l.numero and f.fornitore_id is not null and d.supplier_id = f.fornitore_id)
        from letti l
      on conflict do nothing returning 1
    ) select count(*) into v_ddt from scritti;
  end if;

  if not public.e_autofattura_ricevuta(f.tipo_documento) and jsonb_typeof(f.righe) = 'array' then
    with chiavi as (
      select m.id, upper(regexp_replace(coalesce(nullif(m.targa, ''), m.matricola, ''), '[^A-Za-z0-9]', '', 'g')) as k
        from public.mezzi m where m.company_id = f.company_id and m.deleted_at is null
    ), righe as (
      select upper(regexp_replace(coalesce(r->>'descrizione', ''), '[^A-Za-z0-9]', '', 'g')) as testo,
             case when (r->>'imponibile') ~ '^-?\d+(\.\d+)?$' then (r->>'imponibile')::numeric else 0 end as importo
        from jsonb_array_elements(f.righe) r
    ), trovati as (
      select c.id as mezzo_id, sum(abs(ri.importo)) as importo
        from chiavi c join righe ri on length(c.k) >= 6 and ri.testo like '%' || c.k || '%'
       group by c.id
    ), scritti as (
      insert into public.fattura_ricevuta_mezzi (company_id, fattura_ricevuta_id, mezzo_id, importo, origine, created_by)
      select f.company_id, f.id, t.mezzo_id, case when v_nota then -t.importo else t.importo end, 'targa', null from trovati t
      on conflict (fattura_ricevuta_id, mezzo_id) do nothing returning 1
    ) select count(*) into v_mezzi from scritti;
  end if;
  return jsonb_build_object('ddt', v_ddt, 'mezzi', v_mezzi);
end $$;
revoke all on function public.fattura_collega_ddt_e_mezzi(uuid) from public, anon, authenticated;
grant execute on function public.fattura_collega_ddt_e_mezzi(uuid) to service_role;

create or replace function public.fattura_ricevuta_collegamenti_auto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.fattura_collega_ddt_e_mezzi(new.id);
  exception when others then
    raise log 'fattura_ricevuta_collegamenti_auto %: %', new.id, sqlerrm;
  end;
  return new;
end $$;
revoke all on function public.fattura_ricevuta_collegamenti_auto() from public, anon, authenticated;

drop trigger if exists trg_fattura_ricevuta_collegamenti on public.fatture_ricevute;
create trigger trg_fattura_ricevuta_collegamenti after insert on public.fatture_ricevute
  for each row execute function public.fattura_ricevuta_collegamenti_auto();

-- Dalla scheda del mezzo: cerca la targa nelle fatture già presenti (un mezzo aggiunto dopo).
create or replace function public.mezzo_cerca_nelle_fatture(p_mezzo_id uuid)
returns integer language plpgsql security definer set search_path = public set statement_timeout to '60s' as $$
declare v_azienda uuid; v_k text; n integer;
begin
  select company_id, upper(regexp_replace(coalesce(nullif(targa, ''), matricola, ''), '[^A-Za-z0-9]', '', 'g')) into v_azienda, v_k from public.mezzi where id = p_mezzo_id;
  if v_azienda is null then raise exception 'Mezzo non trovato.' using errcode = 'P0002'; end if;
  if not (v_azienda = any (public.aziende_con_permesso('can_view_costs'))) or public.utente_sola_lettura(v_azienda) then
    raise exception 'Il tuo ruolo non permette di collegare le fatture.' using errcode = '42501';
  end if;
  if length(coalesce(v_k, '')) < 6 then raise exception 'Serve una targa o una matricola di almeno 6 caratteri.' using errcode = '22023'; end if;
  with trovati as (
    select f.id, sum(abs(case when (r->>'imponibile') ~ '^-?\d+(\.\d+)?$' then (r->>'imponibile')::numeric else 0 end)) as importo,
           public.e_nota_credito_ricevuta(f.tipo_documento) as nota
      from public.fatture_ricevute f, jsonb_array_elements(case when jsonb_typeof(f.righe) = 'array' then f.righe else '[]'::jsonb end) r
     where f.company_id = v_azienda and not public.e_autofattura_ricevuta(f.tipo_documento)
       and upper(regexp_replace(coalesce(r->>'descrizione', ''), '[^A-Za-z0-9]', '', 'g')) like '%' || v_k || '%'
     group by f.id, f.tipo_documento
  ), scritti as (
    insert into public.fattura_ricevuta_mezzi (company_id, fattura_ricevuta_id, mezzo_id, importo, origine, created_by)
    select v_azienda, t.id, p_mezzo_id, case when t.nota then -t.importo else t.importo end, 'targa', auth.uid() from trovati t
    on conflict (fattura_ricevuta_id, mezzo_id) do nothing returning 1
  ) select count(*) into n from scritti;
  return n;
end $$;
revoke all on function public.mezzo_cerca_nelle_fatture(uuid) from public, anon;
grant execute on function public.mezzo_cerca_nelle_fatture(uuid) to authenticated, service_role;
