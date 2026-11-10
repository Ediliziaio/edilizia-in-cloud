-- Numerazione degli ordini ai fornitori (purchase_orders.oda_number) scelta
-- dall'azienda, e per fornitore.
--
-- Prima: il numero lo dava sempre generate_oda_number, ODA-AAAA-NNNN con
-- MAX(suffisso)+1, e non si poteva cambiare. Impresa Vulcano numera i suoi
-- ordini 26130, 26131… e alcuni fornitori vogliono la propria serie.
--
-- Ora, in quest'ordine:
--   1. il fornitore ha suppliers.oda_prossimo → suo formato (predefinito {n})
--      e suo contatore;
--   2. l'azienda ha la riga in numerazione_ordini_fornitore → quella;
--   3. altrimenti come prima, identico: ODA-AAAA-NNNN, MAX+1.
-- Il contatore avanza con UPDATE … RETURNING (il lock della riga mette in fila
-- due ordini creati insieme). Se il numero c'è già nell'azienda, perché scritto
-- a mano, si passa al successivo. Il vincolo uq_oda_number_company resta:
-- ddtCarico, controllo_documento_fornitore, Silvio e WhatsApp cercano
-- l'ordine per numero dentro l'azienda.
--
-- Segnaposti del formato: {n} numero senza zeri, {n:4} con zeri fino a 4 cifre,
-- {anno} 2026, {aa} 26. Esempi: 'ODA-{anno}-{n:4}', '{n}'.
--
-- Il numero si cambia anche a mano: chi modifica l'ordine lo riscrive dal
-- dettaglio, o lo scrive già nella creazione (il trigger riempie solo se vuoto).

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Formato → numero
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.oda_formatta_numero(p_formato text, p_n integer, p_data date)
 returns text
 language plpgsql
 stable
 set search_path to ''
as $function$
declare
  r text := coalesce(nullif(btrim(p_formato), ''), '{n}');
  m text[];
begin
  r := replace(r, '{anno}', to_char(p_data, 'YYYY'));
  r := replace(r, '{aa}', to_char(p_data, 'YY'));
  loop
    m := regexp_match(r, '\{n:(\d{1,2})\}');
    exit when m is null;
    -- senza flag 'g' regexp_replace sostituisce solo la prima occorrenza
    r := regexp_replace(r, '\{n:\d{1,2}\}',
                        lpad(p_n::text, greatest(m[1]::integer, length(p_n::text)), '0'));
  end loop;
  return replace(r, '{n}', p_n::text);
end;
$function$;

