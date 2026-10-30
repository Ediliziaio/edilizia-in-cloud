-- ════════════════════════════════════════════════════════════════════════════
-- Commessa generale, modulo «Contratto e SAL» (tappe 1 e 4 del piano)
-- ════════════════════════════════════════════════════════════════════════════
-- Piano: docs/superpowers/plans/2026-10-30-commesse-generali-appalti-sviluppi.md
--
-- Un appalto ha un contratto con il committente e i SAL si emettono sul
-- contratto, non sui singoli ordini di lavoro. Qui:
--
--   · generale_contratti            importo base, ribasso, oneri della sicurezza,
--     date, penale, anticipazione, ritenuta di garanzia (0,5% di partenza),
--     CIG/CUP, split payment, reverse charge. Una riga per generale.
--   · generale_contratto_atti       atti aggiuntivi, varianti (+/−) e proroghe.
--   · generale_contratto_garanzie   cauzione definitiva, garanzia
--     dell'anticipazione, CAR… con scadenza e svincolo.
--   · generale_elenco_prezzi        i prezzi del contratto (il ribasso si applica
--     in lettura, voce per voce, se la voce è soggetta).
--   · generale_computo              un ordine di lavoro «prezzato dall'elenco»:
--     voci e quantità previste. Dà l'importo dell'ordine.
--   · generale_misure               le quantità eseguite, per ordine e per voce.
--   · generale_sal / generale_sal_voci  il SAL di contratto.
--
-- Il valore contrattuale aggiornato (base ribassata + sicurezza + atti) È il
-- valore della generale: un trigger lo scrive in commesse_generali e un altro
-- impedisce di cambiarlo a mano finché c'è un contratto. Un numero solo.
--
-- Il SAL di contratto RIUSA il SAL della commessa: la generale è una riga di
-- orders, quindi il SAL è una riga di sal_records sulla generale (numerazione
-- del contratto), con le sue voci in sal_voci (cumulative), il PDF di
-- generate-sal-pdf e la firma via sal_signature_tokens. Qui si aggiunge solo
-- ciò che il SAL della commessa non ha: periodo, lordo → ritenuta → recupero
-- dell'anticipazione → netto (generale_sal) e, per ogni voce, l'ordine di
-- lavoro da cui arriva (generale_sal_voci). La ritenuta trattenuta va anche
-- nel registro delle ritenute (ritenute_garanzia, direzione «attiva») quando
-- chi emette può scrivere nel registro fiscale (gli amministratori).
--
-- Si legge con generale_contratto_leggi (una chiamata) e con le policy; il SAL
-- si compone, si emette e si annulla solo con le RPC generale_sal_*.
-- Nessun dato esistente viene toccato. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 0. L'azienda di ogni riga è quella della generale ───────────────────────
create or replace function public.generale_contratto_azienda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.generale_id is distinct from old.generale_id then
    raise exception 'Una riga del contratto non cambia commessa generale.' using errcode = '23514';
  end if;
  select g.company_id into new.company_id from public.commesse_generali g where g.order_id = new.generale_id;
  if new.company_id is null then
    raise exception 'Commessa generale non trovata.' using errcode = 'P0002';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.generale_contratto_azienda() from public, anon, authenticated;

