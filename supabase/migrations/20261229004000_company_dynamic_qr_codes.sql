-- Dynamic QR codes for CRM / operations.
-- Adds tenant-scoped QR management plus public scan logs without touching warehouse barcode flows.

create table if not exists public.company_qr_codes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  qr_type text not null default 'url'
    check (qr_type in ('url', 'cliente', 'contatto', 'ordine', 'cantiere', 'materiale', 'documento', 'ticket', 'appuntamento')),
  destination_url text not null,
  linked_entity_type text
    check (linked_entity_type is null or linked_entity_type in ('customer', 'contact', 'order', 'job', 'stock_item', 'document', 'ticket', 'appointment')),
  linked_entity_id uuid,
  public_token text not null unique,
  access_level text not null default 'public'
    check (access_level in ('public', 'private')),
  status text not null default 'active'
    check (status in ('active', 'inactive', 'archived')),
  expires_at timestamptz,
  scan_count integer not null default 0,
  last_scanned_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.company_qr_scan_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  qr_code_id uuid not null references public.company_qr_codes(id) on delete cascade,
  scanned_at timestamptz not null default now(),
  scan_status text not null default 'opened'
    check (scan_status in ('opened', 'inactive', 'expired', 'archived', 'private_denied', 'error')),
  user_id uuid references auth.users(id) on delete set null,
  user_agent text,
  referrer text,
  device_info jsonb,
  ip_hash text
);

create index if not exists idx_company_qr_codes_company_status
  on public.company_qr_codes(company_id, status, created_at desc);

create index if not exists idx_company_qr_codes_company_type
  on public.company_qr_codes(company_id, qr_type, created_at desc);

create index if not exists idx_company_qr_codes_token
  on public.company_qr_codes(public_token);

create index if not exists idx_company_qr_scan_logs_company_date
  on public.company_qr_scan_logs(company_id, scanned_at desc);

create index if not exists idx_company_qr_scan_logs_qr_date
  on public.company_qr_scan_logs(qr_code_id, scanned_at desc);

alter table public.company_qr_codes enable row level security;
alter table public.company_qr_scan_logs enable row level security;

drop policy if exists "company_qr_codes_company_access" on public.company_qr_codes;
create policy "company_qr_codes_company_access"
  on public.company_qr_codes for all
  using (
    company_id in (
      select company_id from public.profiles where id = auth.uid()
      union
      select company_id from public.multi_company_access where user_id = auth.uid()
    )
  )
  with check (
    company_id in (
      select company_id from public.profiles where id = auth.uid()
      union
      select company_id from public.multi_company_access where user_id = auth.uid()
    )
  );

drop policy if exists "company_qr_codes_public_token_read" on public.company_qr_codes;
create policy "company_qr_codes_public_token_read"
  on public.company_qr_codes for select
  using (
    access_level = 'public'
    and status = 'active'
    and (expires_at is null or expires_at > now())
  );

drop policy if exists "company_qr_scan_logs_company_read" on public.company_qr_scan_logs;
create policy "company_qr_scan_logs_company_read"
  on public.company_qr_scan_logs for select
  using (
    company_id in (
      select company_id from public.profiles where id = auth.uid()
      union
      select company_id from public.multi_company_access where user_id = auth.uid()
    )
  );

drop policy if exists "company_qr_scan_logs_company_insert" on public.company_qr_scan_logs;
create policy "company_qr_scan_logs_company_insert"
  on public.company_qr_scan_logs for insert
  with check (
    company_id in (
      select company_id from public.profiles where id = auth.uid()
      union
      select company_id from public.multi_company_access where user_id = auth.uid()
    )
  );

drop policy if exists "company_qr_scan_logs_public_insert" on public.company_qr_scan_logs;
create policy "company_qr_scan_logs_public_insert"
  on public.company_qr_scan_logs for insert
  with check (
    exists (
      select 1
      from public.company_qr_codes q
      where q.id = qr_code_id
        and q.company_id = company_qr_scan_logs.company_id
        and q.access_level = 'public'
        and q.status = 'active'
        and (q.expires_at is null or q.expires_at > now())
    )
  );

create or replace function public.company_qr_codes_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  if new.status = 'archived' and old.status is distinct from 'archived' then
    new.archived_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_company_qr_codes_updated_at on public.company_qr_codes;
create trigger trg_company_qr_codes_updated_at
  before update on public.company_qr_codes
  for each row execute function public.company_qr_codes_set_updated_at();

create or replace function public.company_qr_scan_rollup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.scan_status = 'opened' then
    update public.company_qr_codes
      set scan_count = scan_count + 1,
          last_scanned_at = greatest(coalesce(last_scanned_at, new.scanned_at), new.scanned_at)
      where id = new.qr_code_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_company_qr_scan_rollup on public.company_qr_scan_logs;
create trigger trg_company_qr_scan_rollup
  after insert on public.company_qr_scan_logs
  for each row execute function public.company_qr_scan_rollup();

comment on table public.company_qr_codes is
  'Dynamic QR codes for CRM, orders, jobs, documents, tickets and operational links.';

comment on table public.company_qr_scan_logs is
  'Scan audit log for dynamic QR codes. Stores minimal device metadata and no raw personal data by default.';
