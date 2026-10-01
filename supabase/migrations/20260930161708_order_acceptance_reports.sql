-- The operational report is not a declaration of conformity or a client signature.
-- Writes go through the authenticated collaudo-commessa endpoint, never the browser.
create table public.order_acceptance_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  order_id uuid not null references public.orders(id),
  created_by uuid not null references auth.users(id),
  content jsonb not null check (jsonb_typeof(content) = 'object' and octet_length(content::text) < 100000),
  status text not null default 'draft' check (status in ('draft','finalized')),
  version integer not null default 1 check (version > 0),
  pdf_path text,
  document_hash text check (document_hash ~ '^[a-f0-9]{64}$'),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((pdf_path is null) = (document_hash is null)),
  check (pdf_path is null or pdf_path like company_id::text || '/' || order_id::text || '/' || id::text || '/%.pdf'),
  check ((status = 'draft' and finalized_at is null) or
         (status = 'finalized' and finalized_at is not null and pdf_path is not null))
);
create index order_acceptance_reports_order_idx on public.order_acceptance_reports(order_id, created_at desc);
create index order_acceptance_reports_company_idx on public.order_acceptance_reports(company_id);
create index order_acceptance_reports_creator_idx on public.order_acceptance_reports(created_by);
alter table public.order_acceptance_reports enable row level security;
revoke all on public.order_acceptance_reports from anon, authenticated;
grant select on public.order_acceptance_reports to authenticated;
grant all on public.order_acceptance_reports to service_role;
create policy acceptance_read on public.order_acceptance_reports for select to authenticated
using (
  not (select public.utente_bloccato())
  and public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
  and exists (select 1 from public.orders o where o.id = order_id and o.company_id = order_acceptance_reports.company_id)
);

create function public.guard_order_acceptance_report() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    if old.status = 'finalized' then
      raise exception 'Verbale congelato: crea una nuova edizione senza sovrascrivere la precedente';
    end if;
    if tg_op = 'DELETE' then return old; end if;
    if (new.id, new.company_id, new.order_id, new.created_by, new.created_at)
       is distinct from (old.id, old.company_id, old.order_id, old.created_by, old.created_at) then
      raise exception 'Identità del verbale non modificabile';
    end if;
    new.version := old.version + 1;
    new.updated_at := clock_timestamp();
    if new.content is distinct from old.content then
      if new.status <> 'draft' then raise exception 'Salva e verifica il contenuto prima di congelarlo'; end if;
      new.pdf_path := null;
      new.document_hash := null;
    end if;
  end if;
  if not exists (select 1 from public.orders o where o.id = new.order_id and o.company_id = new.company_id) then
    raise exception 'Commessa e azienda non corrispondono';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_order_acceptance_report() from public;
create trigger guard_order_acceptance_report before insert or update or delete
on public.order_acceptance_reports for each row execute function public.guard_order_acceptance_report();

-- No public access or authenticated write policy. The endpoint authorizes every download.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('order-acceptance-reports','order-acceptance-reports',false,10485760,array['application/pdf']);
-- Guard against unrelated permissive storage policies that may exist in this project.
create policy acceptance_storage_server_only on storage.objects as restrictive
for all to anon, authenticated using (bucket_id <> 'order-acceptance-reports')
with check (bucket_id <> 'order-acceptance-reports');
