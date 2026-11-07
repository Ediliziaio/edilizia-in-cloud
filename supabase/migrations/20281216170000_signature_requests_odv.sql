-- Firma elettronica avanzata (FEA, con codice OTP) per i lavori extra e le varianti (06/11/2026).
-- `tipo_documento` ammetteva già 'odv', ma nessuna colonna legava la richiesta di firma alla variante:
-- alla firma non si sapeva quale variante approvare. Qui la colonna, come fv_progetto_id per il
-- fotovoltaico. Additiva e idempotente: non tocca i tipi documento esistenti né le firme già fatte.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.signature_requests
  add column if not exists odv_id uuid references public.ordini_variazione(id) on delete set null;

create index if not exists idx_signature_requests_odv
  on public.signature_requests(odv_id) where odv_id is not null;
create index if not exists idx_signature_requests_company_odv
  on public.signature_requests(company_id, odv_id) where odv_id is not null;

-- Dalla firma all'approvazione: il trigger della variante crea la fase nelle Lavorazioni, come
-- per la firma su carta. Solo il service role (le edge function della firma), mai dal browser.
create or replace function public.odv_approva_da_firma_fea(p_request uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare r public.signature_requests; v public.ordini_variazione;
begin
  select * into r from public.signature_requests where id = p_request;
  if not found or r.odv_id is null or r.tipo_documento <> 'odv' then return false; end if;
  if r.status <> 'signed' or r.signed_at is null then return false; end if;
  select * into v from public.ordini_variazione where id = r.odv_id and company_id = r.company_id for update;
  if not found then return false; end if;
  if v.status = 'approvato' then return true; end if;
  if v.status <> 'in_attesa' then return false; end if;
  update public.ordini_variazione
     set status = 'approvato', approval_channel = 'online',
         firmato_da = coalesce(nullif(btrim(r.signer_name), ''), firmato_da),
         firmato_il = coalesce(r.signed_at, now()),
         approval_recorded_at = now(),
         approved_document_hash = coalesce(r.documento_hash_firma, r.documento_hash, approved_document_hash),
         link_revoked_at = coalesce(link_revoked_at, now())
   where id = v.id;
  return true;
end;
$$;
revoke all on function public.odv_approva_da_firma_fea(uuid) from public, anon, authenticated;
grant execute on function public.odv_approva_da_firma_fea(uuid) to service_role;

-- Rifiuto dal link: la variante resta fuori dal contratto e non crea lavorazioni.
create or replace function public.odv_rifiuta_da_firma_fea(p_request uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare r public.signature_requests; v public.ordini_variazione;
begin
  select * into r from public.signature_requests where id = p_request;
  if not found or r.odv_id is null or r.tipo_documento <> 'odv' then return false; end if;
  if r.status <> 'refused' then return false; end if;
  select * into v from public.ordini_variazione where id = r.odv_id and company_id = r.company_id for update;
  if not found or v.status <> 'in_attesa' then return false; end if;
  update public.ordini_variazione
     set status = 'rifiutato', link_revoked_at = coalesce(link_revoked_at, now())
   where id = v.id;
  return true;
end;
$$;
revoke all on function public.odv_rifiuta_da_firma_fea(uuid) from public, anon, authenticated;
grant execute on function public.odv_rifiuta_da_firma_fea(uuid) to service_role;
