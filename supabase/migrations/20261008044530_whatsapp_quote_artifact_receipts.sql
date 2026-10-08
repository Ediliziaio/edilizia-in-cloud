begin;
set local lock_timeout = '3s';

-- Internal immutable receipts, not an extra browser-writable PDF archive.
create table public.whatsapp_quote_artifacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  module text not null check (module = 'bagni'),
  project_id uuid not null references public.bgn_progetti(id),
  model_id text not null check (model_id in ('completo','vasca-doccia','doccia','sanitari','accessibilita','rinnovo')),
  project_revision text not null,
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  pdf_sha256 text not null check (pdf_sha256 ~ '^[a-f0-9]{64}$'),
  byte_length integer not null check (byte_length between 100 and 20971520),
  storage_path text not null unique,
  renderer_version text not null check (renderer_version = 'documento-edile-bgn-v1'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (company_id, module, project_id, fingerprint),
  check (storage_path = 'bagno/' || company_id::text || '/' || project_id::text || '/' || fingerprint || '-' || pdf_sha256 || '.pdf')
);
alter table public.whatsapp_quote_artifacts enable row level security;
revoke all on public.whatsapp_quote_artifacts from public, anon, authenticated, service_role;
grant select on public.whatsapp_quote_artifacts to service_role;

create function public.whatsapp_record_bathroom_artifact(p_company uuid, p_user uuid, p_project uuid,
  p_model text, p_revision text, p_fingerprint text, p_sha256 text, p_path text, p_bytes integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.whatsapp_quote_artifacts; roles text[];
begin
  if not public.ai_is_service_role() then raise exception 'service_required' using errcode='42501'; end if;
  roles := public.silvio_context_actor_roles(p_company,p_user);
  if not coalesce(roles && array['super_admin','company_admin','salesperson','company_staff']::text[],false) then
    raise exception 'actor_forbidden' using errcode='42501';
  end if;
  if not (roles && array['super_admin','company_admin','salesperson']::text[]) and not exists (
    select 1 from public.staff_permissions where company_id=p_company and user_id=p_user
      and can_view_preventivi is true and only_assigned is false and only_my_warehouse is false
  ) then raise exception 'actor_forbidden' using errcode='42501'; end if;
  -- Lock only the short receipt transaction, never during rendering or provider HTTP.
  perform 1 from public.bgn_progetti where id=p_project and company_id=p_company and deleted_at is null
    and updated_at=p_revision::timestamptz and modello_snapshot->>'modelId'=p_model for share;
  if not found then raise exception 'project_changed_or_forbidden'; end if;
  if not exists (select 1 from storage.objects where bucket_id='quote-pdfs' and name=p_path) then
    raise exception 'stored_document_missing';
  end if;
  insert into public.whatsapp_quote_artifacts(company_id,module,project_id,model_id,project_revision,
    fingerprint,pdf_sha256,storage_path,byte_length,renderer_version,created_by)
    values(p_company,'bagni',p_project,p_model,p_revision,p_fingerprint,p_sha256,p_path,p_bytes,'documento-edile-bgn-v1',p_user)
    on conflict(company_id,module,project_id,fingerprint) do nothing;
  select * into strict r from public.whatsapp_quote_artifacts
    where company_id=p_company and module='bagni' and project_id=p_project and fingerprint=p_fingerprint;
  if r.model_id<>p_model or r.project_revision<>p_revision then raise exception 'artifact_conflict'; end if;
  return to_jsonb(r);
end $$;
revoke all on function public.whatsapp_record_bathroom_artifact(uuid,uuid,uuid,text,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.whatsapp_record_bathroom_artifact(uuid,uuid,uuid,text,text,text,text,text,integer) to service_role;
commit;
