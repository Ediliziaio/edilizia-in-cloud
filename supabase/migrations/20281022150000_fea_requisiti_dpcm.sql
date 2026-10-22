-- Firma elettronica avanzata (FEA): i requisiti del DPCM 22/02/2013 artt. 56-57
-- che si possono soddisfare nel software.
--
-- 1. Documento congelato all'invio (`documento_path`): chi firma vede, e firma,
--    sempre una copia fissata al momento dell'invio; l'impronta si calcola su
--    quella e si ricontrolla alla firma (art. 56 c.1 d, h).
-- 2. Tetti complessivi sul codice OTP per richiesta (codici inviati, errori
--    totali): prima i tentativi si azzeravano a ogni nuovo codice.
-- 3. Sessione di firma: dopo il codice giusto il server dà una chiave segreta,
--    valida 15 minuti, che solo quel browser conosce; senza, non si firma
--    (controllo esclusivo, art. 56 c.1 c).
-- 4. `fea_firmatari`: identificazione del firmatario con un documento di
--    riconoscimento valido e dichiarazione di accettazione delle condizioni del
--    servizio, al primo uso per l'azienda (art. 57 c.1 a). Le immagini del
--    documento stanno nel bucket privato `fea-identita`.
-- 5. Registro di audit concatenato: ogni evento porta l'impronta del precedente
--    della stessa richiesta, così togliere o cambiare una riga si vede.
-- 6. `fea_prove_conservate`: a ogni firma completata il pacchetto delle prove
--    (dati della firma, eventi, identità, dichiarazione, impronte, PDF) va in un
--    archivio senza legami con l'azienda, da conservare 20 anni (art. 57 c.1 b).
--    La purga dell'azienda NON lo tocca (è voluto: la legge chiede 20 anni).
-- Tutto si scrive solo dal server (chiave di servizio); l'app legge.

-- ── 1-3. Richieste di firma ────────────────────────────────────────────────
alter table public.signature_requests
  add column if not exists documento_path text,
  add column if not exists otp_invii integer not null default 0,
  add column if not exists otp_errori_totali integer not null default 0,
  add column if not exists sessione_firma_hash text,
  add column if not exists sessione_firma_scadenza timestamptz,
  add column if not exists firmatario_id uuid;
grant select (documento_path, otp_invii, otp_errori_totali, firmatario_id) on public.signature_requests to authenticated;

-- ── 4. Firmatari identificati ──────────────────────────────────────────────
create table if not exists public.fea_firmatari (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,               -- senza chiave: l'identificazione si conserva 20 anni
  email text not null,
  nome text not null,
  cognome text not null,
  codice_fiscale text,
  documento_tipo text not null check (documento_tipo in ('carta_identita', 'passaporto', 'patente')),
  documento_numero text not null,
  documento_rilasciato_da text,
  documento_scadenza date not null,
  documento_fronte_path text not null,
  documento_retro_path text,
  dichiarazione_versione text not null,
  dichiarazione_hash text not null,
  dichiarazione_accettata_at timestamptz not null default now(),
  identificato_ip inet,
  identificato_user_agent text,
  richiesta_id uuid,
  revocato_at timestamptz,
  conservare_fino date not null default ((now() at time zone 'Europe/Rome')::date + interval '20 years')::date,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_fea_firmatari_attivo on public.fea_firmatari (company_id, lower(email)) where revocato_at is null;
alter table public.fea_firmatari enable row level security;
drop policy if exists fea_firmatari_lettura on public.fea_firmatari;
create policy fea_firmatari_lettura on public.fea_firmatari for select to authenticated
  using (public.e_amministratore_di(company_id) or (select public.has_role(auth.uid(), 'super_admin'::public.app_role)));
revoke all on public.fea_firmatari from anon, authenticated;
grant select on public.fea_firmatari to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fea-identita', 'fea-identita', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;
-- Nessuna policy per gli utenti: scrive e legge solo il server.

-- ── 5. Registro concatenato ────────────────────────────────────────────────
alter table public.fea_audit_log
  add column if not exists hash_precedente text,
  add column if not exists hash_riga text;

create or replace function public.fea_audit_catena()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prec text;
begin
  -- Una richiesta alla volta: due eventi insieme non prendono lo stesso «precedente».
  perform pg_advisory_xact_lock(hashtext(coalesce(new.request_id::text, new.company_id::text)));
  select hash_riga into v_prec from public.fea_audit_log
   where request_id is not distinct from new.request_id and company_id = new.company_id and hash_riga is not null
   order by created_at desc, id desc limit 1;
  -- L'istante vero (non l'inizio della transazione): l'ordine della catena è certo.
  new.created_at := clock_timestamp();
  new.hash_precedente := v_prec;
  new.hash_riga := encode(extensions.digest(
    concat_ws('|', coalesce(v_prec, ''), new.request_id::text, new.company_id::text, new.evento,
              coalesce(host(new.ip), ''), coalesce(new.user_agent, ''), coalesce(new.metadati::text, ''), new.created_at::text),
    'sha256'), 'hex');
  return new;
end;
$$;
drop trigger if exists trg_fea_audit_catena on public.fea_audit_log;
create trigger trg_fea_audit_catena before insert on public.fea_audit_log
  for each row execute function public.fea_audit_catena();
revoke all on function public.fea_audit_catena() from public, anon, authenticated;

-- ── 6. Archivio probatorio (20 anni) ───────────────────────────────────────
create table if not exists public.fea_prove_conservate (
  id uuid primary key default gen_random_uuid(),
  richiesta_id uuid not null unique,      -- senza chiavi: sopravvive a richiesta e azienda
  company_id uuid not null,
  azienda_nome text,
  pacchetto jsonb not null,
  pacchetto_hash text not null,
  pdf_firmato_path text,
  pdf_firmato_hash text,
  conservare_fino date not null default ((now() at time zone 'Europe/Rome')::date + interval '20 years')::date,
  created_at timestamptz not null default now()
);
alter table public.fea_prove_conservate enable row level security;
revoke all on public.fea_prove_conservate from anon, authenticated;

create or replace function public.fea_prove_immutabili()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and old.conservare_fino < (now() at time zone 'Europe/Rome')::date then
    return old; -- conservazione scaduta: si può togliere
  end if;
  raise exception 'Le prove della firma si conservano per 20 anni e non si modificano' using errcode = 'P0001';
end;
$$;
drop trigger if exists trg_fea_prove_immutabili on public.fea_prove_conservate;
create trigger trg_fea_prove_immutabili before update or delete on public.fea_prove_conservate
  for each row execute function public.fea_prove_immutabili();
revoke all on function public.fea_prove_immutabili() from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('fea-conservazione', 'fea-conservazione', false, 52428800)
on conflict (id) do nothing;

-- ── Eventi nuovi del registro ──────────────────────────────────────────────
alter table public.fea_audit_log drop constraint if exists fea_audit_log_evento_check;
alter table public.fea_audit_log add constraint fea_audit_log_evento_check check (evento = any (array[
  'sessione_creata', 'link_inviato', 'link_aperto', 'otp_inviato', 'otp_verificato', 'otp_fallito',
  'documento_visualizzato', 'recesso_accettato', 'clausola_approvata', 'firma_completata', 'firma_rifiutata',
  'certificato_generato', 'email_copia_inviata', 'sessione_scaduta',
  'documento_congelato', 'identita_registrata', 'dichiarazione_accettata', 'tentativi_esauriti', 'prove_conservate']));
