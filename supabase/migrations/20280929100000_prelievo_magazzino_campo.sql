-- Prelievo di magazzino dall'app di cantiere (operaio).
--
-- L'operaio, se ha il permesso can_view_warehouse, vede il magazzino e può
-- segnare un prelievo. Due modalità, decise dall'azienda:
--  · conferma (default): il prelievo nasce "richiesto"; scarica la giacenza solo
--    quando l'ufficio lo approva;
--  · libero: se l'azienda non ha un magazziniere, il prelievo scarica subito
--    (stato "consegnato").
--
-- Tutto poggia sul magazzino esistente (warehouse_stock.quantity +
-- warehouse_movements 'scarico'); non introduce un secondo modello di giacenza.

-- 1) Impostazione azienda: prelievo dal campo a conferma o libero.
alter table public.companies
  add column if not exists magazzino_prelievo_conferma boolean not null default true;

comment on column public.companies.magazzino_prelievo_conferma is
  'true: il prelievo da cantiere richiede conferma dell''ufficio prima di scaricare. false: scarico immediato (aziende senza magazziniere).';

-- 2) Registro dei prelievi da campo.
create table if not exists public.prelievi_campo (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  warehouse_id uuid,
  order_id uuid,
  operaio_id uuid,
  data timestamptz not null default now(),
  righe jsonb not null default '[]'::jsonb,
  note text,
  stato text not null default 'richiesto' check (stato in ('richiesto','consegnato','rifiutato')),
  approvato_da uuid,
  approvato_at timestamptz,
  motivo_rifiuto text,
  created_at timestamptz not null default now()
);

create index if not exists prelievi_campo_company_stato_idx on public.prelievi_campo (company_id, stato);
create index if not exists prelievi_campo_order_idx on public.prelievi_campo (order_id);
create index if not exists prelievi_campo_operaio_idx on public.prelievi_campo (operaio_id);

alter table public.prelievi_campo enable row level security;

-- Ambito azienda (come warehouse_uscite): l'ufficio vede tutto, l'operaio i propri.
drop policy if exists prelievi_campo_company on public.prelievi_campo;
create policy prelievi_campo_company on public.prelievi_campo
  for all to authenticated
  using (company_id = public.get_my_company_id())
  with check (company_id = public.get_my_company_id());