-- ── 1. Il contratto ─────────────────────────────────────────────────────────
create table if not exists public.generale_contratti (
  generale_id uuid primary key references public.commesse_generali(order_id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  riferimento text,
  importo_base numeric(14,2),
  ribasso_pct numeric(7,4) not null default 0,
  oneri_sicurezza numeric(14,2) not null default 0,
  data_firma date,
  data_consegna_lavori date,
  data_fine_prevista date,
  data_ultimazione date,
  penale_giornaliera numeric(12,2),
  penale_massima_pct numeric(5,2) not null default 10,
  anticipazione_pct numeric(5,2) not null default 0,
  anticipazione_importo numeric(14,2),
  anticipazione_data date,
  ritenuta_pct numeric(5,2) not null default 0.5,
  cig text,
  cup text,
  split_payment boolean not null default false,
  reverse_charge boolean not null default false,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generale_contratti_importi check (
    (importo_base is null or importo_base >= 0) and oneri_sicurezza >= 0
    and (penale_giornaliera is null or penale_giornaliera >= 0)
    and (anticipazione_importo is null or anticipazione_importo >= 0)),
  constraint generale_contratti_percentuali check (
    ribasso_pct >= 0 and ribasso_pct < 100
    and penale_massima_pct >= 0 and penale_massima_pct <= 100
    and anticipazione_pct >= 0 and anticipazione_pct <= 100
    and ritenuta_pct >= 0 and ritenuta_pct <= 100),
  constraint generale_contratti_date check (
    data_fine_prevista is null or data_consegna_lavori is null or data_fine_prevista >= data_consegna_lavori),
  constraint generale_contratti_iva check (not (split_payment and reverse_charge))
);

comment on table public.generale_contratti is
  'Contratto di una commessa generale con il committente. Il valore aggiornato (generale_contratto_valore) è commesse_generali.valore_riferimento.';
comment on column public.generale_contratti.importo_base is 'Lavori a base del contratto, soggetti a ribasso. Senza, il contratto non governa il valore della generale.';
comment on column public.generale_contratti.anticipazione_pct is 'Quota di ogni SAL che recupera l''anticipazione, fino a esaurirla.';
comment on column public.generale_contratti.ritenuta_pct is 'Ritenuta di garanzia su ogni SAL (0,5% di partenza, come negli appalti pubblici).';

-- ── 2. Atti aggiuntivi, varianti e proroghe ─────────────────────────────────
create table if not exists public.generale_contratto_atti (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  generale_id uuid not null references public.commesse_generali(order_id) on delete cascade,
  tipo text not null default 'atto_aggiuntivo',
  numero text,
  data date not null default current_date,
  descrizione text not null,
  importo numeric(14,2) not null default 0,
  giorni_proroga integer not null default 0,
  allegato_id uuid references public.order_attachments(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generale_contratto_atti_tipo check (tipo in ('atto_aggiuntivo', 'variante', 'proroga')),
  constraint generale_contratto_atti_proroga check (tipo <> 'proroga' or importo = 0),
  constraint generale_contratto_atti_giorni check (giorni_proroga >= 0 and giorni_proroga <= 3650),
  constraint generale_contratto_atti_descrizione check (btrim(descrizione) <> '')
);
create index if not exists generale_contratto_atti_generale_idx on public.generale_contratto_atti (generale_id, data);

-- ── 3. Garanzie date al committente ─────────────────────────────────────────
create table if not exists public.generale_contratto_garanzie (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  generale_id uuid not null references public.commesse_generali(order_id) on delete cascade,
  tipo text not null,
  garante text,
  numero text,
  importo numeric(14,2),
  data_emissione date,
  scadenza date,
  svincolata_il date,
  allegato_id uuid references public.order_attachments(id) on delete set null,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generale_contratto_garanzie_tipo check (tipo in ('cauzione_definitiva', 'garanzia_anticipazione', 'car', 'rata_saldo', 'altra')),
  constraint generale_contratto_garanzie_importo check (importo is null or importo >= 0)
);
create index if not exists generale_contratto_garanzie_generale_idx on public.generale_contratto_garanzie (generale_id);

-- ── 4. Elenco prezzi del contratto ──────────────────────────────────────────
create table if not exists public.generale_elenco_prezzi (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  generale_id uuid not null references public.commesse_generali(order_id) on delete cascade,
  codice text,
  descrizione text not null,
  unita_misura text not null default '',
  prezzo numeric(14,4) not null,
  soggetto_ribasso boolean not null default true,
  quantita_contratto numeric(14,3),
  posizione integer not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generale_elenco_prezzi_prezzo check (prezzo >= 0),
  constraint generale_elenco_prezzi_quantita check (quantita_contratto is null or quantita_contratto >= 0),
  constraint generale_elenco_prezzi_descrizione check (btrim(descrizione) <> ''),
  -- Le voci senza codice (null) non si scontrano: un vincolo univoco ammette più null.
  constraint generale_elenco_prezzi_codice_unico unique (generale_id, codice)
);
create index if not exists generale_elenco_prezzi_generale_idx on public.generale_elenco_prezzi (generale_id, posizione);

-- ── 5. Ordini prezzati dall'elenco e misure ─────────────────────────────────
create table if not exists public.generale_computo (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  generale_id uuid not null references public.commesse_generali(order_id) on delete cascade,
  figlia_id uuid not null references public.orders(id) on delete cascade,
  voce_id uuid not null references public.generale_elenco_prezzi(id) on delete cascade,
  quantita numeric(14,3) not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generale_computo_quantita check (quantita >= 0),
  constraint generale_computo_unica unique (figlia_id, voce_id)
);
create index if not exists generale_computo_generale_idx on public.generale_computo (generale_id);

create table if not exists public.generale_misure (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  generale_id uuid not null references public.commesse_generali(order_id) on delete cascade,
  figlia_id uuid not null references public.orders(id) on delete cascade,
  voce_id uuid not null references public.generale_elenco_prezzi(id) on delete restrict,
  data date not null default current_date,
  quantita numeric(14,3) not null,
  descrizione text,
  sal_id uuid references public.sal_records(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generale_misure_quantita check (quantita <> 0)
);
create index if not exists generale_misure_generale_idx on public.generale_misure (generale_id, data);
create index if not exists generale_misure_figlia_idx on public.generale_misure (figlia_id, voce_id);
create index if not exists generale_misure_sal_idx on public.generale_misure (sal_id) where sal_id is not null;

comment on column public.generale_misure.quantita is 'Quantità eseguita (negativa = detrazione, come nel libretto delle misure).';
comment on column public.generale_misure.sal_id is 'Il SAL in cui la misura è entrata: da lì non si cambia più. La scrivono solo le RPC generale_sal_*.';

-- Un ordine o una voce di un altro contratto non entrano.
create or replace function public.generale_contratto_figlia_coerente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.orders o
     where o.id = new.figlia_id and o.commessa_generale_id = new.generale_id and o.deleted_at is null
  ) then
    raise exception 'Questa commessa non fa parte del contratto.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.generale_elenco_prezzi v where v.id = new.voce_id and v.generale_id = new.generale_id) then
    raise exception 'Questa voce non è nell''elenco prezzi del contratto.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.generale_contratto_figlia_coerente() from public, anon, authenticated;

-- Una misura entrata in un SAL non si tocca: per cambiarla si annulla la bozza.
-- Le cancellazioni a cascata (generale, azienda) passano: arrivano da un altro trigger.
create or replace function public.generale_misura_bloccata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  if old.sal_id is not null and exists (select 1 from public.sal_records s where s.id = old.sal_id) then
    raise exception 'Questa misura è già in un SAL: per cambiarla annulla prima il SAL in bozza.' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
revoke all on function public.generale_misura_bloccata() from public, anon, authenticated;

-- ── 6. Il SAL di contratto ──────────────────────────────────────────────────
create table if not exists public.generale_sal (
  sal_id uuid primary key references public.sal_records(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  generale_id uuid not null references public.commesse_generali(order_id) on delete cascade,
  periodo_dal date,
  periodo_al date not null,
  cumulativo numeric(14,2) not null default 0,
  precedente numeric(14,2) not null default 0,
  lordo numeric(14,2) not null default 0,
  ritenuta_pct numeric(5,2) not null default 0,
  ritenuta numeric(14,2) not null default 0,
  recupero_pct numeric(5,2) not null default 0,
  recupero_anticipazione numeric(14,2) not null default 0,
  netto numeric(14,2) not null default 0,
  riferimento_contratto text,
  cig text,
  cup text,
  split_payment boolean not null default false,
  reverse_charge boolean not null default false,
  ritenuta_registro_id uuid references public.ritenute_garanzia(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint generale_sal_periodo check (periodo_dal is null or periodo_dal <= periodo_al)
);
create index if not exists generale_sal_generale_idx on public.generale_sal (generale_id);

comment on table public.generale_sal is
  'SAL di contratto: il SAL (sal_records) emesso sulla commessa generale, con periodo e lordo → ritenuta → recupero anticipazione → netto. Scritto solo dalle RPC generale_sal_*.';

create table if not exists public.generale_sal_voci (
  sal_voce_id uuid primary key references public.sal_voci(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  sal_id uuid not null references public.sal_records(id) on delete cascade,
  figlia_id uuid references public.orders(id) on delete set null,
  voce_id uuid references public.generale_elenco_prezzi(id) on delete set null,
  tipo text not null,
  quantita numeric(14,3),
  prezzo_netto numeric(14,4),
  unita_misura text,
  constraint generale_sal_voci_tipo check (tipo in ('avanzamento', 'misure', 'sicurezza'))
);
create index if not exists generale_sal_voci_sal_idx on public.generale_sal_voci (sal_id);

comment on table public.generale_sal_voci is
  'Da dove viene ogni voce di un SAL di contratto: l''ordine di lavoro (figlia_id) e, per le misure, la voce d''elenco con quantità e prezzo netto.';

-- ── 7. Trigger ──────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['generale_contratti', 'generale_contratto_atti', 'generale_contratto_garanzie',
                           'generale_elenco_prezzi', 'generale_computo', 'generale_misure'] loop
    execute format('drop trigger if exists trg_%1$s_azienda on public.%1$I', t);
    execute format('create trigger trg_%1$s_azienda before insert or update on public.%1$I
                      for each row execute function public.generale_contratto_azienda()', t);
  end loop;
end;
$$;

drop trigger if exists trg_generale_computo_coerente on public.generale_computo;
create trigger trg_generale_computo_coerente
  before insert or update of figlia_id, voce_id, generale_id on public.generale_computo
  for each row execute function public.generale_contratto_figlia_coerente();

drop trigger if exists trg_generale_misure_coerente on public.generale_misure;
create trigger trg_generale_misure_coerente
  before insert or update of figlia_id, voce_id, generale_id on public.generale_misure
  for each row execute function public.generale_contratto_figlia_coerente();

drop trigger if exists trg_generale_misure_bloccata on public.generale_misure;
create trigger trg_generale_misure_bloccata
  before update or delete on public.generale_misure
  for each row execute function public.generale_misura_bloccata();

-- ── 8. Il valore contrattuale aggiornato è il valore della generale ─────────
create or replace function public.generale_contratto_valore(p_generale_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case when c.importo_base is null then null else
           round(c.importo_base * (1 - c.ribasso_pct / 100), 2) + c.oneri_sicurezza
           + coalesce((select sum(a.importo) from public.generale_contratto_atti a where a.generale_id = c.generale_id), 0)
         end
    from public.generale_contratti c
   where c.generale_id = p_generale_id
$$;
revoke all on function public.generale_contratto_valore(uuid) from public, anon, authenticated;

create or replace function public.generale_contratto_allinea_valore()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_valore numeric;
begin
  -- Le cancellazioni a cascata (generale, azienda) non devono riscrivere la generale.
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  if tg_op = 'DELETE' then v_id := old.generale_id; else v_id := new.generale_id; end if;
  v_valore := public.generale_contratto_valore(v_id);
  if v_valore is not null then
    if v_valore < 0 then
      raise exception 'Con questi atti il valore del contratto andrebbe sotto zero.' using errcode = '23514';
    end if;
    update public.commesse_generali
       set valore_riferimento = v_valore, updated_at = now()
     where order_id = v_id and valore_riferimento is distinct from v_valore;
  end if;
  return null;
end;
$$;
revoke all on function public.generale_contratto_allinea_valore() from public, anon, authenticated;

drop trigger if exists trg_generale_contratti_valore on public.generale_contratti;
create trigger trg_generale_contratti_valore
  after insert or update or delete on public.generale_contratti
  for each row execute function public.generale_contratto_allinea_valore();

drop trigger if exists trg_generale_contratto_atti_valore on public.generale_contratto_atti;
create trigger trg_generale_contratto_atti_valore
  after insert or update or delete on public.generale_contratto_atti
  for each row execute function public.generale_contratto_allinea_valore();

-- Chi modifica la generale (nome, tipo) rimanda il valore che ha letto: se è lo
-- stesso passa; se è diverso e c'è un contratto, si cambia dal contratto.
create or replace function public.commesse_generali_valore_dal_contratto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_valore numeric;
begin
  if new.valore_riferimento is distinct from old.valore_riferimento then
    v_valore := public.generale_contratto_valore(new.order_id);
    if v_valore is not null and new.valore_riferimento is distinct from v_valore then
      raise exception 'Il valore viene dal contratto: cambialo nella scheda «Contratto e SAL».' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.commesse_generali_valore_dal_contratto() from public, anon, authenticated;

drop trigger if exists trg_commesse_generali_valore_dal_contratto on public.commesse_generali;
create trigger trg_commesse_generali_valore_dal_contratto
  before update of valore_riferimento on public.commesse_generali
  for each row execute function public.commesse_generali_valore_dal_contratto();

-- ── 9. Chi legge e chi scrive ───────────────────────────────────────────────
-- Leggere: commesse e importi. Scrivere: poter modificare la generale (stessa
-- regola dei SAL, puo_modificare_commessa) e vedere gli importi; le misure
-- (solo quantità) senza il permesso degli importi.
alter table public.generale_contratti enable row level security;
alter table public.generale_contratto_atti enable row level security;
alter table public.generale_contratto_garanzie enable row level security;
alter table public.generale_elenco_prezzi enable row level security;
alter table public.generale_computo enable row level security;
alter table public.generale_misure enable row level security;
alter table public.generale_sal enable row level security;
alter table public.generale_sal_voci enable row level security;

revoke all on public.generale_contratti, public.generale_contratto_atti, public.generale_contratto_garanzie,
              public.generale_elenco_prezzi, public.generale_computo, public.generale_misure,
              public.generale_sal, public.generale_sal_voci
  from anon, authenticated;

grant select, insert, update, delete on public.generale_contratti, public.generale_contratto_atti,
  public.generale_contratto_garanzie, public.generale_elenco_prezzi, public.generale_computo to authenticated;
grant select, delete on public.generale_misure to authenticated;
-- sal_id lo scrivono solo le RPC del SAL: il browser non lo può toccare.
grant insert (generale_id, company_id, figlia_id, voce_id, data, quantita, descrizione),
      update (figlia_id, voce_id, data, quantita, descrizione)
   on public.generale_misure to authenticated;
grant select on public.generale_sal, public.generale_sal_voci to authenticated;

do $$
declare t text;
begin
  foreach t in array array['generale_contratti', 'generale_contratto_atti', 'generale_contratto_garanzie',
                           'generale_elenco_prezzi', 'generale_computo', 'generale_sal', 'generale_sal_voci'] loop
    execute format('drop policy if exists %1$s_lettura on public.%1$I', t);
    execute format($p$create policy %1$s_lettura on public.%1$I for select to authenticated
      using (public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
         and public.has_permission_for_company((select auth.uid()), 'can_view_order_amounts', company_id))$p$, t);
  end loop;
  foreach t in array array['generale_contratti', 'generale_contratto_atti', 'generale_contratto_garanzie',
                           'generale_elenco_prezzi', 'generale_computo'] loop
    execute format('drop policy if exists %1$s_scrittura on public.%1$I', t);
    execute format($p$create policy %1$s_scrittura on public.%1$I for all to authenticated
      using (public.puo_modificare_commessa(generale_id)
         and public.has_permission_for_company((select auth.uid()), 'can_view_order_amounts', company_id))
      with check (company_id = public.get_order_company_id(generale_id)
         and public.puo_modificare_commessa(generale_id)
         and public.has_permission_for_company((select auth.uid()), 'can_view_order_amounts', company_id))$p$, t);
  end loop;
end;
$$;

drop policy if exists generale_misure_lettura on public.generale_misure;
create policy generale_misure_lettura on public.generale_misure for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id));
drop policy if exists generale_misure_scrittura on public.generale_misure;
create policy generale_misure_scrittura on public.generale_misure for all to authenticated
  using (public.puo_modificare_commessa(generale_id))
  with check (company_id = public.get_order_company_id(generale_id) and public.puo_modificare_commessa(generale_id));

-- ── 10. Tutto il contratto in una lettura ───────────────────────────────────
create or replace function public.generale_contratto_leggi(p_generale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_generale_id);
  v_importi boolean;
  v_modifica boolean;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_view_orders', v_azienda) then
    raise exception 'Non hai il permesso di vedere questa commessa.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.commesse_generali g where g.order_id = p_generale_id) then
    raise exception 'Commessa generale non trovata.' using errcode = 'P0002';
  end if;
  v_importi := public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_azienda);
  v_modifica := v_importi and public.puo_modificare_commessa(p_generale_id);
  -- Il contratto è fatto di importi: senza quel permesso non si mostra niente.
  if not v_importi then
    return jsonb_build_object('permessi', jsonb_build_object('importi', false, 'modifica', false));
  end if;

  return jsonb_build_object(
    'permessi', jsonb_build_object('importi', true, 'modifica', v_modifica),
    'contratto', (select to_jsonb(c) - 'company_id' - 'created_by' from public.generale_contratti c where c.generale_id = p_generale_id),
    'atti', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'tipo', a.tipo, 'numero', a.numero, 'data', a.data, 'descrizione', a.descrizione,
               'importo', a.importo, 'giorni_proroga', a.giorni_proroga, 'allegato_id', a.allegato_id,
               'allegato_nome', oa.file_name, 'allegato_percorso', oa.file_url)
             order by a.data, a.created_at)
        from public.generale_contratto_atti a
        left join public.order_attachments oa on oa.id = a.allegato_id
       where a.generale_id = p_generale_id), '[]'::jsonb),
    'garanzie', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'tipo', x.tipo, 'garante', x.garante, 'numero', x.numero, 'importo', x.importo,
               'data_emissione', x.data_emissione, 'scadenza', x.scadenza, 'svincolata_il', x.svincolata_il,
               'note', x.note, 'allegato_id', x.allegato_id, 'allegato_nome', oa.file_name, 'allegato_percorso', oa.file_url)
             order by x.scadenza nulls last, x.created_at)
        from public.generale_contratto_garanzie x
        left join public.order_attachments oa on oa.id = x.allegato_id
       where x.generale_id = p_generale_id), '[]'::jsonb),
    'sal', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'numero', s.numero_sal, 'stato', s.stato, 'data', s.data_emissione, 'note', s.note,
               'cumulativo', s.importo_totale,
               'dal', gs.periodo_dal, 'al', gs.periodo_al, 'precedente', gs.precedente, 'lordo', gs.lordo,
               'ritenuta_pct', gs.ritenuta_pct, 'ritenuta', gs.ritenuta,
               'recupero_pct', gs.recupero_pct, 'recupero', gs.recupero_anticipazione, 'netto', gs.netto,
               'di_contratto', gs.sal_id is not null,
               'registro', case when r.id is null then null else
                 jsonb_build_object('id', r.id, 'stato', r.stato, 'svincolata_il', r.data_svincolo_effettiva) end,
               'firma', (select jsonb_build_object('da', t.signed_by_name, 'il', t.signed_at)
                           from public.sal_signature_tokens t
                          where t.sal_id = s.id and t.signed_at is not null
                          order by t.signed_at desc limit 1),
               'voci', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', v.id, 'descrizione', v.descrizione, 'importo_contrattuale', v.importo_contrattuale,
                          'percentuale', v.percentuale_avanzamento, 'importo', v.importo_sal,
                          'tipo', gv.tipo, 'figlia_id', gv.figlia_id, 'voce_id', gv.voce_id,
                          'quantita', gv.quantita, 'prezzo', gv.prezzo_netto, 'unita', gv.unita_misura)
                        order by v.created_at, v.id)
                   from public.sal_voci v
                   left join public.generale_sal_voci gv on gv.sal_voce_id = v.id
                  where v.sal_id = s.id), '[]'::jsonb))
             order by s.numero_sal)
        from public.sal_records s
        left join public.generale_sal gs on gs.sal_id = s.id
        left join public.ritenute_garanzia r on r.id = gs.ritenuta_registro_id
       where s.order_id = p_generale_id), '[]'::jsonb),
    -- Le fatture emesse sul contratto (non sugli ordini): stesse regole del riepilogo.
    'fatture', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'numero', i.invoice_number, 'data', i.issue_date, 'scadenza', i.due_date, 'stato', i.status,
               'totale', coalesce(i.total, 0) - public.nc_collegate_importo(i.id),
               'incassato', case when i.status in ('paid', 'pagata') then coalesce(i.total, 0) - public.nc_collegate_importo(i.id)
                                 else least(coalesce(i.paid_amount, 0), coalesce(i.total, 0)) end)
             order by i.issue_date, i.invoice_number)
        from public.invoices i
       where i.order_id = p_generale_id
         and i.company_id = v_azienda
         and i.deleted_at is null
         and i.document_type in ('invoice', 'fattura', 'fattura_accompagnatoria', 'parcella')
         and i.status not in ('cancelled', 'canceled', 'annullata', 'credited')), '[]'::jsonb),
    'elenco_voci', (select count(*) from public.generale_elenco_prezzi e where e.generale_id = p_generale_id)
  );
