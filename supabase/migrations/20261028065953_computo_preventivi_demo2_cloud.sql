create table public.computo_preventivo_drafts (
  id uuid not null,
  company_id uuid not null references public.companies(id),
  created_by uuid not null default auth.uid() references auth.users(id),
  revision bigint not null default 1 check (revision > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload @> '{"versione":1}'::jsonb
    and payload ? 'voci' and payload ? 'allegati' and jsonb_typeof(payload->'allegati') = 'array'
    and jsonb_array_length(payload->'allegati') <= 20 and jsonb_array_length(payload->'voci') <= 5000
    and octet_length(payload::text) <= 6291456),
  title text generated always as (payload->>'titolo') stored,
  client_name text generated always as (payload->>'committente') stored,
  items_count integer generated always as (jsonb_array_length(payload->'voci')) stored,
  updated_at timestamptz not null default now(),
  primary key (company_id, id),
  constraint computo_demo2_only check (company_id = 'd2000000-0000-4000-a000-000000000002'::uuid)
);
create index computo_drafts_updated on public.computo_preventivo_drafts(company_id, updated_at desc);
alter table public.computo_preventivo_drafts enable row level security;
revoke all on public.computo_preventivo_drafts from public, anon, authenticated;
grant select, insert on public.computo_preventivo_drafts to authenticated;
grant update (payload, revision) on public.computo_preventivo_drafts to authenticated;
grant all on public.computo_preventivo_drafts to service_role;

create policy computo_drafts_read on public.computo_preventivo_drafts for select to authenticated using (
  company_id = 'd2000000-0000-4000-a000-000000000002'::uuid and not (select public.utente_bloccato()) and
  ((select public.has_role(auth.uid(), 'super_admin')) or
   (company_id in (select unnest(public.aziende_con_permesso('can_view_preventivi'))) and public.check_staff_visibility(auth.uid(), created_by)))
);
create policy computo_drafts_insert on public.computo_preventivo_drafts for insert to authenticated with check (
  created_by = (select auth.uid()) and company_id = 'd2000000-0000-4000-a000-000000000002'::uuid and not (select public.utente_bloccato()) and
  ((select public.has_role(auth.uid(), 'super_admin')) or company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi'))))
);
create policy computo_drafts_update on public.computo_preventivo_drafts for update to authenticated using (
  company_id = 'd2000000-0000-4000-a000-000000000002'::uuid and not (select public.utente_bloccato()) and
  ((select public.has_role(auth.uid(), 'super_admin')) or
   (company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi'))) and public.check_staff_visibility(auth.uid(), created_by)))
) with check (
  company_id = 'd2000000-0000-4000-a000-000000000002'::uuid and not (select public.utente_bloccato()) and
  ((select public.has_role(auth.uid(), 'super_admin')) or company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi'))))
);
create function public.computo_draft_revision_guard() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.revision <> old.revision + 1 then raise exception 'Invalid computo revision'; end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.computo_draft_revision_guard() from public, anon, authenticated;
create trigger computo_draft_revision before update on public.computo_preventivo_drafts
  for each row execute function public.computo_draft_revision_guard();

-- Namespace nuovo nel bucket privato esistente: nessun file preesistente cambia.
create policy computo_files_read on storage.objects for select to authenticated using (
  bucket_id = 'quote-materials' and (storage.foldername(name))[2] = 'computo-preventivi' and
  exists (select 1 from public.computo_preventivo_drafts d where d.company_id::text = (storage.foldername(name))[1]
    and d.id::text = (storage.foldername(name))[3]
    and exists (select 1 from jsonb_array_elements(d.payload->'allegati') a where lower(a->>'id') = storage.filename(name)))
);
create policy computo_files_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'quote-materials' and name ~ '^d2000000-0000-4000-a000-000000000002/computo-preventivi/[0-9a-f-]{36}/[0-9a-f-]{36}$'
  and not (select public.utente_bloccato()) and
  ((select public.has_role(auth.uid(), 'super_admin')) or 'd2000000-0000-4000-a000-000000000002'::uuid in (select unnest(public.aziende_con_permesso('can_edit_preventivi'))))
);
-- Protezione restrittiva: anche eventuali altre policy permissive non aprono questo namespace.
create policy computo_files_read_guard on storage.objects as restrictive for select to authenticated using (
  not (bucket_id = 'quote-materials' and (storage.foldername(name))[2] = 'computo-preventivi') or
  exists (select 1 from public.computo_preventivo_drafts d where d.company_id::text = (storage.foldername(name))[1]
    and d.id::text = (storage.foldername(name))[3]
    and exists (select 1 from jsonb_array_elements(d.payload->'allegati') a where lower(a->>'id') = storage.filename(name)))
);
create policy computo_files_insert_guard on storage.objects as restrictive for insert to authenticated with check (
  not (bucket_id = 'quote-materials' and (storage.foldername(name))[2] = 'computo-preventivi') or
  (name ~ '^d2000000-0000-4000-a000-000000000002/computo-preventivi/[0-9a-f-]{36}/[0-9a-f-]{36}$'
   and not (select public.utente_bloccato()) and
   ((select public.has_role(auth.uid(), 'super_admin')) or 'd2000000-0000-4000-a000-000000000002'::uuid in (select unnest(public.aziende_con_permesso('can_edit_preventivi')))))
);
create policy computo_files_immutable on storage.objects as restrictive for update to public using (
  not (bucket_id = 'quote-materials' and (storage.foldername(name))[2] = 'computo-preventivi')
) with check (not (bucket_id = 'quote-materials' and (storage.foldername(name))[2] = 'computo-preventivi'));
create policy computo_files_preserve on storage.objects as restrictive for delete to public using (
  not (bucket_id = 'quote-materials' and (storage.foldername(name))[2] = 'computo-preventivi')
);
create policy computo_files_anon_read on storage.objects as restrictive for select to anon using (
  not (bucket_id = 'quote-materials' and (storage.foldername(name))[2] = 'computo-preventivi')
);
create policy computo_files_anon_insert on storage.objects as restrictive for insert to anon with check (
  not (bucket_id = 'quote-materials' and (storage.foldername(name))[2] = 'computo-preventivi')
);
