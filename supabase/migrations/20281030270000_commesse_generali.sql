-- ════════════════════════════════════════════════════════════════════════════
-- Commesse generali: una commessa che raccoglie altre commesse
-- ════════════════════════════════════════════════════════════════════════════
-- Piano: docs/superpowers/plans/2026-10-30-commesse-generali-appalti-sviluppi.md
-- (tappa 0, il nucleo).
--
-- Un appalto da 3 milioni con tanti ordini di lavoro, un complesso residenziale
-- con le sue unità, un immobile comprato, ristrutturato e rivenduto: in tutti e
-- tre i casi c'è una commessa «sopra» e tante commesse normali «sotto».
--
--   · orders.workflow_kind = 'generale'  la commessa sopra. Non porta importo
--     (total_amount = 0): il suo valore sta in commesse_generali, così i
--     cruscotti che sommano orders.total_amount non contano due volte lo stesso
--     euro (stessa scelta degli interventi di un contratto di manutenzione).
--   · orders.commessa_generale_id        il legame di una commessa normale con
--     la sua generale. Due livelli al massimo: la generale non ha generale, e
--     una figlia è sempre una commessa normale (non un contratto, non un
--     intervento). Non è parent_contract_id: quello lega gli interventi a un
--     contratto di manutenzione, che è un'altra cosa.
--   · commesse_generali                  modello (appalto, sviluppo,
--     compravendita) e valore di riferimento della generale.
--   · company_commesse_generali_settings quali modelli l'azienda ha acceso da
--     Impostazioni. Spento = nessuna scelta nuova in giro per l'app; le
--     generali già create restano visibili.
--
-- Si scrive solo con le RPC (commessa_generale_*), si legge con le policy.
-- Nessun dato esistente viene toccato: 766 commesse, nessuna generale.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 1. Il tipo «generale» e il legame ───────────────────────────────────────
alter table public.orders drop constraint if exists orders_workflow_kind_check;
alter table public.orders
  add constraint orders_workflow_kind_check
  check (workflow_kind = any (array['commessa', 'contratto', 'intervento', 'generale'])) not valid;
alter table public.orders validate constraint orders_workflow_kind_check;

alter table public.orders
  add column if not exists commessa_generale_id uuid references public.orders(id) on delete set null;

comment on column public.orders.commessa_generale_id is
  'La commessa generale (workflow_kind=generale) di cui questa commessa fa parte. Due livelli al massimo.';

create index if not exists orders_commessa_generale_idx
  on public.orders (commessa_generale_id) where commessa_generale_id is not null;

alter table public.orders drop constraint if exists orders_generale_forma;
alter table public.orders
  add constraint orders_generale_forma
  check (workflow_kind <> 'generale' or (commessa_generale_id is null and total_amount = 0)) not valid;
alter table public.orders validate constraint orders_generale_forma;

-- La generale deve essere della stessa azienda e davvero una generale; la figlia
-- una commessa normale. Una generale non smette di esserlo finché ha figlie.
create or replace function public.orders_commessa_generale_coerente()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.commessa_generale_id is not null then
    if new.commessa_generale_id = new.id or new.workflow_kind <> 'commessa' or not exists (
      select 1 from public.orders g
       where g.id = new.commessa_generale_id
         and g.company_id = new.company_id
         and g.workflow_kind = 'generale'
    ) then
      raise exception 'Questa commessa non può far parte di quella commessa generale.' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.workflow_kind = 'generale'
     and (new.workflow_kind <> 'generale' or new.company_id <> old.company_id)
     and exists (select 1 from public.orders f where f.commessa_generale_id = old.id) then
    raise exception 'La commessa generale ha ancora commesse collegate.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_commessa_generale on public.orders;
create trigger trg_orders_commessa_generale
  before insert or update of commessa_generale_id, workflow_kind, company_id on public.orders
  for each row execute function public.orders_commessa_generale_coerente();

-- Il flusso di attività di una commessa nuova (playbook) è per i lavori veri:
-- la generale non lo riceve, le sue figlie sì. Stessa funzione di prima, con
-- un controllo in più.
create or replace function public.trg_applica_flusso_su_commessa_nuova()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is null or new.deleted_at is not null or new.workflow_kind = 'generale' then
    return new;
  end if;
  if not exists (
    select 1 from public.companies c where c.id = new.company_id and c.playbook_auto_apply
  ) then
    return new;
  end if;
  -- Mai bloccare la creazione di una commessa per colpa del flusso.
  begin
    perform public.applica_flusso_commessa(new.id);
  exception when others then
    raise log 'applica_flusso_commessa (%): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

