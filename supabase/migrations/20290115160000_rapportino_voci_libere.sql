-- Voci libere del rapportino: trasporto, nolo, smaltimento, con costo e vendita.
-- Tabella a parte perche' i prezzi li vede solo chi vede i costi: l'operaio non li legge.
-- All'approvazione il costo entra nella commessa (company_costs, una riga per voce) e la
-- vendita nel rendiconto; annullando il rapportino escono entrambi. Una voce gia' in un
-- SAL inviato non si tocca.
set local lock_timeout = '3s';
alter table public.appalto_rendiconto_righe add column if not exists voce_libera_id uuid;
create table if not exists public.rapportino_voci_libere (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  rapportino_id uuid not null references public.campo_rapportini(id) on delete cascade,
  descrizione text not null check (length(btrim(descrizione)) > 0),
  quantita numeric not null default 1 check (quantita > 0),
  unita text not null default 'cad',
  costo_unitario numeric check (costo_unitario is null or costo_unitario >= 0),
  vendita_unitaria numeric check (vendita_unitaria is null or vendita_unitaria >= 0),
  company_cost_id uuid references public.company_costs(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rapportino_voci_libere_rapportino on public.rapportino_voci_libere (rapportino_id);
create unique index if not exists appalto_rendiconto_una_voce on public.appalto_rendiconto_righe (voce_libera_id) where voce_libera_id is not null;
alter table public.rapportino_voci_libere enable row level security;
revoke all on public.rapportino_voci_libere from anon;
drop policy if exists voci_libere_lettura on public.rapportino_voci_libere;
create policy voci_libere_lettura on public.rapportino_voci_libere for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_costs', company_id) and public.puo_vedere_commessa(order_id));
drop policy if exists voci_libere_scrittura on public.rapportino_voci_libere;
create policy voci_libere_scrittura on public.rapportino_voci_libere for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_costs', company_id)
         and public.has_permission_for_company((select auth.uid()), 'can_edit_orders', company_id) and public.puo_vedere_commessa(order_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_view_costs', company_id)
         and public.has_permission_for_company((select auth.uid()), 'can_edit_orders', company_id) and public.puo_vedere_commessa(order_id));

create or replace function public.rapportino_voce_ritira(p_voce public.rapportino_voci_libere)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if exists (select 1 from public.appalto_rendiconto_righe r where r.voce_libera_id = p_voce.id and r.stato <> 'bozza') then
    raise exception 'La voce «%» e'' gia'' in un rendiconto confermato: togli prima la riga dal rendiconto', p_voce.descrizione using errcode = '23514';
  end if;
  delete from public.appalto_rendiconto_righe where voce_libera_id = p_voce.id;
  if p_voce.company_cost_id is not null then
    delete from public.company_costs where id = p_voce.company_cost_id;
  end if;
end; $$;
revoke all on function public.rapportino_voce_ritira(public.rapportino_voci_libere) from public, anon, authenticated;

create or replace function public.rapportino_voce_applica(p_voce_id uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare v public.rapportino_voci_libere%rowtype; v_r record; v_ord record; v_costo numeric; v_cost_id uuid; v_ric numeric;
begin
  select * into v from public.rapportino_voci_libere where id = p_voce_id;
  if not found then return; end if;
  select cr.approvato, cr.data_lavoro into v_r from public.campo_rapportini cr where cr.id = v.rapportino_id;
  if not coalesce(v_r.approvato, false) then
    perform public.rapportino_voce_ritira(v);
    update public.rapportino_voci_libere set company_cost_id = null where id = v.id and company_cost_id is not null;
    return;
  end if;

  v_costo := round(v.quantita * coalesce(v.costo_unitario, 0), 2);
  if v_costo > 0 then
    if v.company_cost_id is not null then
      update public.company_costs set name = v.descrizione, amount = v_costo, due_date = v_r.data_lavoro where id = v.company_cost_id;
    else
      insert into public.company_costs (company_id, name, cost_type, amount, recurrence, due_date, is_paid, paid_date, category, notes, order_id, senza_fattura)
      values (v.company_id, v.descrizione, 'variable', v_costo, 'once', v_r.data_lavoro, true, v_r.data_lavoro, 'Rapportino', 'Voce libera del rapportino', v.order_id, true)
      returning id into v_cost_id;
      update public.rapportino_voci_libere set company_cost_id = v_cost_id where id = v.id;
    end if;
  elsif v.company_cost_id is not null then
    delete from public.company_costs where id = v.company_cost_id;
    update public.rapportino_voci_libere set company_cost_id = null where id = v.id;
  end if;

  select o.order_type into v_ord from public.orders o where o.id = v.order_id;
  v_ric := coalesce(v.vendita_unitaria, 0);
  if v_ord.order_type is distinct from 'appaltatore_lavoro' or v_ric <= 0 then
    delete from public.appalto_rendiconto_righe where voce_libera_id = v.id and stato = 'bozza';
    return;
  end if;
  if exists (select 1 from public.appalto_rendiconto_righe r where r.voce_libera_id = v.id and r.stato <> 'bozza') then
    raise exception 'La voce «%» e'' gia'' in un rendiconto confermato', v.descrizione using errcode = '23514';
  end if;
  delete from public.appalto_rendiconto_righe where voce_libera_id = v.id;
  insert into public.appalto_rendiconto_righe (order_id, data, tariffa_id, quantita, employee_id, fase_id, origine, rapportino_id, stato, descrizione, unita_misura, prezzo_unitario, costo_interno, note, voce_libera_id, extra_contratto)
  values (v.order_id, v_r.data_lavoro, null, v.quantita, null, null, 'manuale', null, 'bozza', v.descrizione, v.unita, v_ric, nullif(v_costo, 0), 'Voce del rapportino', v.id, true);
end; $$;
revoke all on function public.rapportino_voce_applica(uuid) from public, anon, authenticated;

create or replace function public.rapportino_voci_trg() returns trigger language plpgsql security definer set search_path to '' as $$
declare v_r record;
begin
  if tg_op = 'DELETE' then
    perform public.rapportino_voce_ritira(old);
    return old;
  end if;
  if tg_when = 'BEFORE' then
    select cr.order_id, cr.company_id into v_r from public.campo_rapportini cr where cr.id = new.rapportino_id;
    if not found then raise exception 'Rapportino inesistente' using errcode = '23503'; end if;
    new.order_id := v_r.order_id;
    new.company_id := v_r.company_id;
    new.updated_at := now();
    return new;
  end if;
  if pg_trigger_depth() = 1 then perform public.rapportino_voce_applica(new.id); end if;
  return null;
end; $$;
drop trigger if exists trg_voci_libere_prima on public.rapportino_voci_libere;
create trigger trg_voci_libere_prima before insert or update on public.rapportino_voci_libere for each row execute function public.rapportino_voci_trg();
drop trigger if exists trg_voci_libere_dopo on public.rapportino_voci_libere;
create trigger trg_voci_libere_dopo after insert or update of descrizione, quantita, unita, costo_unitario, vendita_unitaria on public.rapportino_voci_libere for each row execute function public.rapportino_voci_trg();
drop trigger if exists trg_voci_libere_via on public.rapportino_voci_libere;
create trigger trg_voci_libere_via before delete on public.rapportino_voci_libere for each row execute function public.rapportino_voci_trg();

create or replace function public.rapportino_voci_approvazione() returns trigger language plpgsql security definer set search_path to '' as $$
declare v record;
begin
  if coalesce(new.approvato, false) is distinct from coalesce(old.approvato, false) then
    for v in select id from public.rapportino_voci_libere where rapportino_id = new.id loop
      perform public.rapportino_voce_applica(v.id);
    end loop;
  end if;
  return null;
end; $$;
drop trigger if exists trg_rapportino_voci_approvazione on public.campo_rapportini;
create trigger trg_rapportino_voci_approvazione after update of approvato on public.campo_rapportini for each row execute function public.rapportino_voci_approvazione();

-- Il quadro economico mostra anche le voci.
do $$
declare v_def text;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc where proname = 'rapportino_quadro_economico' and pronamespace = 'public'::regnamespace;
  if position('rapportino_voci_libere' in v_def) > 0 then return; end if;
  if position($v$'persone', v_persone,$v$ in v_def) = 0 then raise exception 'quadro: testo non riconosciuto'; end if;
  v_def := replace(v_def, $v$'persone', v_persone,$v$, $v$'persone', v_persone,
    'voci', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'descrizione', x.descrizione, 'quantita', x.quantita, 'unita', x.unita, 'costo_unitario', x.costo_unitario, 'vendita_unitaria', x.vendita_unitaria) order by x.created_at) from public.rapportino_voci_libere x where x.rapportino_id = p_rapportino_id), '[]'::jsonb),$v$);
  execute v_def;
end $$;