-- 3) Scarico di una riga (helper interno, riusato da registra e approva).
create or replace function public._prelievo_campo_scarica(
  p_company uuid, p_warehouse uuid, p_order uuid, p_righe jsonb, p_uid uuid, p_note text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_riga jsonb;
  v_stock uuid;
  v_qta int;
  v_disp int;
  v_name text;
begin
  set local lock_timeout = '3s';
  for v_riga in select value from jsonb_array_elements(coalesce(p_righe, '[]'::jsonb)) loop
    v_stock := nullif(v_riga->>'stock_item_id','')::uuid;
    v_qta := floor(coalesce((v_riga->>'quantita')::numeric, 0))::int;
    if v_stock is null or v_qta <= 0 then continue; end if;
    select quantity, name into v_disp, v_name
      from public.warehouse_stock where id = v_stock and company_id = p_company for update;
    if not found then raise exception 'Articolo non trovato in magazzino'; end if;
    if coalesce(v_disp,0) < v_qta then
      raise exception 'Giacenza insufficiente per %: disponibili %, richiesti %', coalesce(v_name,'articolo'), coalesce(v_disp,0), v_qta;
    end if;
    update public.warehouse_stock set quantity = quantity - v_qta, updated_at = now() where id = v_stock;
    insert into public.warehouse_movements(stock_item_id, movement_type, quantity, performed_by, company_id, warehouse_id, order_id, notes)
      values (v_stock, 'scarico', v_qta, p_uid, p_company, p_warehouse, p_order, coalesce(nullif(p_note,''), 'Prelievo da cantiere'));
  end loop;
end $$;

-- 4) Registra un prelievo dal campo.
create or replace function public.prelievo_campo_registra(
  p_order_id uuid, p_warehouse_id uuid, p_righe jsonb, p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_conferma boolean;
  v_stato text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Non autenticato'; end if;
  v_company := public.get_user_company_id(v_uid);
  if v_company is null then raise exception 'Azienda non trovata'; end if;
  if not public.has_permission(v_uid, 'can_view_warehouse') then
    raise exception 'Non hai l''accesso al magazzino';
  end if;
  if p_righe is null or jsonb_typeof(p_righe) <> 'array' or jsonb_array_length(p_righe) = 0 then
    raise exception 'Nessun articolo da prelevare';
  end if;

  select coalesce(magazzino_prelievo_conferma, true) into v_conferma from public.companies where id = v_company;

  -- Libero: scarico subito. A conferma: resta "richiesto" e lo scarica l'ufficio.
  if v_conferma is false then
    perform public._prelievo_campo_scarica(v_company, p_warehouse_id, p_order_id, p_righe, v_uid, p_note);
    v_stato := 'consegnato';
  else
    v_stato := 'richiesto';
  end if;

  insert into public.prelievi_campo(company_id, warehouse_id, order_id, operaio_id, righe, note, stato, approvato_da, approvato_at)
  values (
    v_company, p_warehouse_id, p_order_id, v_uid, p_righe, nullif(p_note,''), v_stato,
    case when v_stato = 'consegnato' then v_uid else null end,
    case when v_stato = 'consegnato' then now() else null end
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'stato', v_stato);
end $$;

-- 5) L'ufficio approva un prelievo richiesto (scarica ora).
create or replace function public.prelievo_campo_approva(p_prelievo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_p public.prelievi_campo;
begin
  if v_uid is null then raise exception 'Non autenticato'; end if;
  v_company := public.get_user_company_id(v_uid);
  if not public.has_permission(v_uid, 'can_edit_warehouse') then
    raise exception 'Non puoi approvare i prelievi';
  end if;
  select * into v_p from public.prelievi_campo where id = p_prelievo_id and company_id = v_company for update;
  if not found then raise exception 'Prelievo non trovato'; end if;
  if v_p.stato <> 'richiesto' then raise exception 'Prelievo già gestito'; end if;

  perform public._prelievo_campo_scarica(v_company, v_p.warehouse_id, v_p.order_id, v_p.righe, v_p.operaio_id, v_p.note);
  update public.prelievi_campo
     set stato = 'consegnato', approvato_da = v_uid, approvato_at = now()
   where id = p_prelievo_id;
  return jsonb_build_object('id', p_prelievo_id, 'stato', 'consegnato');
end $$;

-- 6) L'ufficio rifiuta un prelievo (niente scarico).
create or replace function public.prelievo_campo_rifiuta(p_prelievo_id uuid, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_n int;
begin
  if v_uid is null then raise exception 'Non autenticato'; end if;
  v_company := public.get_user_company_id(v_uid);
  if not public.has_permission(v_uid, 'can_edit_warehouse') then
    raise exception 'Non puoi gestire i prelievi';
  end if;
  update public.prelievi_campo
     set stato = 'rifiutato', approvato_da = v_uid, approvato_at = now(), motivo_rifiuto = nullif(p_motivo,'')
   where id = p_prelievo_id and company_id = v_company and stato = 'richiesto';
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Prelievo non trovato o già gestito'; end if;
  return jsonb_build_object('id', p_prelievo_id, 'stato', 'rifiutato');
end $$;

-- Permessi: solo utenti autenticati (mai anon). Il gate vero è dentro le funzioni.
revoke all on function public._prelievo_campo_scarica(uuid, uuid, uuid, jsonb, uuid, text) from public, anon;
revoke all on function public.prelievo_campo_registra(uuid, uuid, jsonb, text) from public, anon;
revoke all on function public.prelievo_campo_approva(uuid) from public, anon;
revoke all on function public.prelievo_campo_rifiuta(uuid, text) from public, anon;
grant execute on function public.prelievo_campo_registra(uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.prelievo_campo_approva(uuid) to authenticated;
grant execute on function public.prelievo_campo_rifiuta(uuid, text) to authenticated;