-- ── 2. La scheda della generale ─────────────────────────────────────────────
create table if not exists public.commesse_generali (
  order_id uuid primary key references public.orders(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  modello text not null,
  valore_riferimento numeric(14,2),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commesse_generali_modello check (modello in ('appalto', 'sviluppo', 'compravendita')),
  constraint commesse_generali_valore check (valore_riferimento is null or valore_riferimento >= 0)
);

comment on table public.commesse_generali is
  'Modello e valore di riferimento di una commessa generale (orders.workflow_kind=generale).';
comment on column public.commesse_generali.valore_riferimento is
  'Appalto: valore del contratto. Sviluppo e compravendita: ricavi previsti. Facoltativo.';

create index if not exists commesse_generali_company_idx on public.commesse_generali (company_id);

-- ── 3. Cosa ha acceso l'azienda ─────────────────────────────────────────────
create table if not exists public.company_commesse_generali_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  modelli_attivi text[] not null default '{}',
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint company_commesse_generali_modelli
    check (modelli_attivi <@ array['appalto', 'sviluppo', 'compravendita']::text[])
);

comment on table public.company_commesse_generali_settings is
  'Modelli di commessa generale accesi dall''azienda in Impostazioni. Vuoto = funzione spenta.';

-- ── 4. Lettura: policy; scrittura: solo RPC ─────────────────────────────────
alter table public.commesse_generali enable row level security;
alter table public.company_commesse_generali_settings enable row level security;

revoke all on public.commesse_generali, public.company_commesse_generali_settings from anon, authenticated;
grant select on public.commesse_generali, public.company_commesse_generali_settings to authenticated;

drop policy if exists commesse_generali_lettura on public.commesse_generali;
create policy commesse_generali_lettura on public.commesse_generali for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id));

drop policy if exists commesse_generali_impostazioni_lettura on public.company_commesse_generali_settings;
create policy commesse_generali_impostazioni_lettura on public.company_commesse_generali_settings for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
      or public.has_permission_for_company((select auth.uid()), 'can_view_settings_orders', company_id));

-- ── 5. Impostazioni ─────────────────────────────────────────────────────────
create or replace function public.commesse_generali_impostazioni_salva(p_company_id uuid, p_modelli text[])
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ammessi constant text[] := array['appalto', 'sviluppo', 'compravendita'];
  v_modelli text[];
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception 'Non hai il permesso di cambiare queste impostazioni.' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(coalesce(p_modelli, '{}')) m where m <> all (v_ammessi)) then
    raise exception 'Scelta non valida.' using errcode = '22023';
  end if;
  -- Sempre nell'ordine di lettura, senza doppioni.
  select coalesce(array_agg(m order by array_position(v_ammessi, m)), '{}')
    into v_modelli
    from (select distinct m from unnest(coalesce(p_modelli, '{}')) m) s;

  insert into public.company_commesse_generali_settings (company_id, modelli_attivi, updated_by, updated_at)
  values (p_company_id, v_modelli, auth.uid(), now())
  on conflict (company_id) do update
    set modelli_attivi = excluded.modelli_attivi, updated_by = excluded.updated_by, updated_at = now();
  return v_modelli;
end;
$$;

revoke all on function public.commesse_generali_impostazioni_salva(uuid, text[]) from public, anon;
grant execute on function public.commesse_generali_impostazioni_salva(uuid, text[]) to authenticated;