end;
$$;
revoke all on function public.generale_contratto_leggi(uuid) from public, anon;
grant execute on function public.generale_contratto_leggi(uuid) to authenticated;

-- ── 11. Il calcolo del SAL ──────────────────────────────────────────────────
-- Numeri italiani nelle descrizioni delle voci (le vede il committente nel PDF).
create or replace function public.generale_numero_it(p_n numeric, p_decimali integer)
returns text
language sql
immutable
set search_path = public
as $$
  select rtrim(translate(to_char(round(p_n, p_decimali), 'FM999,999,999,990.' || repeat('9', greatest(p_decimali, 1))), ',.', '.,'), ',')
$$;
revoke all on function public.generale_numero_it(numeric, integer) from public, anon, authenticated;

-- Le voci cumulative fino al giorno p_al, figlia per figlia:
--   · un ordine prezzato dall'elenco (ha voci di computo o misure) va a misure:
--     una voce per voce d'elenco, quantità × prezzo (ribassato se soggetto);
--   · gli altri ad avanzamento: importo dell'ordine × % (quella proposta in
--     p_avanzamenti, altrimenti l'avanzamento dell'ordine);
--   · gli oneri della sicurezza nella stessa proporzione dei lavori.
create or replace function public.generale_sal_voci_calcola(p_generale_id uuid, p_al date, p_avanzamenti jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.generale_contratti%rowtype;
  v_voci jsonb := '[]'::jsonb;
  v_lavori numeric := 0;
  v_lavori_contratto numeric;
  v_pct numeric;
  v_ordine integer := 0;
  r record;
begin
  select * into c from public.generale_contratti where generale_id = p_generale_id;

  for r in
    with figlie as (
      select o.id, o.order_code, o.description, coalesce(o.total_amount, 0) as importo,
             coalesce(o.percentuale_avanzamento, 0) as avanzamento,
             exists (select 1 from public.generale_computo k where k.figlia_id = o.id and k.generale_id = p_generale_id)
               or exists (select 1 from public.generale_misure m where m.figlia_id = o.id and m.generale_id = p_generale_id) as a_misura
        from public.orders o
       where o.commessa_generale_id = p_generale_id and o.deleted_at is null
    )
    select f.*, coalesce(nullif(btrim(f.order_code), ''), f.description) as etichetta from figlie f
     order by f.order_code nulls last, f.description
  loop
    if r.a_misura then
      declare m record;
      begin
        for m in
          select e.id as voce_id, e.codice, e.descrizione, e.unita_misura,
                 round(e.prezzo * case when e.soggetto_ribasso then 1 - coalesce(c.ribasso_pct, 0) / 100 else 1 end, 4) as prezzo_netto,
                 e.prezzo * case when e.soggetto_ribasso then 1 - coalesce(c.ribasso_pct, 0) / 100 else 1 end as prezzo_esatto,
                 sum(x.quantita) as quantita
            from public.generale_misure x
            join public.generale_elenco_prezzi e on e.id = x.voce_id
           where x.generale_id = p_generale_id and x.figlia_id = r.id and x.data <= p_al
           group by e.id
          having sum(x.quantita) > 0
           order by e.posizione, e.codice nulls last, e.descrizione
        loop
          v_ordine := v_ordine + 1;
          v_voci := v_voci || jsonb_build_object(
            'ordine', v_ordine, 'tipo', 'misure', 'figlia_id', r.id, 'voce_id', m.voce_id,
            'descrizione', r.etichetta || ' · ' || coalesce(m.codice || ' ', '') || m.descrizione
                           || ' — ' || public.generale_numero_it(m.quantita, 3) || ' ' || m.unita_misura
                           || ' × ' || public.generale_numero_it(m.prezzo_netto, 4) || ' €',
            'importo_contrattuale', round(m.quantita * m.prezzo_esatto, 2),
            'percentuale', 100,
            'importo', round(m.quantita * m.prezzo_esatto, 2),
            'quantita', m.quantita, 'prezzo', m.prezzo_netto, 'unita', m.unita_misura);
          v_lavori := v_lavori + round(m.quantita * m.prezzo_esatto, 2);
        end loop;
      end;
    elsif r.importo > 0 then
      v_pct := least(100, greatest(0, round(coalesce((p_avanzamenti ->> r.id::text)::numeric, r.avanzamento), 2)));
      v_ordine := v_ordine + 1;
      v_voci := v_voci || jsonb_build_object(
        'ordine', v_ordine, 'tipo', 'avanzamento', 'figlia_id', r.id, 'voce_id', null,
        'descrizione', case when r.order_code is not null and r.description is not null
                            then r.order_code || ' · ' || r.description else r.etichetta end,
        'importo_contrattuale', r.importo, 'percentuale', v_pct,
        'importo', round(r.importo * v_pct / 100, 2),
        'quantita', null, 'prezzo', null, 'unita', null);
      v_lavori := v_lavori + round(r.importo * v_pct / 100, 2);
    end if;
  end loop;

  -- Gli oneri della sicurezza non si ribassano e si pagano in proporzione ai lavori.
  if coalesce(c.oneri_sicurezza, 0) > 0 then
    v_lavori_contratto := public.generale_contratto_valore(p_generale_id) - c.oneri_sicurezza;
    if v_lavori_contratto > 0 then
      v_pct := least(100, greatest(0, round(v_lavori / v_lavori_contratto * 100, 2)));
      v_ordine := v_ordine + 1;
      v_voci := v_voci || jsonb_build_object(
        'ordine', v_ordine, 'tipo', 'sicurezza', 'figlia_id', null, 'voce_id', null,
        'descrizione', 'Oneri della sicurezza (non soggetti a ribasso)',
        'importo_contrattuale', c.oneri_sicurezza, 'percentuale', v_pct,
        'importo', round(c.oneri_sicurezza * v_pct / 100, 2),
        'quantita', null, 'prezzo', null, 'unita', null);
    end if;
  end if;

  return jsonb_build_object(
    'voci', v_voci,
    'cumulativo', coalesce((select sum((x ->> 'importo')::numeric) from jsonb_array_elements(v_voci) x), 0));
end;
$$;
revoke all on function public.generale_sal_voci_calcola(uuid, date, jsonb) from public, anon, authenticated;

-- Dal cumulativo al netto: quota di questo SAL (lordo), ritenuta di garanzia,
-- recupero dell'anticipazione fino a esaurirla, netto. p_sal_id escluso dai
-- conti dei SAL già emessi (serve all'emissione di una bozza).
create or replace function public.generale_sal_soldi(p_generale_id uuid, p_numero integer, p_cumulativo numeric, p_sal_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.generale_contratti%rowtype;
  v_precedente numeric;
  v_lordo numeric;
  v_ritenuta_pct numeric;
  v_ritenuta numeric := 0;
  v_recupero_pct numeric;
  v_recuperato numeric;
  v_residuo numeric := 0;
  v_recupero numeric := 0;
begin
  select * into c from public.generale_contratti where generale_id = p_generale_id;
  select coalesce((
    select s.importo_totale from public.sal_records s
     where s.order_id = p_generale_id and s.id is distinct from p_sal_id and s.numero_sal < p_numero
       and s.stato in ('emesso', 'approvato', 'firmato')
     order by s.numero_sal desc limit 1), 0)
    into v_precedente;
  v_lordo := round(p_cumulativo - v_precedente, 2);
  v_ritenuta_pct := coalesce(c.ritenuta_pct, 0);
  v_recupero_pct := coalesce(c.anticipazione_pct, 0);

  select coalesce(sum(gs.recupero_anticipazione), 0) into v_recuperato
    from public.generale_sal gs
    join public.sal_records s on s.id = gs.sal_id
   where gs.generale_id = p_generale_id and gs.sal_id is distinct from p_sal_id
     and s.stato in ('emesso', 'approvato', 'firmato');
  v_residuo := greatest(0, coalesce(c.anticipazione_importo, 0) - v_recuperato);

  if v_lordo > 0 then
    v_ritenuta := round(v_lordo * v_ritenuta_pct / 100, 2);
    v_recupero := least(v_residuo, round(v_lordo * v_recupero_pct / 100, 2));
  end if;

  return jsonb_build_object(
    'numero', p_numero, 'cumulativo', p_cumulativo, 'precedente', v_precedente, 'lordo', v_lordo,
    'ritenuta_pct', v_ritenuta_pct, 'ritenuta', v_ritenuta,
    'recupero_pct', v_recupero_pct, 'recupero', v_recupero, 'anticipazione_residua', v_residuo,
    'netto', v_lordo - v_ritenuta - v_recupero);
end;
$$;
revoke all on function public.generale_sal_soldi(uuid, integer, numeric, uuid) from public, anon, authenticated;

-- Chi compone ed emette un SAL di contratto: chi modifica la generale e vede gli importi.
create or replace function public.generale_sal_controlla(p_generale_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_generale_id);
begin
  if auth.uid() is null or v_azienda is null
     or not public.puo_modificare_commessa(p_generale_id)
     or not public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_azienda) then
    raise exception 'Non hai il permesso di emettere SAL su questo contratto.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.generale_contratti c where c.generale_id = p_generale_id) then
    raise exception 'Prima compila il contratto: ritenuta e anticipazione si prendono da lì.' using errcode = '22023';
  end if;
  return v_azienda;
end;
$$;
revoke all on function public.generale_sal_controlla(uuid) from public, anon, authenticated;

-- Cosa uscirebbe, senza scrivere niente.
create or replace function public.generale_sal_anteprima(p_generale_id uuid, p_al date, p_avanzamenti jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_voci jsonb;
  v_numero integer;
begin
  perform public.generale_sal_controlla(p_generale_id);
  if p_al is null then
    raise exception 'Scegli fino a che giorno arriva il SAL.' using errcode = '22023';
  end if;
  v_voci := public.generale_sal_voci_calcola(p_generale_id, p_al, coalesce(p_avanzamenti, '{}'::jsonb));
  select coalesce(max(numero_sal), 0) + 1 into v_numero from public.sal_records where order_id = p_generale_id;
  return public.generale_sal_soldi(p_generale_id, v_numero, (v_voci ->> 'cumulativo')::numeric, null)
         || jsonb_build_object(
              'voci', v_voci -> 'voci',
              'ultimo_al', (select max(gs.periodo_al) from public.generale_sal gs where gs.generale_id = p_generale_id),
              'misure_nuove', (select count(*) from public.generale_misure m
                                 join public.orders o on o.id = m.figlia_id
                                where m.generale_id = p_generale_id and m.sal_id is null and m.data <= p_al
                                  and o.commessa_generale_id = p_generale_id and o.deleted_at is null));
end;
$$;
revoke all on function public.generale_sal_anteprima(uuid, date, jsonb) from public, anon;
grant execute on function public.generale_sal_anteprima(uuid, date, jsonb) to authenticated;

-- ── 12. Comporre, emettere, annullare ───────────────────────────────────────
create or replace function public.generale_sal_crea(
  p_generale_id uuid,
  p_dal date,
  p_al date,
  p_data date default current_date,
  p_avanzamenti jsonb default '{}'::jsonb,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.generale_sal_controlla(p_generale_id);
  v_calcolo jsonb;
  v_soldi jsonb;
  v_numero integer;
  v_sal uuid := gen_random_uuid();
  v_voce uuid;
  v_ultimo date;
  r record;
begin
  -- Un SAL alla volta per contratto: numero e misure non si contendono.
  perform pg_advisory_xact_lock(hashtextextended('generale-sal:' || p_generale_id::text, 0));

  if p_al is null then
    raise exception 'Scegli fino a che giorno arriva il SAL.' using errcode = '22023';
  end if;
  if p_dal is not null and p_dal > p_al then
    raise exception 'Il periodo del SAL comincia dopo la sua fine.' using errcode = '22023';
  end if;
  if exists (select 1 from public.sal_records s where s.order_id = p_generale_id and s.stato = 'bozza') then
    raise exception 'C''è già un SAL in bozza su questo contratto: emettilo o annullalo prima di comporne un altro.' using errcode = '22023';
  end if;
  select max(gs.periodo_al) into v_ultimo from public.generale_sal gs where gs.generale_id = p_generale_id;
  if v_ultimo is not null and p_al < v_ultimo then
    raise exception 'Il SAL precedente arriva al %: questo non può finire prima.', to_char(v_ultimo, 'DD/MM/YYYY') using errcode = '22023';
  end if;

  v_calcolo := public.generale_sal_voci_calcola(p_generale_id, p_al, coalesce(p_avanzamenti, '{}'::jsonb));
  if jsonb_array_length(v_calcolo -> 'voci') = 0 then
    raise exception 'Nessun lavoro da mettere nel SAL: servono ordini di lavoro con un importo o misure.' using errcode = '22023';
  end if;
  select coalesce(max(numero_sal), 0) + 1 into v_numero from public.sal_records where order_id = p_generale_id;
  v_soldi := public.generale_sal_soldi(p_generale_id, v_numero, (v_calcolo ->> 'cumulativo')::numeric, null);
  if (v_soldi ->> 'lordo')::numeric <= 0 then
    raise exception 'Dall''ultimo SAL non risulta lavoro nuovo: aggiorna avanzamenti o misure.' using errcode = '22023';
  end if;

  insert into public.sal_records (id, company_id, order_id, numero_sal, data_emissione, stato, importo_totale, note)
  values (v_sal, v_azienda, p_generale_id, v_numero, coalesce(p_data, current_date), 'bozza',
          (v_calcolo ->> 'cumulativo')::numeric, nullif(btrim(coalesce(p_note, '')), ''));

  for r in
    select * from jsonb_to_recordset(v_calcolo -> 'voci') as x(
      ordine integer, tipo text, figlia_id uuid, voce_id uuid, descrizione text,
      importo_contrattuale numeric, percentuale numeric, quantita numeric, prezzo numeric, unita text)
     order by ordine
  loop
    insert into public.sal_voci (sal_id, descrizione, importo_contrattuale, percentuale_avanzamento, created_at)
    values (v_sal, r.descrizione, r.importo_contrattuale, r.percentuale, clock_timestamp())
    returning id into v_voce;
    insert into public.generale_sal_voci (sal_voce_id, company_id, sal_id, figlia_id, voce_id, tipo, quantita, prezzo_netto, unita_misura)
    values (v_voce, v_azienda, v_sal, r.figlia_id, r.voce_id, r.tipo, r.quantita, r.prezzo, r.unita);
  end loop;

  insert into public.generale_sal (sal_id, company_id, generale_id, periodo_dal, periodo_al, cumulativo, precedente, lordo,
                                   ritenuta_pct, ritenuta, recupero_pct, recupero_anticipazione, netto)
  values (v_sal, v_azienda, p_generale_id, p_dal, p_al, (v_soldi ->> 'cumulativo')::numeric, (v_soldi ->> 'precedente')::numeric,
          (v_soldi ->> 'lordo')::numeric, (v_soldi ->> 'ritenuta_pct')::numeric, (v_soldi ->> 'ritenuta')::numeric,
          (v_soldi ->> 'recupero_pct')::numeric, (v_soldi ->> 'recupero')::numeric, (v_soldi ->> 'netto')::numeric);

  -- Le misure fino a quel giorno entrano nel SAL e da qui non si cambiano più.
  update public.generale_misure m
     set sal_id = v_sal, updated_at = now()
   where m.generale_id = p_generale_id and m.sal_id is null and m.data <= p_al
     and exists (select 1 from public.orders o
                  where o.id = m.figlia_id and o.commessa_generale_id = p_generale_id and o.deleted_at is null);
  return v_sal;
end;
$$;
revoke all on function public.generale_sal_crea(uuid, date, date, date, jsonb, text) from public, anon;
grant execute on function public.generale_sal_crea(uuid, date, date, date, jsonb, text) to authenticated;

-- La ritenuta di un SAL nel registro delle ritenute (Trattenute a te). Il
-- registro è fiscale: lo scrive solo chi può (gli amministratori).
create or replace function public.generale_sal_ritenuta_nel_registro(p_sal_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  gs public.generale_sal%rowtype;
  v_numero integer;
  v_codice text;
  v_committente text;
  v_id uuid;
begin
  select * into gs from public.generale_sal where sal_id = p_sal_id;
  if gs.ritenuta_registro_id is not null or coalesce(gs.ritenuta, 0) <= 0 then
    return gs.ritenuta_registro_id;
  end if;
  select s.numero_sal into v_numero from public.sal_records s where s.id = p_sal_id;
  select o.order_code, o.client_name into v_codice, v_committente from public.orders o where o.id = gs.generale_id;
  insert into public.ritenute_garanzia (company_id, order_id, direzione, controparte, importo, percentuale_applicata, stato, note)
  values (gs.company_id, gs.generale_id, 'attiva', v_committente, gs.ritenuta, gs.ritenuta_pct, 'trattenuta',
          format('Ritenuta di garanzia del SAL n. %s del contratto %s', v_numero, coalesce(v_codice, '')))
  returning id into v_id;
  update public.generale_sal set ritenuta_registro_id = v_id where sal_id = p_sal_id;
  return v_id;
end;
$$;
revoke all on function public.generale_sal_ritenuta_nel_registro(uuid) from public, anon, authenticated;

create or replace function public.generale_sal_emetti(p_sal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.sal_records%rowtype;
  c public.generale_contratti%rowtype;
  v_soldi jsonb;
  v_registro uuid;
begin
  select * into s from public.sal_records where id = p_sal_id;
  if not found or not exists (select 1 from public.generale_sal gs where gs.sal_id = p_sal_id) then
    raise exception 'SAL di contratto non trovato.' using errcode = 'P0002';
  end if;
  perform public.generale_sal_controlla(s.order_id);
  perform pg_advisory_xact_lock(hashtextextended('generale-sal:' || s.order_id::text, 0));
  select * into s from public.sal_records where id = p_sal_id for update;
  if s.stato <> 'bozza' then
    raise exception 'Questo SAL è già emesso.' using errcode = '22023';
  end if;
  if exists (select 1 from public.sal_records x where x.order_id = s.order_id and x.numero_sal > s.numero_sal
                and x.stato in ('emesso', 'approvato', 'firmato')) then
    raise exception 'Un SAL successivo è già emesso: questa bozza non si può emettere.' using errcode = '22023';
  end if;

  -- Ritenuta e anticipazione con le condizioni del contratto di adesso; i dati
  -- del contratto restano fotografati sul SAL.
  v_soldi := public.generale_sal_soldi(s.order_id, s.numero_sal, s.importo_totale, s.id);
  if (v_soldi ->> 'lordo')::numeric <= 0 then
    raise exception 'Rispetto all''ultimo SAL emesso questo non aggiunge lavoro: annullalo.' using errcode = '22023';
  end if;
  select * into c from public.generale_contratti where generale_id = s.order_id;
  update public.generale_sal
     set precedente = (v_soldi ->> 'precedente')::numeric, lordo = (v_soldi ->> 'lordo')::numeric,
         ritenuta_pct = (v_soldi ->> 'ritenuta_pct')::numeric, ritenuta = (v_soldi ->> 'ritenuta')::numeric,
         recupero_pct = (v_soldi ->> 'recupero_pct')::numeric, recupero_anticipazione = (v_soldi ->> 'recupero')::numeric,
         netto = (v_soldi ->> 'netto')::numeric,
         riferimento_contratto = c.riferimento, cig = c.cig, cup = c.cup,
         split_payment = c.split_payment, reverse_charge = c.reverse_charge
   where sal_id = p_sal_id;
  update public.sal_records set stato = 'emesso', data_emissione = current_date where id = p_sal_id;

  -- Nel registro delle ritenute se chi emette può scriverci; altrimenti resta
  -- da registrare (lo fa un amministratore con generale_sal_registra_ritenuta).
  begin
    v_registro := public.generale_sal_ritenuta_nel_registro(p_sal_id);
  exception when insufficient_privilege or raise_exception then
    v_registro := null;
  end;
  return v_soldi || jsonb_build_object('registro', v_registro);
end;
$$;
revoke all on function public.generale_sal_emetti(uuid) from public, anon;
grant execute on function public.generale_sal_emetti(uuid) to authenticated;

create or replace function public.generale_sal_registra_ritenuta(p_sal_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_generale uuid;
  v_stato text;
begin
  select gs.generale_id, s.stato into v_generale, v_stato
    from public.generale_sal gs join public.sal_records s on s.id = gs.sal_id
   where gs.sal_id = p_sal_id;
  if v_generale is null then
    raise exception 'SAL di contratto non trovato.' using errcode = 'P0002';
  end if;
  perform public.generale_sal_controlla(v_generale);
  if v_stato = 'bozza' then
    raise exception 'La ritenuta si registra quando il SAL è emesso.' using errcode = '22023';
  end if;
  return public.generale_sal_ritenuta_nel_registro(p_sal_id);
end;
$$;
revoke all on function public.generale_sal_registra_ritenuta(uuid) from public, anon;
grant execute on function public.generale_sal_registra_ritenuta(uuid) to authenticated;

-- Solo una bozza: le sue misure tornano libere (sal_id on delete set null).
create or replace function public.generale_sal_annulla(p_sal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_generale uuid;
begin
  select gs.generale_id into v_generale from public.generale_sal gs where gs.sal_id = p_sal_id;
  if v_generale is null then
    raise exception 'SAL di contratto non trovato.' using errcode = 'P0002';
  end if;
  perform public.generale_sal_controlla(v_generale);
  delete from public.sal_records where id = p_sal_id and stato = 'bozza';
  if not found then
    raise exception 'Si annulla solo un SAL in bozza.' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.generale_sal_annulla(uuid) from public, anon;
grant execute on function public.generale_sal_annulla(uuid) to authenticated;

-- ── 13. Un ordine di lavoro prezzato dall'elenco ────────────────────────────
-- Importo dell'ordine = Σ quantità × prezzo (ribassato se soggetto), voce per voce.
create or replace function public.generale_figlia_prezza(p_figlia_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_generale uuid;
  v_azienda uuid;
  v_importo numeric;
begin
  select o.commessa_generale_id, o.company_id into v_generale, v_azienda
    from public.orders o where o.id = p_figlia_id and o.deleted_at is null;
  if v_generale is null then
    raise exception 'Questa commessa non è dentro un contratto.' using errcode = 'P0002';
  end if;
  if auth.uid() is null or not public.puo_modificare_commessa(p_figlia_id)
     or not public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_azienda) then
    raise exception 'Non hai il permesso di cambiare l''importo di questa commessa.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.generale_computo k where k.figlia_id = p_figlia_id and k.generale_id = v_generale) then
    raise exception 'Aggiungi prima le voci dell''elenco prezzi a questo ordine.' using errcode = '22023';
  end if;
  select coalesce(sum(round(k.quantita * e.prezzo
                            * case when e.soggetto_ribasso then 1 - coalesce(c.ribasso_pct, 0) / 100 else 1 end, 2)), 0)
    into v_importo
    from public.generale_computo k
    join public.generale_elenco_prezzi e on e.id = k.voce_id
    left join public.generale_contratti c on c.generale_id = k.generale_id
   where k.figlia_id = p_figlia_id and k.generale_id = v_generale;
  update public.orders set total_amount = v_importo, updated_at = now() where id = p_figlia_id;
  return v_importo;
end;
$$;
revoke all on function public.generale_figlia_prezza(uuid) from public, anon;
grant execute on function public.generale_figlia_prezza(uuid) to authenticated;

-- ── 14. L'elenco prezzi incollato da Excel ──────────────────────────────────
-- Tutto o niente: una voce con un codice che c'è già si aggiorna, le altre si
-- aggiungono in coda. Il controllo delle righe lo fa prima l'anteprima nel browser.
create or replace function public.generale_elenco_importa(p_generale_id uuid, p_righe jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_generale_id);
  v_posizione integer;
  v_nuove integer := 0;
  v_aggiornate integer := 0;
  r record;
begin
  if auth.uid() is null or v_azienda is null
     or not public.puo_modificare_commessa(p_generale_id)
     or not public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_azienda) then
    raise exception 'Non hai il permesso di cambiare l''elenco prezzi.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.commesse_generali g where g.order_id = p_generale_id) then
    raise exception 'Commessa generale non trovata.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_righe) is distinct from 'array' or jsonb_array_length(p_righe) = 0 then
    raise exception 'Nessuna voce da importare.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_righe) > 5000 then
    raise exception 'Troppe voci in una volta: al massimo 5.000.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('generale-elenco:' || p_generale_id::text, 0));
  select coalesce(max(posizione), 0) into v_posizione from public.generale_elenco_prezzi where generale_id = p_generale_id;

  for r in
    select nullif(btrim(x.codice), '') as codice, btrim(x.descrizione) as descrizione,
           coalesce(btrim(x.unita_misura), '') as unita_misura, x.prezzo,
           coalesce(x.soggetto_ribasso, true) as soggetto_ribasso, x.quantita_contratto
      from jsonb_to_recordset(p_righe) as x(codice text, descrizione text, unita_misura text, prezzo numeric,
                                             soggetto_ribasso boolean, quantita_contratto numeric)
  loop
    if r.descrizione is null or r.descrizione = '' or r.prezzo is null or r.prezzo < 0 then
      raise exception 'Una voce non ha descrizione o prezzo valido%.', coalesce(' (' || r.codice || ')', '') using errcode = '22023';
    end if;
    if r.codice is not null then
      update public.generale_elenco_prezzi
         set descrizione = r.descrizione, unita_misura = r.unita_misura, prezzo = r.prezzo,
             soggetto_ribasso = r.soggetto_ribasso,
             quantita_contratto = coalesce(r.quantita_contratto, quantita_contratto)
       where generale_id = p_generale_id and codice = r.codice;
      if found then
        v_aggiornate := v_aggiornate + 1;
        continue;
      end if;
    end if;
    v_posizione := v_posizione + 1;
    insert into public.generale_elenco_prezzi (generale_id, company_id, codice, descrizione, unita_misura, prezzo,
                                               soggetto_ribasso, quantita_contratto, posizione)
    values (p_generale_id, v_azienda, r.codice, r.descrizione, r.unita_misura, r.prezzo,
            r.soggetto_ribasso, r.quantita_contratto, v_posizione);
    v_nuove := v_nuove + 1;
  end loop;
  return jsonb_build_object('nuove', v_nuove, 'aggiornate', v_aggiornate);
end;
$$;
revoke all on function public.generale_elenco_importa(uuid, jsonb) from public, anon;
grant execute on function public.generale_elenco_importa(uuid, jsonb) to authenticated;
