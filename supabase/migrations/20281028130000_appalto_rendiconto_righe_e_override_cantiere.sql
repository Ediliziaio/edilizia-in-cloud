-- ════════════════════════════════════════════════════════════════════════════
-- Il rendiconto di una commessa in appalto, e l'eccezione di prezzo di cantiere
-- ════════════════════════════════════════════════════════════════════════════
-- Fase 3 del Modulo Appaltatori. Con la Fase 1 il committente ha un contratto e
-- un listino; con la Fase 2 la commessa dice se e' a corpo o a misura. Qui nasce
-- la cosa che trasforma il lavoro fatto in un importo:
--
--   appalto_tariffe_commessa   l'eccezione su un singolo cantiere: «su questo
--                              lavoro il trasporto me lo paga 80». Non creata
--                              in Fase 1 di proposito: non esisteva ancora
--                              nessuna pagina che la leggesse.
--   appalto_rendiconto_righe   una riga = un fatto fatturabile al committente.
--                              Tre uomini per otto ore, quattro viaggi, 120 m2
--                              di posa. L'importo e' una colonna GENERATA, cosi'
--                              pagina, PDF, report e Silvio dicono lo stesso
--                              numero; il margine e' generato anche lui, e resta
--                              NULL quando il costo non si sa, invece di
--                              sembrare uguale all'incasso.
--
-- IL PREZZO LO DECIDE IL DATABASE, NON IL BROWSER. Il trigger riscrive sempre
-- descrizione, unita' di misura e prezzo dalla tariffa, in tre passi: eccezione
-- di cantiere → tariffa del contratto valida a quella data → errore parlante.
-- Mai uno zero muto: e' cosi' che un sistema di rendicontazione perde soldi
-- senza che nessuno se ne accorga. Lo snapshot resta sulla riga, quindi alzare
-- un prezzo nel 2027 non riscrive un rendiconto del 2026 (stessa regola di
-- lp_sal_voci per i lavori pubblici).
--
-- Fuori da questa migrazione, di proposito: `sal_id` e gli stati 'in_sal' e
-- 'fatturata'. Arrivano in Fase 5 con la tabella del rendiconto al committente,
-- insieme al congelamento delle righe approvate. Una colonna che punta a una
-- tabella che non c'e' non e' una fondazione, e' un buco.
--
-- `origine` dice DA DOVE arriva la riga ('manuale' | 'rapportino' |
-- 'timbratura'), non che cosa e': il «che cosa» lo dice il tipo della tariffa.
-- In Fase 3 si scrive solo a mano; la Fase 4 riempira' le altre due.
--
-- Accessi: il rendiconto sono importi. Lo legge chi vede la commessa E ha
-- «Importi delle commesse», lo scrive chi la modifica. Niente anon, niente
-- clienti del portale, niente utenti in sola lettura.
--
-- Nessuna riga scritta. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 1. L'eccezione di prezzo su un singolo cantiere ─────────────────────────

create table if not exists public.appalto_tariffe_commessa (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  tariffa_id uuid not null references public.appalto_tariffe(id) on delete cascade,
  prezzo_unitario numeric(14,4) not null check (prezzo_unitario >= 0),
  nota text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, tariffa_id)
);
comment on table public.appalto_tariffe_commessa is
  'Eccezione di prezzo su un singolo cantiere: «su questo lavoro il trasporto me lo paga 80». Una riga per tariffa; il listino del contratto resta quello che e''.';

create index if not exists appalto_tariffe_commessa_order_idx
  on public.appalto_tariffe_commessa(company_id, order_id);

-- ── 2. Le righe di rendiconto ───────────────────────────────────────────────