-- ── 6. Creare una generale ──────────────────────────────────────────────────
-- Nasce come una commessa (stessi trigger, stesso numero progressivo) con tipo
-- «generale» e importo zero, più la sua riga in commesse_generali.
create or replace function public.commessa_generale_crea(
  p_company_id uuid,
  p_modello text,
  p_nome text,
  p_cliente_id uuid default null,
  p_valore numeric default null,
  p_codice text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_codice text := nullif(btrim(coalesce(p_codice, '')), '');
  v_cliente text;
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', p_company_id) then
    raise exception 'Non hai il permesso di creare commesse.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.company_commesse_generali_settings s
     where s.company_id = p_company_id and p_modello = any (s.modelli_attivi)
  ) then
    raise exception 'Questo tipo di commessa generale non è attivo. Si accende da Impostazioni → Commesse generali.' using errcode = '22023';
  end if;
  if v_nome is null then
    raise exception 'Scrivi il nome della commessa generale.' using errcode = '22023';
  end if;
  if p_valore is not null and p_valore < 0 then
    raise exception 'Il valore non può essere negativo.' using errcode = '22023';
  end if;
  if p_cliente_id is not null then
    select coalesce(nullif(btrim(p.business_name), ''), nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''))
      into v_cliente
      from public.profiles p
     where p.id = p_cliente_id and p.company_id = p_company_id and p.deleted_at is null;
    if not found then
      raise exception 'Cliente non trovato.' using errcode = 'P0002';
    end if;
  end if;
  if v_codice is null then
    v_codice := public.prossimo_numero_commessa(p_company_id);
  end if;

  insert into public.orders (id, company_id, created_by, description, workflow_kind, total_amount, order_code)
  values (v_id, p_company_id, auth.uid(), v_nome, 'generale', 0, v_codice);
  -- Il cliente arriva dopo l'inserimento: le automazioni «commessa creata»
  -- (email e messaggi al cliente) sono pensate per i lavori veri, che sono le
  -- figlie. La generale è un contenitore e non deve scrivere al cliente.
  if p_cliente_id is not null then
    update public.orders set customer_id = p_cliente_id, client_name = v_cliente where id = v_id;
  end if;

  insert into public.commesse_generali (order_id, company_id, modello, valore_riferimento, created_by)
  values (v_id, p_company_id, p_modello, p_valore, auth.uid());
  return v_id;
end;
$$;

revoke all on function public.commessa_generale_crea(uuid, text, text, uuid, numeric, text) from public, anon;
grant execute on function public.commessa_generale_crea(uuid, text, text, uuid, numeric, text) to authenticated;

-- ── 7. Modificare nome, valore e modello ────────────────────────────────────
create or replace function public.commessa_generale_aggiorna(
  p_generale_id uuid,
  p_nome text,
  p_valore numeric,
  p_modello text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_generale_id);
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_attuale text;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda) then
    raise exception 'Non hai il permesso di modificare questa commessa.' using errcode = '42501';
  end if;
  select modello into v_attuale from public.commesse_generali where order_id = p_generale_id;
  if not found then
    raise exception 'Commessa generale non trovata.' using errcode = 'P0002';
  end if;
  if v_nome is null then
    raise exception 'Scrivi il nome della commessa generale.' using errcode = '22023';
  end if;
  if p_valore is not null and p_valore < 0 then
    raise exception 'Il valore non può essere negativo.' using errcode = '22023';
  end if;
  -- Si può passare solo a un modello acceso; tenere quello che c'è è sempre possibile.
  if p_modello is distinct from v_attuale and not exists (
    select 1 from public.company_commesse_generali_settings s
     where s.company_id = v_azienda and p_modello = any (s.modelli_attivi)
  ) then
    raise exception 'Questo tipo di commessa generale non è attivo.' using errcode = '22023';
  end if;

  update public.orders set description = v_nome, updated_at = now() where id = p_generale_id;
  -- Chi non vede gli importi riceve il valore nullo dal riepilogo: salvando il nome
  -- lo cancellerebbe senza saperlo. Per lui il valore resta com'è.
  update public.commesse_generali
     set valore_riferimento = case
           when public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_azienda) then p_valore
           else valore_riferimento end,
         modello = p_modello, updated_at = now()
   where order_id = p_generale_id;
end;
$$;

revoke all on function public.commessa_generale_aggiorna(uuid, text, numeric, text) from public, anon;
grant execute on function public.commessa_generale_aggiorna(uuid, text, numeric, text) to authenticated;

-- ── 8. Collegare e scollegare le commesse ───────────────────────────────────
create or replace function public.commessa_generale_collega(p_generale_id uuid, p_commesse uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_generale_id);
  v_fatte integer;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda) then
    raise exception 'Non hai il permesso di modificare questa commessa.' using errcode = '42501';
  end if;
  if coalesce(array_length(p_commesse, 1), 0) = 0 then
    return 0;
  end if;
  if array_length(p_commesse, 1) > 200 then
    raise exception 'Troppe commesse in una volta: al massimo 200.' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_commesse) c(id)
     where not exists (
       select 1 from public.orders o
        where o.id = c.id and o.company_id = v_azienda and o.workflow_kind = 'commessa' and o.deleted_at is null
     )
  ) then
    raise exception 'Si possono collegare solo commesse normali di questa azienda.' using errcode = '22023';
  end if;

  update public.orders
     set commessa_generale_id = p_generale_id, updated_at = now()
   where id = any (p_commesse) and commessa_generale_id is distinct from p_generale_id;
  get diagnostics v_fatte = row_count;
  return v_fatte;
end;
$$;

revoke all on function public.commessa_generale_collega(uuid, uuid[]) from public, anon;
grant execute on function public.commessa_generale_collega(uuid, uuid[]) to authenticated;

