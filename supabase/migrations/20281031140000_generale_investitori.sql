-- ════════════════════════════════════════════════════════════════════════════
-- Commesse generali — Fonti e investitori (tappa 5)
-- ════════════════════════════════════════════════════════════════════════════
-- Piano: docs/superpowers/plans/2026-10-30-commesse-generali-appalti-sviluppi.md
-- (§2.2 Fonti e investitori, §3.2 F7, §4 tappa 5).
--
-- Chi mette i soldi in uno sviluppo o in una compravendita, e quanto gli spetta.
--
--   · generale_fonti            una riga per fonte: mezzi propri, investitore a
--     capitale (quota di utile), investitore a prestito (tasso, scadenza),
--     banca o mutuo. Con l'impegno preso e, per chi è a capitale, la quota fissa
--     di utile se è stata pattuita (vuota = pro quota del capitale e del tempo).
--   · generale_fonti_movimenti  versamenti (o erogazioni), rimborsi del
--     capitale, distribuzioni di utile e interessi pagati, con la data.
--   · generale_rendiconti       lo storico dei rendiconti PDF mandati per email
--     all'investitore. Li scrive SOLO la edge function generale-rendiconto-invia
--     (service role): dal browser si leggono e basta.
--
-- I conti (capitale versato, utile e interessi, quanto spetta) si fanno in
-- lettura nel browser (src/lib/orders/generali/investitoriConti.ts) a partire
-- dalla stima finale del piano economico: qui ci sono solo i fatti.
--
-- Sono dati sensibili: li vede e li scrive chi vede i margini dell'azienda
-- (can_view_margins), come il piano economico; per scriverli serve anche poter
-- modificare la commessa generale.
--
-- I PDF inviati stanno nel bucket privato generale-rendiconti, nella cartella
-- dell'azienda: non in order-attachments, che legge chiunque veda la commessa.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 1. Fonti ────────────────────────────────────────────────────────────────
create table if not exists public.generale_fonti (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  generale_id uuid not null references public.orders(id) on delete cascade,
  tipo text not null,
  nome text not null,
  soggetto text not null default 'persona',
  cliente_id uuid references public.profiles(id) on delete set null,
  email text,
  impegno numeric(14,2) not null default 0,
  quota_utile_pct numeric(6,3),
  tasso_pct numeric(6,3),
  data_inizio date,
  scadenza date,
  nota text,
  ordine integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generale_fonti_tipo check (tipo in ('propri', 'capitale', 'prestito', 'banca')),
  constraint generale_fonti_soggetto check (soggetto in ('persona', 'societa')),
  constraint generale_fonti_nome check (char_length(btrim(nome)) between 1 and 200),
  constraint generale_fonti_email check (email is null or (char_length(email) <= 254 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')),
  constraint generale_fonti_impegno check (impegno >= 0),
  constraint generale_fonti_quota check (quota_utile_pct is null or (quota_utile_pct >= 0 and quota_utile_pct <= 100)),
  constraint generale_fonti_tasso check (tasso_pct is null or (tasso_pct >= 0 and tasso_pct <= 100)),
  -- La quota di utile è solo di chi sta a capitale; il tasso solo di chi presta.
  constraint generale_fonti_quota_tipo check (quota_utile_pct is null or tipo in ('propri', 'capitale')),
  constraint generale_fonti_tasso_tipo check (tasso_pct is null or tipo in ('prestito', 'banca')),
  constraint generale_fonti_nota check (nota is null or char_length(nota) <= 2000)
);

comment on table public.generale_fonti is
  'Fonti di finanziamento di una commessa generale (sviluppo, compravendita): mezzi propri, investitori a capitale o a prestito, banca o mutuo.';
comment on column public.generale_fonti.impegno is
  'Quanto la fonte si è impegnata a mettere (o il mutuo deliberato). I versamenti veri sono in generale_fonti_movimenti.';
comment on column public.generale_fonti.quota_utile_pct is
  'Quota fissa dell''utile pattuita (0–100). Vuota = l''utile si divide pro quota del capitale versato e del tempo.';
comment on column public.generale_fonti.tasso_pct is
  'Tasso annuo semplice (prestito, banca): gli interessi maturano su ogni euro dal giorno del versamento a quello del rimborso.';

create index if not exists generale_fonti_generale_idx on public.generale_fonti (generale_id, ordine);
create index if not exists generale_fonti_company_idx on public.generale_fonti (company_id);
create index if not exists generale_fonti_cliente_idx on public.generale_fonti (cliente_id) where cliente_id is not null;

-- ── 2. Movimenti ────────────────────────────────────────────────────────────
create table if not exists public.generale_fonti_movimenti (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  generale_id uuid not null references public.orders(id) on delete cascade,
  fonte_id uuid not null references public.generale_fonti(id) on delete cascade,
  tipo text not null,
  data date not null,
  importo numeric(14,2) not null,
  nota text,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint generale_fonti_movimenti_tipo check (tipo in ('versamento', 'rimborso', 'distribuzione', 'interessi')),
  constraint generale_fonti_movimenti_importo check (importo > 0),
  constraint generale_fonti_movimenti_nota check (nota is null or char_length(nota) <= 500)
);

comment on table public.generale_fonti_movimenti is
  'Versamenti (o erogazioni del mutuo), rimborsi del capitale, distribuzioni di utile e interessi pagati di una fonte di finanziamento.';

create index if not exists generale_fonti_movimenti_fonte_idx on public.generale_fonti_movimenti (fonte_id, data);
create index if not exists generale_fonti_movimenti_company_idx on public.generale_fonti_movimenti (company_id);
create index if not exists generale_fonti_movimenti_generale_idx on public.generale_fonti_movimenti (generale_id);

-- ── 3. Rendiconti inviati ───────────────────────────────────────────────────
create table if not exists public.generale_rendiconti (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  generale_id uuid not null references public.orders(id) on delete cascade,
  fonte_id uuid references public.generale_fonti(id) on delete set null,
  fonte_nome text not null,
  destinatario text not null,
  oggetto text not null,
  messaggio text,
  stato text not null default 'in_invio',
  errore text,
  pdf_path text,
  numeri jsonb not null default '{}'::jsonb,
  delivery_log_id uuid,
  inviato_da uuid,
  created_at timestamptz not null default now(),
  inviato_at timestamptz,
  constraint generale_rendiconti_stato check (stato in ('in_invio', 'inviato', 'fallito'))
);

comment on table public.generale_rendiconti is
  'Rendiconti PDF mandati per email a un investitore di una commessa generale, con i numeri del giorno (numeri) e il file (bucket generale-rendiconti).';

create index if not exists generale_rendiconti_generale_idx on public.generale_rendiconti (generale_id, created_at desc);
create index if not exists generale_rendiconti_fonte_idx on public.generale_rendiconti (fonte_id) where fonte_id is not null;
create index if not exists generale_rendiconti_company_idx on public.generale_rendiconti (company_id);

-- ── 4. Coerenza: azienda e generale si prendono dalla generale (o dalla fonte) ─
create or replace function public.generale_fonti_coerente()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_azienda uuid;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.generale_id is distinct from old.generale_id then
    raise exception 'Una fonte non si sposta da una commessa generale all''altra.' using errcode = '22023';
  end if;
  select g.company_id into v_azienda from public.commesse_generali g where g.order_id = new.generale_id;
  if not found then
    raise exception 'Commessa generale non trovata.' using errcode = 'P0002';
  end if;
  new.company_id := v_azienda;
  new.nome := btrim(new.nome);
  new.email := nullif(btrim(lower(coalesce(new.email, ''))), '');
  if new.tipo not in ('propri', 'capitale') then
    new.quota_utile_pct := null;
  end if;
  if new.tipo not in ('prestito', 'banca') then
    new.tasso_pct := null;
    new.scadenza := null;
  end if;
  if new.scadenza is not null and new.data_inizio is not null and new.scadenza < new.data_inizio then
    raise exception 'La scadenza viene prima dell''inizio: controlla le date.' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists generale_fonti_coerente on public.generale_fonti;
create trigger generale_fonti_coerente
  before insert or update on public.generale_fonti
  for each row execute function public.generale_fonti_coerente();

create or replace function public.generale_fonti_movimenti_coerente()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  f record;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.fonte_id is distinct from old.fonte_id then
    raise exception 'Un movimento non si sposta da una fonte all''altra.' using errcode = '22023';
  end if;
  select x.company_id, x.generale_id, x.tipo into f from public.generale_fonti x where x.id = new.fonte_id;
  if not found then
    raise exception 'Fonte non trovata.' using errcode = 'P0002';
  end if;
  new.company_id := f.company_id;
  new.generale_id := f.generale_id;
  if new.tipo = 'interessi' and f.tipo not in ('prestito', 'banca') then
    raise exception 'Gli interessi si pagano a chi presta: a chi sta a capitale si distribuisce l''utile.' using errcode = '22023';
  end if;
  if new.tipo = 'distribuzione' and f.tipo not in ('propri', 'capitale') then
    raise exception 'L''utile si distribuisce a chi sta a capitale: a chi presta si pagano gli interessi.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists generale_fonti_movimenti_coerente on public.generale_fonti_movimenti;
create trigger generale_fonti_movimenti_coerente
  before insert or update on public.generale_fonti_movimenti
  for each row execute function public.generale_fonti_movimenti_coerente();

-- Le funzioni di trigger non hanno bisogno di EXECUTE (CLAUDE.md, «Funzioni esposte ad anon»).
revoke all on function public.generale_fonti_coerente() from public, anon, authenticated;
revoke all on function public.generale_fonti_movimenti_coerente() from public, anon, authenticated;

-- ── 5. Permessi: chi vede i margini; per scrivere anche chi modifica la generale ─
alter table public.generale_fonti enable row level security;
alter table public.generale_fonti_movimenti enable row level security;
alter table public.generale_rendiconti enable row level security;

revoke all on public.generale_fonti, public.generale_fonti_movimenti, public.generale_rendiconti from anon, authenticated;
grant select, insert, update, delete on public.generale_fonti to authenticated;
grant select, insert, update, delete on public.generale_fonti_movimenti to authenticated;
grant select on public.generale_rendiconti to authenticated;

drop policy if exists generale_fonti_lettura on public.generale_fonti;
create policy generale_fonti_lettura on public.generale_fonti for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_margins', company_id));

-- company_id lo scrive il trigger dalla generale (le policy guardano la riga dopo il trigger).
drop policy if exists generale_fonti_inserimento on public.generale_fonti;
create policy generale_fonti_inserimento on public.generale_fonti for insert to authenticated
  with check (public.puo_modificare_commessa(generale_id)
              and public.has_permission_for_company((select auth.uid()), 'can_view_margins', company_id));

drop policy if exists generale_fonti_modifica on public.generale_fonti;
create policy generale_fonti_modifica on public.generale_fonti for update to authenticated
  using (public.puo_modificare_commessa(generale_id)
         and public.has_permission_for_company((select auth.uid()), 'can_view_margins', company_id))
  with check (public.puo_modificare_commessa(generale_id)
              and public.has_permission_for_company((select auth.uid()), 'can_view_margins', company_id));

drop policy if exists generale_fonti_elimina on public.generale_fonti;
create policy generale_fonti_elimina on public.generale_fonti for delete to authenticated
  using (public.puo_modificare_commessa(generale_id)
         and public.has_permission_for_company((select auth.uid()), 'can_view_margins', company_id));

drop policy if exists generale_fonti_movimenti_lettura on public.generale_fonti_movimenti;
create policy generale_fonti_movimenti_lettura on public.generale_fonti_movimenti for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_margins', company_id));

drop policy if exists generale_fonti_movimenti_inserimento on public.generale_fonti_movimenti;
create policy generale_fonti_movimenti_inserimento on public.generale_fonti_movimenti for insert to authenticated
  with check (public.puo_modificare_commessa(generale_id)
              and public.has_permission_for_company((select auth.uid()), 'can_view_margins', company_id));

drop policy if exists generale_fonti_movimenti_modifica on public.generale_fonti_movimenti;
create policy generale_fonti_movimenti_modifica on public.generale_fonti_movimenti for update to authenticated
  using (public.puo_modificare_commessa(generale_id)
         and public.has_permission_for_company((select auth.uid()), 'can_view_margins', company_id))
  with check (public.puo_modificare_commessa(generale_id)
              and public.has_permission_for_company((select auth.uid()), 'can_view_margins', company_id));

drop policy if exists generale_fonti_movimenti_elimina on public.generale_fonti_movimenti;
create policy generale_fonti_movimenti_elimina on public.generale_fonti_movimenti for delete to authenticated
  using (public.puo_modificare_commessa(generale_id)
         and public.has_permission_for_company((select auth.uid()), 'can_view_margins', company_id));

drop policy if exists generale_rendiconti_lettura on public.generale_rendiconti;
create policy generale_rendiconti_lettura on public.generale_rendiconti for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_margins', company_id));

-- ── 6. Bucket privato dei PDF inviati: <company_id>/<generale_id>/<rendiconto>.pdf ─
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('generale-rendiconti', 'generale-rendiconti', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

-- Si scrive solo dalla edge function (service role); si legge con il permesso dei margini.
drop policy if exists generale_rendiconti_pdf_lettura on storage.objects;
create policy generale_rendiconti_pdf_lettura on storage.objects for select to authenticated
  using (bucket_id = 'generale-rendiconti'
         -- Senza cast: un nome di cartella che non è un uuid non fa cadere la lettura, non trova e basta.
         and exists (select 1 from public.companies c
                      where c.id::text = (storage.foldername(name))[1]
                        and public.has_permission_for_company((select auth.uid()), 'can_view_margins', c.id)));
