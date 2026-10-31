-- ════════════════════════════════════════════════════════════════════════════
-- Silvio crea la commessa, fase 0, lotto 0.3: il registro delle correzioni
-- ════════════════════════════════════════════════════════════════════════════
-- Ogni volta che nel popup una persona tiene, cambia o toglie un valore proposto
-- da Silvio resta una riga: valore proposto, valore tenuto, area e chiave del
-- registro (shared/silvio-commessa/registro.ts), fonte. È la misura della
-- qualità di Silvio (fase 3: quota tenuta così, sopra l'85 %) e la materia
-- prima per farlo imparare (fase 6). Vedi docs/piano-silvio-commessa-ai.md.
--
-- Registro a sola aggiunta: chi lavora sulla commessa scrive e legge, nessuno
-- modifica o cancella (se ne va con l'azienda o con la commessa, in cascata).
-- `bozza_id` punta a commessa_bozze, che nasce nel lotto 1.4: la chiave esterna
-- arriva con quella tabella.
--
-- Scrive il client: src/lib/silvio-commessa/correzioni.ts.
-- Idempotente. Nessun dato esistente viene toccato.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create table if not exists public.silvio_correzioni (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  bozza_id uuid,
  area text not null,
  chiave text not null,
  valore_proposto jsonb,
  valore_tenuto jsonb,
  -- true = la persona ha tenuto la proposta così com'era.
  tenuto_cosi boolean generated always as (valore_proposto is not distinct from valore_tenuto) stored,
  fonte_tipo text,
  -- La Fonte intera del piano (etichetta, id, dove, citazione), per rileggere il perché.
  fonte jsonb,
  user_id uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint silvio_correzioni_commessa_o_bozza check (order_id is not null or bozza_id is not null),
  constraint silvio_correzioni_area check (area in (
    'identita', 'cliente', 'cantiere', 'economia', 'pagamenti', 'fasi', 'persone',
    'ditte', 'costi', 'mezzi', 'materiali', 'sicurezza', 'sal_scadenze', 'comunicazione')),
  constraint silvio_correzioni_chiave check (chiave like area || '.%'),
  constraint silvio_correzioni_fonte_tipo check (fonte_tipo is null or fonte_tipo in (
    'persona', 'contratto', 'preventivo', 'computo', 'offerta', 'sopralluogo',
    'documento', 'testo', 'modello', 'stima'))
);

create index if not exists silvio_correzioni_azienda_idx on public.silvio_correzioni (company_id, created_at desc);
create index if not exists silvio_correzioni_commessa_idx on public.silvio_correzioni (order_id) where order_id is not null;
create index if not exists silvio_correzioni_bozza_idx on public.silvio_correzioni (bozza_id) where bozza_id is not null;
create index if not exists silvio_correzioni_chiave_idx on public.silvio_correzioni (company_id, chiave);

comment on table public.silvio_correzioni is
  'Ogni valore proposto da Silvio nel popup della commessa e quello che la persona ha tenuto. Sola aggiunta. Misura la qualità di Silvio (tenuto_cosi) e lo fa imparare. Vedi docs/piano-silvio-commessa-ai.md, lotto 0.3.';

alter table public.silvio_correzioni enable row level security;
revoke all on public.silvio_correzioni from public, anon, authenticated;
grant select, insert on public.silvio_correzioni to authenticated;
grant all on public.silvio_correzioni to service_role;

drop policy if exists silvio_correzioni_lettura on public.silvio_correzioni;
create policy silvio_correzioni_lettura on public.silvio_correzioni for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id));

-- Scrive solo chi può modificare le commesse, a proprio nome, su una commessa della
-- stessa azienda.
drop policy if exists silvio_correzioni_scrittura on public.silvio_correzioni;
create policy silvio_correzioni_scrittura on public.silvio_correzioni for insert to authenticated
  with check (
    public.has_permission_for_company((select auth.uid()), 'can_edit_orders', company_id)
    and user_id = (select auth.uid())
    and (order_id is null or exists (
      select 1 from public.orders o where o.id = silvio_correzioni.order_id and o.company_id = silvio_correzioni.company_id))
  );