create or replace function public.commessa_generale_scollega(p_commessa_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_commessa_id);
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda) then
    raise exception 'Non hai il permesso di modificare questa commessa.' using errcode = '42501';
  end if;
  update public.orders set commessa_generale_id = null, updated_at = now()
   where id = p_commessa_id and commessa_generale_id is not null;
end;
$$;

revoke all on function public.commessa_generale_scollega(uuid) from public, anon;
grant execute on function public.commessa_generale_scollega(uuid) to authenticated;

-- ── 9. Il riepilogo: tutti i numeri della generale in una lettura ───────────
-- Fatture con le stesse regole del cruscotto (get_cruscotto_invoice_stats):
-- solo fatture vere, non cancellate né annullate, al netto delle note di credito.
-- Importi, costi e margini solo a chi ha il permesso di vederli (altrimenti null).
create or replace function public.commessa_generale_riepilogo(p_generale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_generale_id);
  v_importi boolean;
  v_costi boolean;
  v_margini boolean;
  v_generale jsonb;
  v_figlie jsonb;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_view_orders', v_azienda) then
    raise exception 'Non hai il permesso di vedere questa commessa.' using errcode = '42501';
  end if;
  v_importi := public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_azienda);
  v_costi := public.has_permission_for_company(auth.uid(), 'can_view_costs', v_azienda);
  v_margini := public.has_permission_for_company(auth.uid(), 'can_view_margins', v_azienda);

  select jsonb_build_object(
           'id', o.id, 'codice', o.order_code, 'nome', o.description, 'cliente', o.client_name,
           'cliente_id', o.customer_id, 'modello', g.modello, 'creata_il', o.created_at,
           'valore', case when v_importi then g.valore_riferimento end)
    into v_generale
    from public.orders o
    join public.commesse_generali g on g.order_id = o.id
   where o.id = p_generale_id and o.deleted_at is null;
  if v_generale is null then
    raise exception 'Commessa generale non trovata.' using errcode = 'P0002';
  end if;

  with figlie as (
    select o.id, o.order_code, o.description, o.status, o.work_address, o.work_start_date, o.work_end_date,
           coalesce(o.total_amount, 0) as importo,
           coalesce(o.percentuale_avanzamento, 0) as avanzamento,
           s.name as stato_nome, s.color as stato_colore
      from public.orders o
      left join public.order_statuses s on s.id = o.current_status_id
     where o.commessa_generale_id = p_generale_id and o.deleted_at is null
  ),
  fatture as (
    select i.order_id,
           sum(coalesce(i.total, 0) - public.nc_collegate_importo(i.id)) as fatturato,
           sum(case when i.status in ('paid', 'pagata') then coalesce(i.total, 0) - public.nc_collegate_importo(i.id)
                    else least(coalesce(i.paid_amount, 0), coalesce(i.total, 0)) end) as incassato
      from public.invoices i
     where i.order_id in (select id from figlie)
       and i.company_id = v_azienda
       and i.deleted_at is null
       and i.document_type in ('invoice', 'fattura', 'fattura_accompagnatoria', 'parcella')
       and i.status not in ('cancelled', 'canceled', 'annullata', 'credited')
     group by i.order_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id, 'codice', f.order_code, 'nome', f.description,
           'stato', f.status, 'stato_nome', f.stato_nome, 'stato_colore', f.stato_colore,
           'indirizzo', f.work_address, 'inizio', f.work_start_date, 'fine', f.work_end_date,
           'avanzamento', f.avanzamento,
           'importo', case when v_importi then f.importo end,
           'eseguito', case when v_importi then round(f.importo * f.avanzamento / 100, 2) end,
           'fatturato', case when v_importi then coalesce(ft.fatturato, 0) end,
           'incassato', case when v_importi then coalesce(ft.incassato, 0) end,
           'costo', case when v_costi then m.consuntivo end,
           'margine', case when v_margini then m.margine end
         ) order by f.order_code nulls last, f.description), '[]'::jsonb)
    into v_figlie
    from figlie f
    left join fatture ft on ft.order_id = f.id
    left join public.v_ordine_marginalita m on m.id = f.id;

  return jsonb_build_object(
    'generale', v_generale,
    'figlie', v_figlie,
    'permessi', jsonb_build_object('importi', v_importi, 'costi', v_costi, 'margini', v_margini)
  );
end;
$$;

revoke all on function public.commessa_generale_riepilogo(uuid) from public, anon;
grant execute on function public.commessa_generale_riepilogo(uuid) to authenticated;