create table if not exists public.appalto_rendiconto_righe (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  data date not null default current_date,
  -- La tariffa di partenza. Se la tariffa viene cancellata la riga resta: il
  -- fatto fatturabile e' avvenuto, e lo snapshot sotto lo descrive da se'.
  tariffa_id uuid references public.appalto_tariffe(id) on delete set null,
  -- Lo SNAPSHOT: prezzo e descrizione come erano quando la riga e' nata.
  descrizione text not null check (length(btrim(descrizione)) > 0),
  unita_misura text not null,
  prezzo_unitario numeric(14,4) not null check (prezzo_unitario >= 0),
  quantita numeric(18,4) not null check (quantita > 0),
  maggiorazione_pct numeric(6,3) not null default 0 check (maggiorazione_pct >= -100 and maggiorazione_pct <= 200),
  importo numeric(14,2) generated always as
    (round(quantita * prezzo_unitario * (1 + maggiorazione_pct / 100.0), 2)) stored,
  -- Il costo vero, per il margine. NULL = non lo sappiamo, e il margine resta
  -- NULL invece di sembrare uguale all'incasso.
  costo_interno numeric(14,2) check (costo_interno is null or costo_interno >= 0),
  margine numeric(14,2) generated always as (
    case when costo_interno is null then null
         else round(quantita * prezzo_unitario * (1 + maggiorazione_pct / 100.0), 2) - costo_interno
    end
  ) stored,
  employee_id uuid references public.profiles(id) on delete set null,
  fase_id uuid references public.order_work_phases(id) on delete set null,
  origine text not null default 'manuale' check (origine in ('manuale', 'rapportino', 'timbratura')),
  rapportino_id uuid references public.campo_rapportini(id) on delete set null,
  extra_contratto boolean not null default false,
  stato text not null default 'bozza' check (stato in ('bozza', 'confermata')),
  confermata_da uuid,
  confermata_at timestamptz,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.appalto_rendiconto_righe is
  'Una riga = un fatto fatturabile al committente su una commessa d''appalto: tre uomini per otto ore, quattro viaggi, 120 m2 di posa. L''importo e'' una colonna generata, cosi'' pagina, PDF, report e Silvio dicono lo stesso numero.';
comment on column public.appalto_rendiconto_righe.stato is
  '"bozza" = da controllare (e'' lo stato in cui nasce, anche quando arrivera'' da un rapportino). "confermata" = l''ufficio l''ha vista e puo'' entrare in un rendiconto al committente.';
comment on column public.appalto_rendiconto_righe.extra_contratto is
  'Riga fuori dall''accordo: sono quelle che si litigano a fine lavori, e vanno viste separate.';

create index if not exists appalto_rendiconto_order_idx
  on public.appalto_rendiconto_righe(company_id, order_id, data desc);
create index if not exists appalto_rendiconto_stato_idx
  on public.appalto_rendiconto_righe(order_id, stato);
create index if not exists appalto_rendiconto_rapportino_idx
  on public.appalto_rendiconto_righe(rapportino_id) where rapportino_id is not null;

-- ── 3. Il prezzo lo decide il database, non il browser ──────────────────────

create or replace function public.appalto_rendiconto_prepara()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
  v_ord record;
  v_t public.appalto_tariffe%rowtype;
  v_override numeric(14,4);
  v_costo numeric;
begin
  select o.company_id, o.order_type, o.appalto_contratto_id
    into v_ord
    from public.orders o
   where o.id = new.order_id and o.deleted_at is null;
  if not found then
    raise exception 'Commessa inesistente' using errcode = '23514';
  end if;
  if v_ord.order_type is distinct from 'appaltatore_lavoro' then
    raise exception 'Il rendiconto esiste solo sulle commesse in appalto' using errcode = '23514';
  end if;
  new.company_id := v_ord.company_id;

  if new.fase_id is not null and not exists (
    select 1 from public.order_work_phases f
     where f.id = new.fase_id and f.order_id = new.order_id
  ) then
    raise exception 'La fase deve appartenere a questa commessa' using errcode = '23514';
  end if;

  if new.tariffa_id is null then
    -- Riga libera: fuori contratto per definizione, e il prezzo lo scrive chi
    -- la inserisce (non c'e' nessun listino da cui prenderlo).
    new.extra_contratto := true;
    return new;
  end if;

  select * into v_t from public.appalto_tariffe where id = new.tariffa_id;
  if not found then
    raise exception 'Tariffa inesistente' using errcode = '23514';
  end if;
  if v_t.company_id is distinct from v_ord.company_id then
    raise exception 'La tariffa e'' di un''altra azienda' using errcode = '23514';
  end if;
  if v_ord.appalto_contratto_id is null then
    raise exception 'Questa commessa non ha un contratto: aggancialo prima di rendicontare a listino' using errcode = '23514';
  end if;
  if v_t.contratto_id is distinct from v_ord.appalto_contratto_id then
    raise exception 'La tariffa appartiene a un altro contratto' using errcode = '23514';
  end if;
  if (v_t.valido_dal is not null and new.data < v_t.valido_dal)
     or (v_t.valido_al is not null and new.data > v_t.valido_al) then
    raise exception 'La tariffa «%» non era in vigore il %', v_t.descrizione, to_char(new.data, 'DD/MM/YYYY')
      using errcode = '23514';
  end if;

  -- Lo snapshot viene dal database, non da quello che manda il client.
  select tc.prezzo_unitario into v_override
    from public.appalto_tariffe_commessa tc
   where tc.order_id = new.order_id and tc.tariffa_id = new.tariffa_id;

  new.descrizione := v_t.descrizione;
  new.unita_misura := v_t.unita_misura;
  new.prezzo_unitario := coalesce(v_override, v_t.prezzo_unitario);
  new.extra_contratto := false;

  -- Il costo: dalla tariffa aziendale collegata, se c'e'. Altrimenti resta
  -- quello che ha scritto l'utente, che del suo costo e' padrone.
  if v_t.tariffa_id is not null then
    select coalesce(ta.costo_interno, ta.prezzo_costo) into v_costo
      from public.tariffe_aziendali ta where ta.id = v_t.tariffa_id;
    if v_costo is not null and v_costo > 0 then
      new.costo_interno := round(new.quantita * v_costo, 2);
    end if;
  end if;

  return new;
end;
$fn$;
revoke all on function public.appalto_rendiconto_prepara() from public, anon, authenticated;

drop trigger if exists trg_appalto_rendiconto_prepara on public.appalto_rendiconto_righe;
create trigger trg_appalto_rendiconto_prepara
  before insert or update of order_id, tariffa_id, data, quantita, fase_id, company_id
  on public.appalto_rendiconto_righe
  for each row execute function public.appalto_rendiconto_prepara();

create or replace function public.appalto_rendiconto_tocca()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  new.updated_at := now();
  -- Chi ha confermato e quando: senza, «confermata» non e' una prova di niente.
  if new.stato = 'confermata' and (old.stato is distinct from 'confermata') then
    new.confermata_da := auth.uid();
    new.confermata_at := now();
  elsif new.stato <> 'confermata' then
    new.confermata_da := null;
    new.confermata_at := null;
  end if;
  return new;
end;
$fn$;
revoke all on function public.appalto_rendiconto_tocca() from public, anon, authenticated;

drop trigger if exists trg_appalto_rendiconto_tocca on public.appalto_rendiconto_righe;
create trigger trg_appalto_rendiconto_tocca before update on public.appalto_rendiconto_righe
  for each row execute function public.appalto_rendiconto_tocca();

-- L'azienda dell'eccezione di cantiere si deduce, come per le tariffe.
create or replace function public.appalto_override_prepara()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare v_company uuid; v_contratto uuid; v_tipo text; v_t_contratto uuid; v_t_company uuid;
begin
  select o.company_id, o.appalto_contratto_id, o.order_type
    into v_company, v_contratto, v_tipo
    from public.orders o where o.id = new.order_id and o.deleted_at is null;
  if not found then
    raise exception 'Commessa inesistente' using errcode = '23514';
  end if;
  if v_tipo is distinct from 'appaltatore_lavoro' then
    raise exception 'Le eccezioni di prezzo esistono solo sulle commesse in appalto' using errcode = '23514';
  end if;
  select contratto_id, company_id into v_t_contratto, v_t_company
    from public.appalto_tariffe where id = new.tariffa_id;
  if v_t_company is distinct from v_company then
    raise exception 'La tariffa e'' di un''altra azienda' using errcode = '23514';
  end if;
  if v_t_contratto is distinct from v_contratto then
    raise exception 'La tariffa appartiene a un altro contratto' using errcode = '23514';
  end if;
  new.company_id := v_company;
  new.updated_at := now();
  return new;
end;
$fn$;
revoke all on function public.appalto_override_prepara() from public, anon, authenticated;

drop trigger if exists trg_appalto_override_prepara on public.appalto_tariffe_commessa;
create trigger trg_appalto_override_prepara
  before insert or update on public.appalto_tariffe_commessa
  for each row execute function public.appalto_override_prepara();

-- ── 4. Accessi ──────────────────────────────────────────────────────────────

alter table public.appalto_tariffe_commessa enable row level security;
alter table public.appalto_rendiconto_righe enable row level security;

revoke all on public.appalto_tariffe_commessa from public, anon, authenticated;
revoke all on public.appalto_rendiconto_righe from public, anon, authenticated;
grant select, insert, update, delete on public.appalto_tariffe_commessa to authenticated;
grant select, insert, update, delete on public.appalto_rendiconto_righe to authenticated;
grant all on public.appalto_tariffe_commessa to service_role;
grant all on public.appalto_rendiconto_righe to service_role;

drop policy if exists arr_lettura on public.appalto_rendiconto_righe;
create policy arr_lettura on public.appalto_rendiconto_righe for select to authenticated using (
  not (select public.utente_e_cliente_esterno())
  and public.puo_vedere_commessa(order_id)
  and public.has_permission_for_company((select auth.uid()), 'can_view_order_amounts', company_id)
);

drop policy if exists arr_inserimento on public.appalto_rendiconto_righe;
create policy arr_inserimento on public.appalto_rendiconto_righe for insert to authenticated with check (
  not (select public.utente_e_cliente_esterno())
  and not public.utente_sola_lettura(company_id)
  and public.puo_modificare_commessa(order_id)
  and public.has_permission_for_company((select auth.uid()), 'can_view_order_amounts', company_id)
);

drop policy if exists arr_modifica on public.appalto_rendiconto_righe;
create policy arr_modifica on public.appalto_rendiconto_righe for update to authenticated
using (
  not (select public.utente_e_cliente_esterno())
  and not public.utente_sola_lettura(company_id)
  and public.puo_modificare_commessa(order_id)
  and public.has_permission_for_company((select auth.uid()), 'can_view_order_amounts', company_id)
)
with check (
  not public.utente_sola_lettura(company_id)
  and public.puo_modificare_commessa(order_id)
);

drop policy if exists arr_cancella on public.appalto_rendiconto_righe;
create policy arr_cancella on public.appalto_rendiconto_righe for delete to authenticated using (
  not (select public.utente_e_cliente_esterno())
  and not public.utente_sola_lettura(company_id)
  and public.puo_modificare_commessa(order_id)
  and public.has_permission_for_company((select auth.uid()), 'can_view_order_amounts', company_id)
);

drop policy if exists atc_lettura on public.appalto_tariffe_commessa;
create policy atc_lettura on public.appalto_tariffe_commessa for select to authenticated using (
  not (select public.utente_e_cliente_esterno())
  and public.puo_vedere_commessa(order_id)
  and public.has_permission_for_company((select auth.uid()), 'can_view_order_amounts', company_id)
);

drop policy if exists atc_scrittura on public.appalto_tariffe_commessa;
create policy atc_scrittura on public.appalto_tariffe_commessa for all to authenticated
using (
  not (select public.utente_e_cliente_esterno())
  and not public.utente_sola_lettura(company_id)
  and public.puo_modificare_commessa(order_id)
  and public.has_permission_for_company((select auth.uid()), 'can_view_order_amounts', company_id)
)
with check (
  not public.utente_sola_lettura(company_id)
  and public.puo_modificare_commessa(order_id)
  and public.has_permission_for_company((select auth.uid()), 'can_view_order_amounts', company_id)
);

drop policy if exists arr_super_admin on public.appalto_rendiconto_righe;
create policy arr_super_admin on public.appalto_rendiconto_righe for all to authenticated
  using (public.has_role((select auth.uid()), 'super_admin'::public.app_role));
drop policy if exists atc_super_admin on public.appalto_tariffe_commessa;
create policy atc_super_admin on public.appalto_tariffe_commessa for all to authenticated
  using (public.has_role((select auth.uid()), 'super_admin'::public.app_role));
