-- Allegati delle fatture: emesse, documenti SDI e ricevute (30/10/2026).
--
-- Come in Fatture in Cloud: alla fattura si allegano i file che le stanno
-- intorno (la contabile del bonifico al fornitore, il DDT, il contratto, le
-- foto), così si ritrovano dalla fattura. Sui documenti mandati allo SDI
-- (documenti_fiscali) un allegato può partire dentro l'XML (<Allegati>, che
-- generateXML sa già scrivere: la colonna documenti_fiscali.allegati non la
-- riempiva nessuno, 0 su 826).
--
-- Una riga, un file, una sola fattura madre: invoices, documenti_fiscali o
-- fatture_ricevute. Li vede e li carica solo chi ha il permesso della
-- fatturazione (non i clienti, che sono profili dell'azienda anche loro: per
-- questo non si usa entity_attachments, aperta a tutta l'azienda).
-- I file stanno nel contenitore privato fatture-allegati, sotto <azienda>/.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create table if not exists public.fattura_allegati (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies(id) on delete cascade,
  invoice_id           uuid references public.invoices(id) on delete cascade,
  documento_fiscale_id uuid references public.documenti_fiscali(id) on delete cascade,
  fattura_ricevuta_id  uuid references public.fatture_ricevute(id) on delete cascade,
  tipo                 text not null default 'altro'
                       check (tipo in ('contabile_pagamento', 'ddt', 'contratto', 'ordine', 'preventivo', 'foto', 'altro')),
  descrizione          text check (descrizione is null or length(descrizione) <= 300),
  file_name            text not null check (length(file_name) between 1 and 200),
  mime_type            text,
  size_bytes           bigint check (size_bytes is null or size_bytes between 1 and 20971520),
  storage_path         text not null unique,
  -- Solo per i documenti SDI: il file parte dentro l'XML della fattura.
  includi_nell_invio   boolean not null default false,
  created_by           uuid default auth.uid(),
  created_at           timestamptz not null default now(),
  constraint fattura_allegati_una_madre check (num_nonnulls(invoice_id, documento_fiscale_id, fattura_ricevuta_id) = 1),
  constraint fattura_allegati_percorso check (storage_path like company_id::text || '/%' and storage_path not like '%..%'),
  constraint fattura_allegati_invio_solo_sdi check (not includi_nell_invio or documento_fiscale_id is not null)
);

create index if not exists fattura_allegati_company_idx on public.fattura_allegati(company_id);
create index if not exists fattura_allegati_invoice_idx on public.fattura_allegati(invoice_id) where invoice_id is not null;
create index if not exists fattura_allegati_documento_idx on public.fattura_allegati(documento_fiscale_id) where documento_fiscale_id is not null;
create index if not exists fattura_allegati_ricevuta_idx on public.fattura_allegati(fattura_ricevuta_id) where fattura_ricevuta_id is not null;
create index if not exists fattura_allegati_created_by_idx on public.fattura_allegati(created_by);

-- La fattura madre deve essere della stessa azienda.
create or replace function public.fattura_allegati_stessa_azienda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.invoice_id is not null and not exists (select 1 from public.invoices i where i.id = new.invoice_id and i.company_id = new.company_id))
     or (new.documento_fiscale_id is not null and not exists (select 1 from public.documenti_fiscali d where d.id = new.documento_fiscale_id and d.company_id = new.company_id))
     or (new.fattura_ricevuta_id is not null and not exists (select 1 from public.fatture_ricevute r where r.id = new.fattura_ricevuta_id and r.company_id = new.company_id)) then
    raise exception using errcode = '42501', message = 'La fattura non è di questa azienda.';
  end if;
  return new;
end $$;
revoke all on function public.fattura_allegati_stessa_azienda() from public, anon, authenticated;

drop trigger if exists fattura_allegati_stessa_azienda on public.fattura_allegati;
create trigger fattura_allegati_stessa_azienda
  before insert or update of company_id, invoice_id, documento_fiscale_id, fattura_ricevuta_id on public.fattura_allegati
  for each row execute function public.fattura_allegati_stessa_azienda();

alter table public.fattura_allegati enable row level security;
revoke all on public.fattura_allegati from public, anon;
grant select, insert, update, delete on public.fattura_allegati to authenticated;
grant all on public.fattura_allegati to service_role;

drop policy if exists fattura_allegati_legge on public.fattura_allegati;
create policy fattura_allegati_legge on public.fattura_allegati for select to authenticated
  using (not (select public.utente_bloccato())
         and company_id = any ((select public.aziende_con_permesso('can_view_billing'))::uuid[]));

drop policy if exists fattura_allegati_aggiunge on public.fattura_allegati;
create policy fattura_allegati_aggiunge on public.fattura_allegati for insert to authenticated
  with check (not (select public.utente_bloccato())
              and company_id = any ((select public.aziende_con_permesso('can_view_billing'))::uuid[])
              and not public.utente_sola_lettura(company_id)
              and created_by = (select auth.uid()));

drop policy if exists fattura_allegati_modifica on public.fattura_allegati;
create policy fattura_allegati_modifica on public.fattura_allegati for update to authenticated
  using (not (select public.utente_bloccato())
         and company_id = any ((select public.aziende_con_permesso('can_view_billing'))::uuid[])
         and not public.utente_sola_lettura(company_id))
  with check (company_id = any ((select public.aziende_con_permesso('can_view_billing'))::uuid[]));

drop policy if exists fattura_allegati_toglie on public.fattura_allegati;
create policy fattura_allegati_toglie on public.fattura_allegati for delete to authenticated
  using (not (select public.utente_bloccato())
         and company_id = any ((select public.aziende_con_permesso('can_view_billing'))::uuid[])
         and not public.utente_sola_lettura(company_id));

-- ─── Contenitore dei file ────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fatture-allegati', 'fatture-allegati', false, 20971520, array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/xml', 'text/xml', 'application/pkcs7-mime', 'text/plain', 'text/csv',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip', 'message/rfc822', 'application/vnd.ms-outlook'
])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists fatture_allegati_file_legge on storage.objects;
create policy fatture_allegati_file_legge on storage.objects for select to authenticated
  using (bucket_id = 'fatture-allegati'
         and not (select public.utente_bloccato())
         and (storage.foldername(name))[1] = any (select unnest(public.aziende_con_permesso('can_view_billing'))::text));

drop policy if exists fatture_allegati_file_carica on storage.objects;
create policy fatture_allegati_file_carica on storage.objects for insert to authenticated
  with check (bucket_id = 'fatture-allegati'
              and not (select public.utente_bloccato())
              and (storage.foldername(name))[1] = any (select unnest(public.aziende_con_permesso('can_view_billing'))::text));

drop policy if exists fatture_allegati_file_toglie on storage.objects;
create policy fatture_allegati_file_toglie on storage.objects for delete to authenticated
  using (bucket_id = 'fatture-allegati'
         and not (select public.utente_bloccato())
         and (storage.foldername(name))[1] = any (select unnest(public.aziende_con_permesso('can_view_billing'))::text));
