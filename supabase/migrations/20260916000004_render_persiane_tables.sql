-- ═══════════════════════════════════════════════════════════════════
-- Render Persiane — Tables, Indexes, RLS, Storage Buckets
-- 2026-04-09
-- ═══════════════════════════════════════════════════════════════════

-- ── Table: render_persiane_sessions ──────────────────────────────
create table if not exists public.render_persiane_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),

  -- Photo
  original_photo_url text,

  -- Config (full ConfigurazionePersiane JSON)
  config jsonb not null default '{}'::jsonb,

  -- Results
  result_urls text[] default '{}',

  -- Prompt tracing
  prompt_used text,
  prompt_version text,
  provider_key text,
  model_used text,

  -- Costs
  cost_real numeric(10, 4) default 0,
  cost_billed numeric(10, 4) default 0,

  -- Error handling
  error_message text,

  -- Timestamps
  processing_started_at timestamptz,
  processing_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Indexes ──────────────────────────────────────────────────────
create index if not exists idx_rps_company_id
  on public.render_persiane_sessions(company_id);
create index if not exists idx_rps_status
  on public.render_persiane_sessions(status);
create index if not exists idx_rps_created_at
  on public.render_persiane_sessions(created_at desc);
create index if not exists idx_rps_company_status
  on public.render_persiane_sessions(company_id, status);

-- ── RLS ──────────────────────────────────────────────────────────
alter table public.render_persiane_sessions enable row level security;

-- Users can read sessions from their own company
create policy "rps_select_own_company"
  on public.render_persiane_sessions
  for select
  using (
    company_id in (
      select p.company_id from public.profiles p where p.id = auth.uid()
    )
  );

-- Users can insert sessions for their own company
create policy "rps_insert_own_company"
  on public.render_persiane_sessions
  for insert
  with check (
    company_id in (
      select p.company_id from public.profiles p where p.id = auth.uid()
    )
  );

-- Users can update sessions from their own company
create policy "rps_update_own_company"
  on public.render_persiane_sessions
  for update
  using (
    company_id in (
      select p.company_id from public.profiles p where p.id = auth.uid()
    )
  );

-- Service role can do everything (for edge functions)
create policy "rps_service_role_all"
  on public.render_persiane_sessions
  for all
  using (auth.role() = 'service_role');

-- ── Updated_at trigger ───────────────────────────────────────────
create or replace function public.update_render_persiane_sessions_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_render_persiane_sessions_updated_at
  on public.render_persiane_sessions;

create trigger trg_render_persiane_sessions_updated_at
  before update on public.render_persiane_sessions
  for each row execute function public.update_render_persiane_sessions_updated_at();

-- ── Storage Buckets ──────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('persiane-originals', 'persiane-originals', false, 20971520, array['image/jpeg', 'image/png', 'image/webp']),
  ('persiane-results', 'persiane-results', true, 20971520, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Storage policies: persiane-originals (private)
create policy "persiane_originals_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'persiane-originals'
    and (storage.foldername(name))[1] in (
      select cast(p.company_id as text) from public.profiles p where p.id = auth.uid()
    )
  );

create policy "persiane_originals_select"
  on storage.objects for select
  using (
    bucket_id = 'persiane-originals'
    and (storage.foldername(name))[1] in (
      select cast(p.company_id as text) from public.profiles p where p.id = auth.uid()
    )
  );

-- Storage policies: persiane-results (public read)
create policy "persiane_results_select_public"
  on storage.objects for select
  using (bucket_id = 'persiane-results');

create policy "persiane_results_insert_service"
  on storage.objects for insert
  with check (
    bucket_id = 'persiane-results'
    and auth.role() = 'service_role'
  );