revoke all on function public.oda_formatta_numero(text, integer, date) from public, anon;
grant execute on function public.oda_formatta_numero(text, integer, date) to authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Numerazione dell'azienda
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.numerazione_ordini_fornitore (
  company_id uuid primary key references public.companies(id) on delete cascade,
  formato text not null,
  prossimo integer not null check (prossimo > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

-- Un formato senza {n} darebbe sempre lo stesso numero.
alter table public.numerazione_ordini_fornitore
  drop constraint if exists numerazione_ordini_fornitore_formato_check;
alter table public.numerazione_ordini_fornitore
  add constraint numerazione_ordini_fornitore_formato_check
  check (formato ~ '\{n(:\d{1,2})?\}' and length(formato) <= 40);

comment on table public.numerazione_ordini_fornitore is
  'Per azienda: formato e prossimo numero degli ordini ai fornitori (purchase_orders.oda_number). Senza riga: ODA-AAAA-NNNN come sempre. La legge generate_oda_number.';

create or replace function public.numerazione_ordini_fornitore_timbro()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$function$;
revoke all on function public.numerazione_ordini_fornitore_timbro() from public, anon, authenticated;

drop trigger if exists numerazione_ordini_fornitore_timbro on public.numerazione_ordini_fornitore;
create trigger numerazione_ordini_fornitore_timbro
  before insert or update on public.numerazione_ordini_fornitore
  for each row execute function public.numerazione_ordini_fornitore_timbro();

alter table public.numerazione_ordini_fornitore enable row level security;

revoke all on public.numerazione_ordini_fornitore from public, anon;
grant select, insert, update, delete on public.numerazione_ordini_fornitore to authenticated;
grant all on public.numerazione_ordini_fornitore to service_role;

-- Lettura: chi è dell'azienda (il modulo di creazione mostra il prossimo numero).
drop policy if exists numerazione_oda_lettura on public.numerazione_ordini_fornitore;
create policy numerazione_oda_lettura on public.numerazione_ordini_fornitore
  for select to authenticated
  using (public.user_can_access_company(company_id));

-- Scrittura: amministratore o chi modifica la configurazione ordini, come le
-- altre impostazioni degli acquisti (has_permission_for_company ammette già
-- super admin e amministratore dell'azienda, e rifiuta gli utenti bloccati).
drop policy if exists numerazione_oda_scrittura on public.numerazione_ordini_fornitore;
create policy numerazione_oda_scrittura on public.numerazione_ordini_fornitore
  for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_settings_orders', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_settings_orders', company_id));

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Numerazione propria del fornitore
-- ────────────────────────────────────────────────────────────────────────────
alter table public.suppliers add column if not exists oda_formato text;
alter table public.suppliers add column if not exists oda_prossimo integer;

alter table public.suppliers drop constraint if exists suppliers_oda_prossimo_check;
alter table public.suppliers
  add constraint suppliers_oda_prossimo_check check (oda_prossimo is null or oda_prossimo > 0);
alter table public.suppliers drop constraint if exists suppliers_oda_formato_check;
alter table public.suppliers
  add constraint suppliers_oda_formato_check
  check (oda_formato is null or (oda_formato ~ '\{n(:\d{1,2})?\}' and length(oda_formato) <= 40));

comment on column public.suppliers.oda_prossimo is
  'Prossimo numero degli ordini a questo fornitore. NULL = usa la numerazione dell''azienda.';
comment on column public.suppliers.oda_formato is
  'Formato dei numeri d''ordine di questo fornitore ({n}, {n:4}, {anno}, {aa}). NULL = {n}.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. generate_oda_number(azienda, fornitore)
-- ────────────────────────────────────────────────────────────────────────────
-- La firma a un argomento sparisce: chi la chiamava con il solo p_company_id
-- (per nome o per posizione) trova la nuova, col fornitore predefinito a NULL.
drop function if exists public.generate_oda_number(uuid);

create or replace function public.generate_oda_number(p_company_id uuid, p_supplier_id uuid default null)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_year text;
  v_next integer;
  v_formato text;
  v_num text;
  v_giri integer := 0;
begin
  if not public.user_can_access_company(p_company_id) then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;

  -- 1. Il fornitore con la sua numerazione
  if p_supplier_id is not null then
    loop
      update public.suppliers s
         set oda_prossimo = s.oda_prossimo + 1
       where s.id = p_supplier_id
         and s.company_id = p_company_id
         and s.oda_prossimo is not null
      returning s.oda_prossimo - 1, coalesce(nullif(btrim(s.oda_formato), ''), '{n}')
        into v_next, v_formato;
      exit when not found;
      v_num := public.oda_formatta_numero(v_formato, v_next, current_date);
      if not exists (select 1 from public.purchase_orders po
                      where po.company_id = p_company_id and po.oda_number = v_num) then
        return v_num;
      end if;
      v_giri := v_giri + 1;
      if v_giri >= 1000 then
        raise exception 'Numerazione del fornitore: 1000 numeri di fila già usati, controlla il prossimo numero nella sua scheda'
          using errcode = 'P0001';
      end if;
    end loop;
  end if;

  -- 2. La numerazione dell'azienda
  loop
    update public.numerazione_ordini_fornitore n
       set prossimo = n.prossimo + 1
     where n.company_id = p_company_id
    returning n.prossimo - 1, n.formato into v_next, v_formato;
    exit when not found;
    v_num := public.oda_formatta_numero(v_formato, v_next, current_date);
    if not exists (select 1 from public.purchase_orders po
                    where po.company_id = p_company_id and po.oda_number = v_num) then
      return v_num;
    end if;
    v_giri := v_giri + 1;
    if v_giri >= 1000 then
      raise exception 'Numerazione degli ordini: 1000 numeri di fila già usati, controlla il prossimo numero nelle impostazioni'
        using errcode = 'P0001';
    end if;
  end loop;

  -- 3. Come sempre: ODA-AAAA-NNNN, MAX del suffisso + 1
  v_year := extract(year from current_date)::text;
  select coalesce(max(substring(oda_number from '^ODA-' || v_year || '-(\d+)$')::integer), 0) + 1
    into v_next
  from public.purchase_orders
  where company_id = p_company_id
    and oda_number ~ ('^ODA-' || v_year || '-\d+$');

  return 'ODA-' || v_year || '-' || lpad(v_next::text, 4, '0');
end;
$function$;

revoke all on function public.generate_oda_number(uuid, uuid) from public, anon;
grant execute on function public.generate_oda_number(uuid, uuid) to authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Anteprima: il prossimo numero, senza consumarlo
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.anteprima_numero_oda(p_company_id uuid, p_supplier_id uuid default null)
 returns text
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_year text;
  v_next integer;
  v_formato text;
  v_num text;
  v_giri integer := 0;
begin
  if not public.user_can_access_company(p_company_id) then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;

  if p_supplier_id is not null then
    select s.oda_prossimo, coalesce(nullif(btrim(s.oda_formato), ''), '{n}')
      into v_next, v_formato
      from public.suppliers s
     where s.id = p_supplier_id and s.company_id = p_company_id and s.oda_prossimo is not null;
  end if;
  if v_next is null then
    select n.prossimo, n.formato into v_next, v_formato
      from public.numerazione_ordini_fornitore n
     where n.company_id = p_company_id;
  end if;

  if v_next is not null then
    loop
      v_num := public.oda_formatta_numero(v_formato, v_next, current_date);
      exit when not exists (select 1 from public.purchase_orders po
                             where po.company_id = p_company_id and po.oda_number = v_num);
      v_next := v_next + 1;
      v_giri := v_giri + 1;
      exit when v_giri >= 1000;
    end loop;
    return v_num;
  end if;

  v_year := extract(year from current_date)::text;
  select coalesce(max(substring(oda_number from '^ODA-' || v_year || '-(\d+)$')::integer), 0) + 1
    into v_next
  from public.purchase_orders
  where company_id = p_company_id
    and oda_number ~ ('^ODA-' || v_year || '-\d+$');
  return 'ODA-' || v_year || '-' || lpad(v_next::text, 4, '0');
end;
$function$;

revoke all on function public.anteprima_numero_oda(uuid, uuid) from public, anon;
grant execute on function public.anteprima_numero_oda(uuid, uuid) to authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Il trigger passa il fornitore
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.auto_assign_oda_number()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  new.oda_number := nullif(btrim(coalesce(new.oda_number, '')), '');
  if new.oda_number is null then
    new.oda_number := public.generate_oda_number(new.company_id, new.supplier_id);
  end if;
  return new;
end;
$function$;

revoke all on function public.auto_assign_oda_number() from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Impresa Vulcano: numeri semplici, 26130, 26131…
-- ────────────────────────────────────────────────────────────────────────────
insert into public.numerazione_ordini_fornitore (company_id, formato, prossimo)
select '7c87c209-7868-42d0-ad98-6c95ac6de196'::uuid, '{n}', 26131
 where exists (select 1 from public.companies where id = '7c87c209-7868-42d0-ad98-6c95ac6de196')
on conflict (company_id) do nothing;

-- La bozza ODA-2026-0007 diventa 26130, solo se è ancora in bozza e il numero è
-- libero. Gli ordini annullati o confermati restano come sono.
update public.purchase_orders po
   set oda_number = '26130'
 where po.company_id = '7c87c209-7868-42d0-ad98-6c95ac6de196'
   and po.oda_number = 'ODA-2026-0007'
   and po.status = 'bozza'
   and not exists (select 1 from public.purchase_orders x
                    where x.company_id = '7c87c209-7868-42d0-ad98-6c95ac6de196'
                      and x.oda_number = '26130');
